/**
 * COMP (Compendium): Article visibility and Article resolution, both Derived values of the World state they are read
 * in, never stored. No game behavior reads a Compendium article, so nothing here changes Campaign state.
 */
import type { ArticleTemplate, CatalogCompendiumArticle, GdrCatalog } from '../../../gdr/index.ts';
import { leadDiscovered, type LeadWorld } from '../leads/leads.ts';

/**
 * COMP, Article visibility: a Guide article or a Mechanics article is always Player-visible; a Subject article
 * exactly when its subject is Player-visible, as the specification that owns the subject's Type declares it.
 */
export function articleVisible(
  article: CatalogCompendiumArticle,
  world: LeadWorld,
  gdrs: GdrCatalog,
): boolean {
  const subject = article.subject;
  if (article.category !== 'subject' || subject === null || article.subjectType === null) {
    return true;
  }
  const discovered = (leadId: string) => {
    const lead = gdrs.leads.find((item) => item.id === leadId);
    return lead !== undefined && leadDiscovered(lead, world);
  };
  switch (article.subjectType) {
    // AGENT, COMBAT, ECON, Player-visible information: in every World state.
    case 'AgentArchetype':
    case 'EnemyArchetype':
    case 'Weapon':
    case 'Upgrade':
      return true;
    // FACTION, Player-visible information: while a Faction whose Archetype it is exists.
    case 'FactionArchetype':
      return Object.values(world.factions).some((faction) => faction.archetype === subject);
    // LEAD, Player-visible information: once the Lead is discovered.
    case 'Lead':
      return discovered(subject);
    // MISSION, Player-visible information: while a Mission site whose Archetype it is exists, in any lifecycle
    // state, or a discovered Lead creates a Mission site from it.
    case 'MissionSiteArchetype':
      return (
        Object.values(world.missionSites).some((site) => site.archetype === subject) ||
        gdrs.leads.some((lead) => lead.onCompletion.createMissionSite === subject && discovered(lead.id))
      );
    // Player API reports these GDRs in every World state: `getGameData()`, with every BackgroundArtwork, and the
    // Agency, Investigation, and Mission names. A parameter GDR has no `name`, so none can be a subject.
    case 'AgentParameters':
    case 'CombatParameters':
    case 'RecoveryParameters':
    case 'EconomyParameters':
    case 'InvestigationParameters':
    case 'FactionActivityLevel':
    case 'FactionOperationLevel':
    case 'AgencyArchetype':
    case 'InvestigationArchetype':
    case 'MissionArchetype':
    case 'EndingParameters':
    case 'BackgroundArtwork':
      return true;
    // No Player API value includes a Campaign configuration preset or the default-preset choice, nor the GDR
    // `music`, which the Graphical User Interface reads from the Game build.
    case 'CampaignConfiguration':
    case 'ConfigurationParameters':
    case 'MusicParameters':
      return false;
  }
}

/** COMP, Player-visible information: the Player-visible Compendium articles, in Game build order. */
export function visibleArticles(world: LeadWorld, gdrs: GdrCatalog): CatalogCompendiumArticle[] {
  return gdrs.compendiumArticles.filter((article) => articleVisible(article, world, gdrs));
}

/**
 * COMP, Article resolution: one segment of a resolved templated text: plain text, an Inserted value, or an Article
 * link with the identifier of the Player-visible article it links to.
 */
export type ArticleSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly article: string };

/** COMP, Article resolution: the resolved form of one Player-visible article. */
export interface ResolvedArticle {
  readonly article: CatalogCompendiumArticle;
  readonly body: readonly ArticleSegment[];
  readonly formulas: readonly {
    readonly label: readonly ArticleSegment[];
    readonly text: readonly ArticleSegment[];
  }[];
  /** COMP, See also: the Player-visible articles `see_also` names, each an Article link under its displayed title. */
  readonly seeAlso: readonly Extract<ArticleSegment, { kind: 'link' }>[];
}

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;

/** Whether the character that ends just before `position` is a letter or a digit of any script. */
function letterOrDigitBefore(text: string, position: number): boolean {
  if (position <= 0) {
    return false;
  }
  const low = text.charCodeAt(position - 1);
  const pair = low >= 0xdc00 && low <= 0xdfff && position >= 2;
  return LETTER_OR_DIGIT.test(text.slice(position - (pair ? 2 : 1), position));
}

