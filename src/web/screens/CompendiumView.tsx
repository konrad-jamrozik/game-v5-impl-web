/**
 * COMPV: the Compendium View. Three panes narrow the Player-visible Compendium articles from a category to one
 * article, a search field filters them by displayed title, and Article links lead from one article to the next, with
 * the Article history to return by. The engine returns only the Player-visible articles, each in its resolved form
 * (COMP); this view shows the segments as reported and adds the Data sheet of a Subject article. While Reveal hidden
 * content is on, the snapshot holds the Revealed Compendium instead, so every article counts as Player-visible here,
 * and turning it off removes each article that is not, as No longer Player-visible does.
 */
import { Fragment, useEffect, useRef, type RefObject } from 'react';
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
import { typingIn } from '../ui.tsx';
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
  const [stored, setHistory] = usePlaceState<ArticleHistory>('history', openHistory(firstArticle(all)));
  // COMPV, Following links, No longer Player-visible: e.g. after an undo, an article leaves the Article history.
  const history = visibleHistory(stored, new Set(all.map((item) => item.id)), firstArticle(all));
  if (history !== stored) {
    setHistory(history);
  }
  const article = all.find((item) => item.id === currentArticle(history)) ?? null;

  const matching = searchArticles(all, search);
  const categories = compendiumCategories(matching);
  // The category of the article shown is selected; while the search leaves it out, the first category is listed.
  const selected = article === null ? null : categoryOf(article);
  const shownCategory =
    categories.find((category) => category.name === selected)?.name ?? categories[0]?.name ?? null;
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
      actions={
        <label className="search-field">
          <span className="muted">Search</span>
          <input
            ref={searchField}
            type="search"
            className="search"
            placeholder="Title (press S)"
            aria-label="Search the Compendium by title"
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
        </label>
      }
      onClose={props.onClose}
    >
      <div className="panes panes-compendium">
        <div className="pane pane-list" data-testid="compendium-categories">
          {categories.length === 0 ? <p className="muted">No article matches.</p> : null}
          {categories.map((category) => (
            <button
              key={category.name}
              type="button"
              className={`list-row${category.name === shownCategory ? ' list-row-on' : ''}`}
              data-testid={`compendium-category-${category.name}`}
              data-sound="select"
              onClick={() => {
                // Selecting a category shows the first article of that category.
                const first = articlesOf(matching, category.name)[0];
                if (first !== undefined) {
                  show(first.id);
                }
              }}
            >
              <span className="list-name">{category.name}</span>
              <span className="list-value figure muted">{category.count}</span>
            </button>
          ))}
        </div>
        <div className="pane pane-list" data-testid="compendium-articles">
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
        <article className="pane pane-article" data-testid="compendium-article" data-article={article?.id}>
          {article === null ? null : (
            <>
              <div className="article-head">
                <h4 className="pane-title" data-testid="article-title">
                  {article.title}
                </h4>
                <div className="article-history">
                  <button
                    type="button"
                    className="btn btn-plain icon-button"
                    aria-label="Previous article"
                    title="Previous article"
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
                    title="Next article"
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
              <p className="article-body" data-testid="article-body">
                <Segments segments={article.body} onOpen={open} />
              </p>
              {article.formulas.length === 0 ? null : (
                <>
                  <h4 className="pane-title pane-sub">Formulas</h4>
                  <table className="sheet" data-testid="article-formulas">
                    <tbody>
                      {article.formulas.map((row, index) => (
                        <tr key={index}>
                          <th scope="row">
                            <Segments segments={row.label} onOpen={open} />
                          </th>
                          <td>
                            <Segments segments={row.text} onOpen={open} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {sheet === null ? null : (
                <>
                  <h4 className="pane-title pane-sub">{sheet.heading}</h4>
                  <table className="sheet" data-testid="article-data-sheet">
                    <tbody>
                      {sheet.rows.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">
                            {row.labelArticle === null ? (
                              row.label
                            ) : (
                              <ArticleLink article={row.labelArticle} text={row.label} onOpen={open} />
                            )}
                          </th>
                          <td>
                            <SheetParts parts={row.value} onOpen={open} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
            </>
          )}
        </article>
      </div>
    </DetailView>
  );
}
