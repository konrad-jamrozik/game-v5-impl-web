/**
 * COMPV: the rules of the Compendium View that need no browser: its categories, the order and search of its articles,
 * its Article history, and the Data sheet of each kind of subject. Pure presentation over what Player API reports; it
 * replaces no Placeholder and finds no Article link in a resolved text.
 */
import type { CompendiumArticleView, CurrentStateView, GameDataView } from '../engine/index.ts';
import { decimalText } from './format.ts';

export const GUIDE = 'Guide';
export const MECHANICS = 'Mechanics';
/** COMPV, Subject data sheets: the category of a Subject article whose subject has a Type without a Data sheet. */
export const OTHER = 'Other';

/** COMPV, Subject data sheets: the category name and the Data sheet heading of each subject Type. */
const SUBJECT_TYPES: Readonly<Record<string, { readonly category: string; readonly heading: string }>> = {
  AgentArchetype: { category: 'Agents', heading: 'New Agent' },
  EnemyArchetype: { category: 'Enemies', heading: 'Enemy' },
  Weapon: { category: 'Weapons', heading: 'Weapon' },
  Upgrade: { category: 'Upgrades', heading: 'Upgrade' },
  FactionArchetype: { category: 'Factions', heading: 'Faction' },
  Lead: { category: 'Leads', heading: 'Lead' },
  MissionSiteArchetype: { category: 'Mission sites', heading: 'Mission site' },
};

type Article = CompendiumArticleView;

