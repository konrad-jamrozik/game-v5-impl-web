/**
 * COMPV: the Compendium View. Category tabs and two panes narrow the Player-visible Compendium articles from a category to one
 * article, a search field filters them by displayed title, and Article links lead from one article to the next, with
 * the Article history to return by. The engine returns only the Player-visible articles, each in its resolved form
 * (COMP); this view shows the segments as reported and adds the Data sheet of a Subject article. While Reveal hidden
 * content is on, the snapshot holds the Revealed Compendium instead, so every article counts as Player-visible here,
 * and turning it off removes each article that is not, as No longer Player-visible does.
 */
import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type {
  ArticleSegmentView,
  CompendiumArticleView,
  CurrentLiveWorldStateView,
} from '../../engine/index.ts';
import {
  articlesOf,
  categoryOf,
  compendiumCategories,
  currentArticle,
  dataSheet,
  firstArticle,
  firstMatchingArticle,
  hasNextArticle,
  hasPreviousArticle,
  nextArticle,
  openHistory,
  previousArticle,
  searchArticles,
  showArticle,
  visibleHistory,
  type ArticleHistory,
  type SheetPart,
} from '../compendium.ts';
import { usePlaceState } from '../place.tsx';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { theEngine, type Snapshot } from '../store.ts';
import { typingIn, withShortcut } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

/**
 * COMPV, Article history: while the Compendium View is open, the Q key presses the Previous article button and the W
 * key the Next article button. Pressing the button itself plays its Sound and keeps a disabled button inert; a key
 * typed into the search field, or pressed while a dialog covers the view, presses nothing. COMPV, Panes: the S key
 * gives the search field the keyboard focus and selects its whole text, and is not typed into it; SOUNDS, Main click:
 * giving a text field the keyboard focus plays no Sound.
 */
function useCompendiumKeys(search: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 's') {
        const field = search.current;
        if (field !== null && document.querySelector('.scrim') === null) {
          field.focus();
          field.select();
          event.preventDefault();
        }
        return;
      }
      const testId = key === 'q' ? 'article-previous' : key === 'w' ? 'article-next' : null;
      if (testId === null || document.querySelector('.scrim') !== null) {
        return;
      }
      const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
      if (button !== null && !button.disabled) {
        button.click();
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [search]);
}

/**
 * COMPV, Panes: while the search field holds text, the Escape key clears it, wherever the keyboard focus is, and keeps
 * the article shown; it then neither closes the Compendium View nor goes back. It listens before the Campaign screen
 * does, so that the Campaign screen never sees that Escape. A key pressed while a dialog covers the view does nothing
 * here. SOUNDS, Go back: the Escape key cancelling the search plays `go-back-click`.
 */