/** Whether the character that starts at `position` is a letter or a digit of any script. */
function letterOrDigitAt(text: string, position: number): boolean {
  const code = text.codePointAt(position);
  return code !== undefined && LETTER_OR_DIGIT.test(String.fromCodePoint(code));
}

interface Term {
  /** The Article term in lower case; see COMP, Displayed title, for equality ignoring case. */
  readonly lower: string;
  readonly length: number;
  readonly article: string;
}

/** The Article terms of the articles in `visible`, by the first character of each in lower case, longest first. */
function termIndex(visible: readonly CatalogCompendiumArticle[]): ReadonlyMap<string, readonly Term[]> {
  const index = new Map<string, Term[]>();
  for (const article of visible) {
    for (const term of article.terms) {
      const lower = term.toLowerCase();
      const first = lower.charAt(0);
      index.set(first, [...(index.get(first) ?? []), { lower, length: term.length, article: article.id }]);
    }
  }
  for (const terms of index.values()) {
    terms.sort((a, b) => b.length - a.length);
  }
  return index;
}

/**
 * COMP, Article links, rules 1 and 2: the longest Article term that matches at `position` of a run of authored text,
 * or null when none does.
 */
function matchAt(run: string, position: number, terms: ReadonlyMap<string, readonly Term[]>): Term | null {
  if (letterOrDigitBefore(run, position)) {
    return null;
  }
  const candidates = terms.get(run.charAt(position).toLowerCase().charAt(0)) ?? [];
  return (
    candidates.find(
      (term) =>
        run.slice(position, position + term.length).toLowerCase() === term.lower &&
        !letterOrDigitAt(run, position + term.length),
    ) ?? null
  );
}

/**
 * COMP, Article resolution: the resolved form of every article in `visible`, the Player-visible articles of one World
 * state. Only their Article terms take part, so each resolves exactly as it would if the Game build did not supply
 * the articles that are not Player-visible.
 */
export function resolveArticles(visible: readonly CatalogCompendiumArticle[]): ResolvedArticle[] {
  const terms = termIndex(visible);
  const titles = new Map(visible.map((article) => [article.id, article.title]));

  return visible.map((article) => {
    // Rule 4, First mention links: an article links to each other article at most once, in scan order.
    const linked = new Set<string>();
    const scan = (run: string): ArticleSegment[] => {
      const segments: ArticleSegment[] = [];
      let plain = '';
      let position = 0;
      while (position < run.length) {
        const match = matchAt(run, position, terms);
        if (match === null) {
          // Rule 3, No overlap: where no Article term matches, the scan continues with the next character.
          plain += run.charAt(position);
          position += 1;
          continue;
        }
        // Rule 5: the text an Article link shows is the matched text as authored.
        const text = run.slice(position, position + match.length);
        position += match.length;
        if (match.article === article.id || linked.has(match.article)) {
          plain += text;
          continue;
        }
        if (plain !== '') {
          segments.push({ kind: 'text', text: plain });
          plain = '';
        }
        linked.add(match.article);
        segments.push({ kind: 'link', text, article: match.article });
      }
      if (plain !== '') {
        segments.push({ kind: 'text', text: plain });
      }
      return segments;
    };
    // Rule 5, Authored text only: the text a Placeholder inserted is never scanned, and no match extends across it.
    const resolve = (template: ArticleTemplate): ArticleSegment[] =>
      template.flatMap((part): ArticleSegment[] => (part.kind === 'text' ? scan(part.text) : [part]));
    // The scan order: the `body`, then each row of `formulas` in authored order, its `label` before its `text`.
    const body = resolve(article.body);
    const formulas = article.formulas.map((row) => {
      const label = resolve(row.label);
      return { label, text: resolve(row.text) };
    });
    const seeAlso = article.seeAlso.flatMap((target) => {
      const title = titles.get(target);
      return title === undefined ? [] : [{ kind: 'link' as const, text: title, article: target }];
    });
    return { article, body, formulas, seeAlso };
  });
}

/**
 * COMP, Player-visible information, Article term lookup: the article in `visible` that has an Article term equal to
 * the text ignoring case, or null when there is none.
 */
export function articleForTerm(
  text: string,
  visible: readonly CatalogCompendiumArticle[],
): CatalogCompendiumArticle | null {
  const lower = text.toLowerCase();
  return visible.find((article) => article.terms.some((term) => term.toLowerCase() === lower)) ?? null;
}