/** COMP, Displayed title: equality and order ignoring case compare the texts in lower case. */
function byTitle(a: Article, b: Article): number {
  const left = a.title.toLowerCase();
  const right = b.title.toLowerCase();
  return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** COMPV, Panes: the category an article is listed under. */
export function categoryOf(article: Article): string {
  if (article.category === 'guide') {
    return GUIDE;
  }
  if (article.category === 'mechanics') {
    return MECHANICS;
  }
  return SUBJECT_TYPES[article.subjectType ?? '']?.category ?? OTHER;
}

/** COMPV, Panes: the articles whose displayed title contains the search text, ignoring case. */
export function searchArticles(articles: readonly Article[], search: string): Article[] {
  const text = search.trim().toLowerCase();
  return articles.filter((article) => text === '' || article.title.toLowerCase().includes(text));
}

/**
 * COMPV, Panes: Guide first, then Mechanics, then the categories of the Subject articles sorted by name, each with the
 * number of its articles; a category with none is left out.
 */
export function compendiumCategories(
  articles: readonly Article[],
): { readonly name: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    counts.set(categoryOf(article), (counts.get(categoryOf(article)) ?? 0) + 1);
  }
  const rank = (name: string) => (name === GUIDE ? 0 : name === MECHANICS ? 1 : 2);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** COMPV, Panes: the articles of one category, sorted by displayed title ignoring case. */
export function articlesOf(articles: readonly Article[], category: string): Article[] {
  return articles.filter((article) => categoryOf(article) === category).sort(byTitle);
}

/** COMPV, Panes: the article selected when the Compendium View opens: the first article of the Guide category. */
export function firstArticle(articles: readonly Article[]): string | null {
  return (
    (articlesOf(articles, GUIDE)[0] ?? articlesOf(articles, compendiumCategories(articles)[0]?.name ?? '')[0])
      ?.id ?? null
  );
}

/**
 * COMPV, Panes: the article the Enter key in the search field shows, i.e. the first article of the first category
 * listed under the search text, or null when no article matches.
 */
export function firstMatchingArticle(articles: readonly Article[], search: string): string | null {
  const matching = searchArticles(articles, search);
  const category = compendiumCategories(matching)[0];
  return category === undefined ? null : (articlesOf(matching, category.name)[0]?.id ?? null);
}

/**
 * COMPV, Following links: the Article history, a list of articles with one of them current, the article shown. It is
 * empty only while no article is Player-visible.
 */
export interface ArticleHistory {
  readonly articles: readonly string[];
  /** The place of the current article in `articles`. */
  readonly current: number;
}

/** COMPV, Following links, Open: the Article history holds only the article selected, which is current. */
export function openHistory(article: string | null): ArticleHistory {
  return article === null ? { articles: [], current: 0 } : { articles: [article], current: 0 };
}

/** The article shown, or null when the Article history is empty. */
export function currentArticle(history: ArticleHistory): string | null {
  return history.articles[history.current] ?? null;
}

/**
 * COMPV, Following links, Show another article: every article after the current one is removed, and the article shown
 * is added at the end and becomes current. Showing the current article again changes nothing.
 */
export function showArticle(history: ArticleHistory, article: string): ArticleHistory {
  if (currentArticle(history) === article) {
    return history;
  }
  const articles = [...history.articles.slice(0, history.current + 1), article];
  return { articles, current: articles.length - 1 };
}

export function hasPreviousArticle(history: ArticleHistory): boolean {
  return history.current > 0;
}

export function hasNextArticle(history: ArticleHistory): boolean {
  return history.current < history.articles.length - 1;
}

/** COMPV, Following links, Previous article: the article before the current one becomes current. */
export function previousArticle(history: ArticleHistory): ArticleHistory {
  return hasPreviousArticle(history) ? { ...history, current: history.current - 1 } : history;
}

/** COMPV, Following links, Next article: the article after the current one becomes current. */
export function nextArticle(history: ArticleHistory): ArticleHistory {
  return hasNextArticle(history) ? { ...history, current: history.current + 1 } : history;
}

/**
 * COMPV, Following links, No longer Player-visible: an article that is no longer Player-visible is removed. When it
 * was the current one, the article before it becomes current, or else the article after it, or else `fallback`, the
 * first article of the Guide category, is shown as in Open. Returns the same Article history when nothing changes.
 */
export function visibleHistory(
  history: ArticleHistory,
  visible: ReadonlySet<string>,
  fallback: string | null,
): ArticleHistory {
  if (history.articles.length === 0) {
    return fallback === null ? history : openHistory(fallback);
  }
  if (history.articles.every((article) => visible.has(article))) {
    return history;
  }
  const kept = history.articles
    .map((article, index) => ({ article, index }))
    .filter((item) => visible.has(item.article));
  if (kept.length === 0) {
    return openHistory(fallback);
  }
  // The current article when it stays, else the last kept article before it, else the first kept article after it.
  const before = kept.findLastIndex((item) => item.index <= history.current);
  return { articles: kept.map((item) => item.article), current: before >= 0 ? before : 0 };
}

/**
 * One piece of a Data sheet value: text, in the Figure style when it is a number, in a tone, or an Article link when
 * `article` names the article it links to.
 */
export interface SheetPart {
  readonly text: string;
  readonly style?: 'figure' | 'muted' | 'good' | 'bad';
  readonly article?: string;
}

export interface SheetRow {
  readonly label: string;
  /** COMPV, Subject data sheets, Labels: the article that the Article term lookup reports for the label, or null. */
  readonly labelArticle: string | null;
  readonly value: readonly SheetPart[];
}

export interface DataSheet {
  readonly heading: string;
  readonly rows: readonly SheetRow[];
}

/** What a Data sheet is built from: everything Player API reports that a Data sheet shows. */
export interface SheetSources {
  readonly gameData: GameDataView;
  readonly state: CurrentStateView;
  /** The Player-visible articles. */
  readonly articles: readonly Article[];
  /** COMP, Article term lookup: the identifier of the Player-visible article with that Article term, or null. */
  readonly articleForTerm: (text: string) => string | null;
}

const SEPARATOR: SheetPart = { text: ' · ' };
const MINUS = '−';

function figure(value: number | string): SheetPart {
  return { text: String(value), style: 'figure' };
}

function joined(items: readonly (readonly SheetPart[])[]): SheetPart[] {
  return items.flatMap((item, index) => (index === 0 ? item : [SEPARATOR, ...item]));
}

/** A value with a plus sign, or with the minus sign U+2212. */
function signed(value: number): string {
  return value < 0 ? `${MINUS}${-value}` : `+${value}`;
}

/**
 * COMPV, Effects shown: the Effects of an Effect list in the order money, funding, Panic, Faction elimination, and
 * defeat, separated by "·", or "None" when it holds none. Panic is shown with two decimals, e.g. "−0.10% Panic", under
 * GUI, Decimal quantities shown, and `defeat` as "Loses the Campaign". A gain for the Player is in Positive and a loss
 * in Danger.
 */
export function effectParts(effects: {
  readonly money?: number;
  readonly funding?: number;
  /** The `panic` value, a Decimal quantity in hundredths of a percentage point; negative lowers Panic. */
  readonly panicHundredths?: number;
  readonly eliminateFaction?: boolean;
  /** Whether a `defeat` Effect loses the Campaign. */
  readonly defeat?: boolean;
}): SheetPart[] {
  const parts: SheetPart[][] = [];
  const tone = (gain: boolean) => (gain ? 'good' : 'bad');
  if (effects.money !== undefined && effects.money !== 0) {
    parts.push([{ text: `${signed(effects.money)} money`, style: tone(effects.money > 0) }]);
  }
  if (effects.funding !== undefined && effects.funding !== 0) {
    parts.push([{ text: `${signed(effects.funding)} funding`, style: tone(effects.funding > 0) }]);
  }
  const panic = effects.panicHundredths;
  if (panic !== undefined && panic !== 0) {
    const sign = panic < 0 ? MINUS : '+';
    parts.push([{ text: `${sign}${decimalText(Math.abs(panic))}% Panic`, style: tone(panic < 0) }]);
  }
  if (effects.eliminateFaction === true) {
    parts.push([{ text: 'Eliminates the Faction', style: 'good' }]);
  }
  if (effects.defeat === true) {
    parts.push([{ text: 'Loses the Campaign', style: 'bad' }]);
  }
  return parts.length === 0 ? [{ text: 'None' }] : joined(parts);
}

/** COMPV, Upgrade data sheet: the wording of one acquisition by the `effect` of the Upgrade. */
const UPGRADE_WORDING: Readonly<Record<string, { readonly rate: boolean; readonly after: string }>> = {
  agent_cap: { rate: false, after: ' to the Agent cap' },
  transport_cap: { rate: false, after: ' to the Transport cap' },
  training_cap: { rate: false, after: ' to the Training cap' },
  agent_weapon_damage: { rate: false, after: ' weapon damage for every Agent' },
  agent_max_health: { rate: false, after: ' max health for every Agent' },
  training_skill_gain: { rate: true, after: ' skill for each turn of Training' },
  exhaustion_recovery: { rate: true, after: ' exhaustion recovered each turn' },
  health_recovery: { rate: true, after: '% of max health recovered each turn' },
};

const INVESTIGATE_AGAIN: Readonly<Record<string, string>> = {
  never: 'Never',
  until_mission_won: 'Until its Mission is won',
  always: 'Always',
};

/**
 * COMPV, Subject data sheets: the Data sheet of a Subject article, or null when the article has none: a Guide article,
 * a Mechanics article, a subject of a Type without a Data sheet, or a Data sheet without a row.
 */
export function dataSheet(article: Article, sources: SheetSources): DataSheet | null {
  const type = SUBJECT_TYPES[article.subjectType ?? ''];
  const subject = article.subject;
  if (article.category !== 'subject' || type === undefined || subject === null) {
    return null;
  }
  const { gameData, state, articles } = sources;
  const aboutSubject = (subjectType: string, id: string) =>
    articles.find((item) => item.subjectType === subjectType && item.subject === id);
  /** Referenced GDRs: shown by its `name`, as an Article link to the Subject article about it when there is one. */
  const reference = (subjectType: string, id: string, name: string): SheetPart => {
    const about = aboutSubject(subjectType, id);
    return about === undefined ? { text: name } : { text: name, article: about.id };
  };
  /** Subject articles listed: each by its displayed title as an Article link, sorted by it and separated by "·". */
  const listed = (subjectType: string | readonly string[], includes: (id: string) => boolean): SheetPart[] =>
    joined(
      articles
        .filter(
          (item) =>
            item.subject !== null &&
            (typeof subjectType === 'string' ? [subjectType] : subjectType).includes(
              item.subjectType ?? '',
            ) &&
            includes(item.subject),
        )
        .sort(byTitle)
        .map((item) => [{ text: item.title, article: item.id }]),
    );
  const weaponValue = (id: string): SheetPart[] => {
    const weapon = gameData.weapons.find((item) => item.id === id);
    return weapon === undefined
      ? []
      : [reference('Weapon', id, weapon.name), { text: ' · damage ' }, figure(weapon.damage)];
  };
  const rows: [string, readonly SheetPart[]][] = [];

  switch (article.subjectType) {
    case 'AgentArchetype': {
      const agent = gameData.agentArchetype;
      if (agent.id === subject) {
        rows.push(['Skill', [figure(agent.skill)]]);
        rows.push(['Health', [figure(agent.baseHealth)]]);
        rows.push(['Weapon', weaponValue(agent.weapon)]);
      }
      break;
    }
    case 'EnemyArchetype': {
      const enemy = gameData.enemyArchetypes.find((item) => item.id === subject);
      if (enemy !== undefined) {
        rows.push(['Skill', [figure(enemy.skill)]]);
        rows.push(['Health', [figure(enemy.baseHealth)]]);
        rows.push(['Weapon', weaponValue(enemy.weapon)]);
        rows.push([
          'Appears at',
          listed(
            'MissionSiteArchetype',
            (id) =>
              gameData.missionSiteArchetypes
                .find((site) => site.id === id)
                ?.enemies.some((item) => item.enemyArchetype === subject) === true,
          ),
        ]);
      }
      break;
    }
    case 'Weapon': {
      const weapon = gameData.weapons.find((item) => item.id === subject);
      if (weapon !== undefined) {
        rows.push(['Damage', [figure(weapon.damage)]]);
        rows.push(['Damage of a hit', [figure(`${weapon.damageOfAHit.min}–${weapon.damageOfAHit.max}`)]]);
        rows.push([
          'Carried by',
          listed(['AgentArchetype', 'EnemyArchetype'], (id) =>
            [gameData.agentArchetype, ...gameData.enemyArchetypes].some(
              (carrier) => carrier.id === id && carrier.weapon === subject,
            ),
          ),
        ]);
      }
      break;
    }
    case 'Upgrade': {
      const upgrade = state.agency.upgrades.find((item) => item.id === subject);
      const wording = UPGRADE_WORDING[upgrade?.effect ?? ''];
      if (upgrade !== undefined) {
        rows.push(['Price', [figure(upgrade.price), { text: ' money' }]]);
        if (wording !== undefined) {
          // GUI, Decimal quantities shown: the Increment of a Rate Upgrade is shown with two decimals.
          const increment = wording.rate
            ? decimalText(upgrade.incrementHundredths)
            : String(upgrade.incrementHundredths / 100);
          rows.push(['Each purchase', [figure(`+${increment}`), { text: wording.after }]]);
        }
      }
      break;
    }
    case 'FactionArchetype':
      rows.push([
        'Leads',
        listed('Lead', (id) =>
          state.leads.some((lead) => lead.id === id && lead.factionArchetype === subject),
        ),
      ]);
      break;
    case 'Lead': {
      const lead = state.leads.find((item) => item.id === subject);
      if (lead !== undefined) {
        // COMPV, Lead data sheet: a Lead without `faction` has no Faction row.
        const archetype = lead.factionArchetype;
        if (archetype !== null) {
          const faction =
            state.factions.find((item) => item.archetype === archetype)?.name ??
            aboutSubject('FactionArchetype', archetype)?.title;
          rows.push([
            'Faction',
            faction === undefined ? [] : [reference('FactionArchetype', archetype, faction)],
          ]);
        }
        rows.push([
          'Required progress',
          typeof lead.requiredProgress === 'number'
            ? [figure(lead.requiredProgress)]
            : [{ text: 'Unknown', style: 'muted' }],
        ]);
        // COMPV, Lead data sheet: a Lead without a `create_mission_site` Effect has no Reveals row.
        const created = lead.createsMissionSite;
        if (created !== null) {
          const site = gameData.missionSiteArchetypes.find((item) => item.id === created);
          rows.push(['Reveals', [reference('MissionSiteArchetype', created, site?.name ?? created)]]);
        }
        // COMPV, Lead data sheet: the `eliminate_faction` and `win_campaign` Effects, each in Positive.
        const completion: SheetPart[][] = [];
        if (lead.eliminatesFaction) {
          completion.push([{ text: 'Eliminates the Faction', style: 'good' }]);
        }
        if (lead.winsCampaign) {
          completion.push([{ text: 'Wins the Campaign', style: 'good' }]);
        }
        if (completion.length > 0) {
          rows.push(['On completion', joined(completion)]);
        }
        rows.push(['Can be investigated again', [{ text: INVESTIGATE_AGAIN[lead.investigateAgain] ?? '' }]]);
      }
      break;
    }
    case 'MissionSiteArchetype': {
      const site = gameData.missionSiteArchetypes.find((item) => item.id === subject);
      if (site !== undefined) {
        const level = gameData.factionOperationLevels.find((item) => item.level === site.operationLevel);
        const response = site.kind === 'response';
        rows.push([
          'Appears',
          response
            ? level === undefined
              ? []
              : [
                  { text: 'When a Faction carries out an operation of level ' },
                  figure(level.level),
                  { text: ` (${level.name})` },
                ]
            : [{ text: 'When an Investigation completes' }],
        ]);
        rows.push(['Expires in', [figure(site.expiresInTurns), { text: ' turns' }]]);
        rows.push([
          'Enemies',
          joined(
            site.enemies.map((item) => {
              const enemy = gameData.enemyArchetypes.find((other) => other.id === item.enemyArchetype);
              return [
                figure(item.count),
                { text: ' × ' },
                reference('EnemyArchetype', item.enemyArchetype, enemy?.name ?? item.enemyArchetype),
              ];
            }),
          ),
        ]);
        if (response) {
          if (level !== undefined) {
            rows.push(['Reward for a win', effectParts(level.onWin)]);
            rows.push([
              'If lost or expired',
              effectParts({
                panicHundredths: level.onIgnoredOrLost.panicIncreaseHundredths,
                funding: level.onIgnoredOrLost.funding,
                defeat: level.onIgnoredOrLost.defeat,
              }),
            ]);
          }
        } else {
          rows.push([
            'Reward for a win',
            effectParts({
              money: site.onWin?.money ?? 0,
              funding: site.onWin?.fundingChange ?? 0,
              panicHundredths:
                (site.onWin?.panicIncreaseHundredths ?? 0) - (site.onWin?.panicReductionHundredths ?? 0),
              eliminateFaction: site.onWin?.eliminatesTargetFaction === true,
            }),
          ]);
          rows.push([
            'Revealed by',
            listed('Lead', (id) =>
              state.leads.some((lead) => lead.id === id && lead.createsMissionSite === subject),
            ),
          ]);
        }
      }
      break;
    }
    default:
      break;
  }
  // Rows: a row whose value is absent or empty is left out, and a Data sheet without a row is left out.
  const kept = rows.filter(([, value]) => value.length > 0 && value.some((part) => part.text !== ''));
  if (kept.length === 0) {
    return null;
  }
  return {
    heading: type.heading,
    rows: kept.map(([label, value]) => ({ label, labelArticle: sources.articleForTerm(label), value })),
  };
}