function useEscapeClearsSearch(search: string, clear: () => void): void {
  useEffect(() => {
    if (search === '') {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.scrim') !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playSound(SOUND.back);
      clear();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [search, clear]);
}

/**
 * COMPV, Following links: an Article link, drawn as the text around it with an underline. SOUNDS, Select click, Article
 * link: selecting it selects the article it links to, as selecting it in the Articles pane does.
 */
function ArticleLink(props: { article: string; text: string; onOpen: (article: string) => void }) {
  return (
    <button
      type="button"
      className="article-link"
      data-sound="select"
      data-article={props.article}
      onClick={() => {
        props.onOpen(props.article);
      }}
    >
      {props.text}
    </button>
  );
}

/**
 * COMPV, Article pane: a resolved text, segment by segment: plain text and inserted values as they are, with nothing
 * that sets an inserted value apart, and each Article link as a link. GUI, Decimal quantities shown: an inserted value
 * is shown as reported and never rounded.
 */
function Segments(props: { segments: readonly ArticleSegmentView[]; onOpen: (article: string) => void }) {
  return (
    <>
      {props.segments.map((segment, index) =>
        segment.kind === 'link' ? (
          <ArticleLink key={index} article={segment.article} text={segment.text} onOpen={props.onOpen} />
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

const PART_CLASS: Record<NonNullable<SheetPart['style']>, string> = {
  figure: 'figure',
  muted: 'muted',
  good: 'tone-good',
  bad: 'tone-bad',
};

function SheetParts(props: { parts: readonly SheetPart[]; onOpen: (article: string) => void }) {
  return (
    <>
      {props.parts.map((part, index) =>
        part.article !== undefined ? (
          <ArticleLink key={index} article={part.article} text={part.text} onOpen={props.onOpen} />
        ) : part.style === undefined ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <span key={index} className={PART_CLASS[part.style]}>
            {part.text}
          </span>
        ),
      )}
    </>
  );
}

/** COMPV, Subject data sheets, Items: a value that lists two or more items shows each item on a line of its own. */
function SheetValue(props: { parts: readonly SheetPart[]; onOpen: (article: string) => void }) {
  const items: SheetPart[][] = [[]];
  for (const part of props.parts) {
    if (part.separator === true) {
      items.push([]);
    } else {
      items[items.length - 1]?.push(part);
    }
  }
  return (
    <>
      {items.map((item, index) => (
        <span key={index} className="sheet-item">
          <SheetParts parts={item} onOpen={props.onOpen} />
        </span>
      ))}
    </>
  );
}

/**
 * COMPV, Article pane: the colour and the drawing, in a 100 × 100 box, of the Article art placeholder of each category,
 * as the page "Compendium Image Slot" shows them; a category not named here, e.g. Other, uses the last entry.
 */
/**
 * One pistol pointing right in the 100 × 100 box: the slide, the grip raked back, and the trigger guard. Its barrel
 * passes through (50, 42) near the muzzle, where the two pistols of the Combat placeholder cross.
 */
const PISTOL = 'M8 36h56v12H8zM12 48h13l-6 24H6zM25 48v6a5 5 0 0 0 10 0v-6';

const ART_PLACEHOLDERS: Record<string, { color: string; glyph: ReactNode }> = {
  Guide: {
    color: 'var(--text-muted)',
    glyph: (
      <path d="M50 26c-10-8-24-10-36-8v58c12-2 26 0 36 8 10-8 24-10 36-8V18c-12-2-26 0-36 8zM50 26v58" />
    ),
  },
  Mechanics: {
    color: 'var(--brass)',
    glyph: (
      <>
        <circle cx="50" cy="50" r="13" />
        <circle cx="50" cy="50" r="31" />
        <path d="M50 8v11M50 81v11M8 50h11M81 50h11M20 20l8 8M72 72l8 8M80 20l-8 8M28 72l-8 8" />
      </>
    ),
  },
  Agents: {
    color: 'var(--notice)',
    glyph: (
      <>
        <circle cx="50" cy="32" r="16" />
        <path d="M16 90c0-21 15-34 34-34s34 13 34 34" />
      </>
    ),
  },
  // Two crossed pistols, muzzles up and outward, barrels crossing at the centre: one pistol, tilted, and its mirror.
  Combat: {
    color: 'var(--tracer-red)',
    glyph: (
      <>
        <path transform="rotate(-40 50 42)" d={PISTOL} />
        <path transform="translate(100 0) scale(-1 1) rotate(-40 50 42)" d={PISTOL} />
      </>
    ),
  },
  Armor: {
    color: 'var(--positive)',
    glyph: <path d="M50 10l32 12v26c0 22-14 36-32 44-18-8-32-22-32-44V22zM50 22v58" />,
  },
  Enemies: {
    color: 'var(--danger)',
    glyph: <path d="M50 10c-19 0-29 17-29 36v44h58V46c0-19-10-36-29-36zM36 48l10 5M64 48l-10 5M38 70h24" />,
  },
  Factions: {
    color: 'var(--investigation)',
    glyph: <path d="M28 92V10M28 14h48l-11 17 11 17H28" />,
  },
  Leads: {
    color: 'var(--beam)',
    glyph: <path d="M26 14h36l14 14v58H26zM62 14v14h14M36 46h30M36 58h30M36 70h18" />,
  },
  'Mission sites': {
    color: 'var(--warning)',
    glyph: (
      <>
        <path d="M50 90S22 58 22 38a28 28 0 0 1 56 0c0 20-28 52-28 52z" />
        <circle cx="50" cy="38" r="10" />
      </>
    ),
  },
  Upgrades: {
    color: 'var(--accent)',
    glyph: <path d="M22 60l28-26 28 26M22 82l28-26 28 26M28 18h44" />,
  },
  Weapons: {
    color: 'var(--enemy-amber)',
    glyph: (
      <>
        <circle cx="50" cy="50" r="30" />
        <circle cx="50" cy="50" r="4" />
        <path d="M50 8v24M50 68v24M8 50h24M68 50h24" />
      </>
    ),
  },
  Other: {
    color: 'var(--text-muted)',
    glyph: (
      <path d="M50 26c-10-8-24-10-36-8v58c12-2 26 0 36 8 10-8 24-10 36-8V18c-12-2-26 0-36 8zM50 26v58" />
    ),
  },
};

/**
 * COMPV, Article pane: the Article art of a Subject article. No picture exists yet, so it is the placeholder of the
 * article's category: a wash and a line glyph in the category's colour over a faint grid, with crop marks at the
 * picture's corners, its left part fading into the pane. Decoration only, hidden from assistive technology.
 */
function ArticleArt(props: { category: string }) {
  const art = ART_PLACEHOLDERS[props.category] ?? ART_PLACEHOLDERS.Other;
  return (
    <div
      className="article-art"
      data-testid="article-art"
      data-category={props.category}
      aria-hidden="true"
      style={{ ['--kind' as string]: art?.color }}
    >
      <div className="article-art-wash" />
      <svg className="article-art-glyph" viewBox="0 0 100 100" fill="none" stroke="currentColor">
        {art?.glyph}
      </svg>
      <div className="article-art-fade" />
      <span className="article-art-crop article-art-crop-tl" />
      <span className="article-art-crop article-art-crop-tr" />
      <span className="article-art-crop article-art-crop-bl" />
      <span className="article-art-crop article-art-crop-br" />
    </div>
  );
}

export function CompendiumView(props: {
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  onClose: () => void;
}) {
  const { snapshot, state } = props;
  const all: readonly CompendiumArticleView[] = snapshot.articles ?? [];
  const searchField = useRef<HTMLInputElement>(null);
  useCompendiumKeys(searchField);
  // CSCR, View trail: the search text and the Article history are part of the place of the Compendium View.
  const [search, setSearch] = usePlaceState('search', '');
  useEscapeClearsSearch(search, () => {
    setSearch('');
  });
  const [stored, setHistory] = usePlaceState<ArticleHistory>('history', openHistory(firstArticle(all)));
  // COMPV, Following links, No longer Player-visible: e.g. after an undo, an article leaves the Article history.
  const history = visibleHistory(stored, new Set(all.map((item) => item.id)), firstArticle(all));
  if (history !== stored) {
    setHistory(history);
  }
  const article = all.find((item) => item.id === currentArticle(history)) ?? null;
  // COMPV, Article pane: every article has Article art, the placeholder of its category.
  const artCategory = article === null ? null : categoryOf(article);

  const matching = searchArticles(all, search);
  // COMPV, Panes, Category tabs: a tab for every category with a Player-visible article, whatever the search text;
  // while the search leaves a category without a match, its tab is disabled and dimmed but keeps its place.
  const tabs = compendiumCategories(all);
  const matched = new Set(compendiumCategories(matching).map((category) => category.name));
  // The category of the article shown is selected; while the search leaves it without a match, the first category
  // with a match is listed.
  const selected = article === null ? null : categoryOf(article);
  const shownCategory =
    selected !== null && matched.has(selected)
      ? selected
      : (tabs.find((category) => matched.has(category.name))?.name ?? null);
  const listed = shownCategory === null ? [] : articlesOf(matching, shownCategory);

  /** COMPV, Following links, Show another article. */
  const show = (id: string) => {
    setHistory(showArticle(history, id));
  };
  /**
   * COMPV, Following links: selecting an Article link shows the article it links to, which selects its category and
   * the article, and clears the search field when the article would not be listed under its text.
   */
  const open = (id: string) => {
    if (!matching.some((item) => item.id === id)) {
      setSearch('');
    }
    show(id);
  };
  const sheet =
    article === null || snapshot.gameData === null || snapshot.retired === null
      ? null
      : dataSheet(article, {
          gameData: snapshot.gameData,
          state,
          retired: snapshot.retired,
          articles: all,
          // COMPV: under Revealed presentation, the Article term lookup of the Revealed Compendium.
          articleForTerm: (text) => {
            if (snapshot.revealedTerms !== null) {
              return snapshot.revealedTerms[text.toLowerCase()] ?? null;
            }
            const found = theEngine().player.queries.getArticleForTerm(text);
            return found.ok ? found.value : null;
          },
        });

  return (
    <DetailView
      id="compendium"
      title="Compendium"
      escapeTaken={search !== ''}
      lead={
        // COMPV, Panes, Category tabs: one row in the title row, between the title and the search field, without
        // counts; it scrolls sideways when it is wider than its room and never wraps.
        <div className="compendium-tabs" role="tablist" data-testid="compendium-categories">
          {tabs.map((category) => (
            <button
              key={category.name}
              type="button"
              role="tab"
              aria-selected={category.name === shownCategory}
              className={`compendium-tab${category.name === shownCategory ? ' compendium-tab-on' : ''}`}
              data-testid={`compendium-category-${category.name}`}
              data-sound="select"
              disabled={!matched.has(category.name)}
              onClick={() => {
                // Selecting a category shows the first article of that category.
                const first = articlesOf(matching, category.name)[0];
                if (first !== undefined) {
                  show(first.id);
                }
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      }
      actions={
        // COMPV, Panes: the search field has no visible label; its accessible name is "Search".
        <input
          ref={searchField}
          type="search"
          className="search"
          placeholder="Search titles (S)"
          aria-label="Search"
          data-testid="compendium-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            // COMPV, Panes: Enter shows the first article listed under the search text and moves the keyboard focus
            // out of the search field, keeping its text; with no match it does nothing. SOUNDS, Select click, Search.
            if (event.key !== 'Enter') {
              return;
            }
            event.preventDefault();
            const first = firstMatchingArticle(all, search);
            if (first === null) {
              return;
            }
            playSound(SOUND.select);
            show(first);
            event.currentTarget.blur();
          }}
        />
      }
      onClose={props.onClose}
    >
      <div className="panes panes-compendium">
        <div className="pane pane-list" data-testid="compendium-articles">
          {shownCategory === null ? <p className="muted">No article matches.</p> : null}
          {listed.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`list-row${item.id === article?.id ? ' list-row-on' : ''}`}
              data-testid={`article-${item.id}`}
              data-sound="select"
              onClick={() => {
                show(item.id);
              }}
            >
              <span className="list-name">{item.title}</span>
            </button>
          ))}
        </div>
        <article
          className={`pane pane-article${artCategory === null ? '' : ' with-article-art'}`}
          data-testid="compendium-article"
          data-article={article?.id}
        >
          {artCategory === null ? null : <ArticleArt category={artCategory} />}
          {article === null ? null : (
            <div className="article-scroll">
              <div className="article-head">
                <h4 className="pane-title" data-testid="article-title">
                  {article.title}
                </h4>
                <div className="article-history">
                  <button
                    type="button"
                    className="btn btn-plain icon-button"
                    aria-label="Previous article"
                    title={withShortcut('Previous article', 'Q')}
                    data-testid="article-previous"
                    data-sound="select"
                    disabled={!hasPreviousArticle(history)}
                    onClick={() => {
                      setHistory(previousArticle(history));
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain icon-button"
                    aria-label="Next article"
                    title={withShortcut('Next article', 'W')}
                    data-testid="article-next"
                    data-sound="select"
                    disabled={!hasNextArticle(history)}
                    onClick={() => {
                      setHistory(nextArticle(history));
                    }}
                  >
                    →
                  </button>
                </div>
              </div>
              <div className="article-parts">
                <p className="article-body" data-testid="article-body">
                  <Segments segments={article.body} onOpen={open} />
                </p>
                {article.formulas.length === 0 ? null : (
                  <>
                    <h4 className="pane-title pane-sub">Formulas</h4>
                    {/* COMPV, Article pane, Formulas: each label above its text, as in a Data sheet. */}
                    <dl className="data-sheet" data-testid="article-formulas">
                      {article.formulas.map((row, index) => (
                        <div key={index} className="data-sheet-row">
                          <dt>
                            <Segments segments={row.label} onOpen={open} />
                          </dt>
                          <dd>
                            <Segments segments={row.text} onOpen={open} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                {sheet === null ? null : (
                  <>
                    <h4 className="pane-title pane-sub">{sheet.heading}</h4>
                    {/* COMPV, Subject data sheets: each label above its value. */}
                    <dl className="data-sheet" data-testid="article-data-sheet">
                      {sheet.rows.map((row) => (
                        <div key={row.label} className="data-sheet-row">
                          <dt>
                            {row.labelArticle === null ? (
                              row.label
                            ) : (
                              <ArticleLink article={row.labelArticle} text={row.label} onOpen={open} />
                            )}
                          </dt>
                          <dd>
                            <SheetValue parts={row.value} onOpen={open} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                {article.seeAlso.length === 0 ? null : (
                  <>
                    <h4 className="pane-title pane-sub">See also</h4>
                    <p className="see-also" data-testid="article-see-also">
                      {article.seeAlso.map((link, index) => (
                        <Fragment key={link.article}>
                          {index === 0 ? null : ' · '}
                          <ArticleLink article={link.article} text={link.text} onOpen={open} />
                        </Fragment>
                      ))}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </article>
      </div>
    </DetailView>
  );
}
