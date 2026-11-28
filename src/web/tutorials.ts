/**
 * TUTOR (Tutorials): the rules of the Tutorial bubbles that need no browser. Which bubbles are shown and how, when one
 * disappears, what its Tutorial note says of that, how opening one records it in Tutorial progress, how the Player
 * Turn count grows, and which bubbles the Tutorials section of the Compendium View lists. Tutorials belong to the GUI
 * alone and change no Campaign state: everything here reads and writes Global configuration.
 */
import {
  type CompendiumArticleView,
  type GlobalConfigurationReport,
  type TutorialAnchor,
  type TutorialBubbleView,
} from '../engine/index.ts';

/** The values of TUTOR, Tutorials settings, as Global configuration reports them. */
export interface TutorialSettings {
  readonly on: boolean;
  /** Tutorial bubble lifetime: how many of the Player's Advance turns a bubble stays once opened. */
  readonly lifetime: number;
  readonly playerTurnCount: number;
  /** Tutorial progress: the Player Turn count when each opened bubble was first opened, by TutorialBubble ID. */
  readonly progress: Readonly<Record<string, number>>;
}

/** Tutorial progress read from its stored text; text that is not a valid progress reads as empty. */
export function parseProgress(text: unknown): Readonly<Record<string, number>> {
  if (typeof text !== 'string') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
}

/** TUTOR, Tutorials settings: their effective values; Global configuration already applies the defaults. */
export function tutorialSettings(configuration: GlobalConfigurationReport): TutorialSettings {
  const value = (setting: string) =>
    configuration.settings.find((item) => item.setting === setting)?.effectiveValue;
  const lifetime = value('tutorialBubbleLifetime');
  const count = value('playerTurnCount');
  return {
    on: value('tutorialsOn') !== false,
    lifetime: typeof lifetime === 'number' ? lifetime : 3,
    playerTurnCount: typeof count === 'number' ? count : 0,
    progress: parseProgress(value('tutorialProgress')),
  };
}

/**
 * TUTOR, Showing a bubble: how many more of the Player's Advance turns an opened bubble stays, or null for a bubble
 * never opened, which never disappears. It disappears once the Player Turn count is at least its count in Tutorial
 * progress plus the Tutorial bubble lifetime, i.e. when this is 0 or less.
 */
export function turnsLeft(bubble: string, settings: TutorialSettings): number | null {
  const opened = settings.progress[bubble];
  return opened === undefined ? null : opened + settings.lifetime - settings.playerTurnCount;
}

/** TUTOR, Showing a bubble: whether a bubble has disappeared. */
export function bubbleGone(bubble: string, settings: TutorialSettings): boolean {
  const left = turnsLeft(bubble, settings);
  return left !== null && left <= 0;
}

/**
 * TUTOR, Showing a bubble: whether a bubble is shown beside its anchor, while that part of the screen is shown:
 * exactly when Tutorials on is true, its `visible_when` holds, and it has not disappeared. Under Revealed presentation
 * (GUI, Reveal hidden content) a bubble is shown whatever its `visible_when`, as every Compendium article is.
 */
export function bubbleShown(
  bubble: TutorialBubbleView,
  settings: TutorialSettings,
  revealed: boolean,
): boolean {
  return settings.on && (bubble.visible || revealed) && !bubbleGone(bubble.id, settings);
}

/** TUTOR, Showing a bubble: New until it is in Tutorial progress, Seen once it is. */
export function bubbleLook(bubble: string, settings: TutorialSettings): 'new' | 'seen' {
  return settings.progress[bubble] === undefined ? 'new' : 'seen';
}

/**
 * TUTOR, Tutorial notes, Header row: when the bubble will disappear, "Disappears in N Turns", N being how many of the
 * Player's Advance turns remain, or "Disappears after this Turn" when one remains.
 */
export function expiryText(left: number): string {
  return left <= 1 ? 'Disappears after this Turn' : `Disappears in ${left} Turns`;
}

/**
 * TUTOR, Tutorial notes: opening a bubble that is not yet in Tutorial progress adds it there with the current Player
 * Turn count. Returns the new stored text of Tutorial progress, or null when the bubble is already in it.
 */
export function progressWithOpened(bubble: string, settings: TutorialSettings): string | null {
  if (settings.progress[bubble] !== undefined) {
    return null;
  }
  return JSON.stringify({ ...settings.progress, [bubble]: settings.playerTurnCount });
}

/**
 * TUTOR, Tutorials settings: the Player Turn count after an Advance turn the Player requested through the GUI is
 * committed. Anything else, e.g. an Advance turn an Autopilot AI requested, a rejected one, undo, or loading, leaves it
 * as it is, so that it never decreases.
 */
export function playerTurnCountAfter(count: number, outcome: { readonly committed: boolean } | null): number {
  return outcome?.committed === true ? count + 1 : count;
}

/** The bubble of a Tutorial anchor, or null when the Game build supplies none for it. */
export function bubbleOf(
  bubbles: readonly TutorialBubbleView[] | null,
  anchor: TutorialAnchor,
): TutorialBubbleView | null {
  return bubbles?.find((bubble) => bubble.anchor === anchor) ?? null;
}

/** The text of a bubble as one string: its plain text and Inserted values, in order. */
export function bubbleText(bubble: TutorialBubbleView): string {
  return bubble.text.map((segment) => segment.text).join('');
}

/** COMPV, Article sections: the Article section of the Guide category that lists the bubbles, after Guides. */
export const TUTORIALS = 'Tutorials';

const TUTORIAL_ARTICLE_PREFIX = 'tutorial:';

/**
 * The identifier the Compendium View lists a bubble under. A GDR identifier holds no colon, so it is never that of a
 * Compendium article.
 */
export function tutorialArticleId(bubble: string): string {
  return `${TUTORIAL_ARTICLE_PREFIX}${bubble}`;
}

/** Whether an article of the Compendium View is a bubble of the Tutorials section. */
export function isTutorialArticle(article: { readonly id: string }): boolean {
  return article.id.startsWith(TUTORIAL_ARTICLE_PREFIX);
}

/**
 * TUTOR, Tutorials in the Compendium: every bubble whose `visible_when`, if any, holds in the Current world state,
 * whether or not it has been opened or has disappeared, and whatever Tutorials on is; under Revealed presentation,
 * every bubble. Each is shown as a Guide article is: under its `title`, with its resolved `text` as its body and, when
 * it has an `article` that is listed, that article as its only See also entry. The Compendium View sorts them.
 */
export function tutorialArticles(
  bubbles: readonly TutorialBubbleView[] | null,
  revealed: boolean,
  articles: readonly CompendiumArticleView[],
): CompendiumArticleView[] {
  return (bubbles ?? [])
    .filter((bubble) => revealed || bubble.visible)
    .map((bubble) => {
      const linked = articles.find((article) => article.id === bubble.article);
      return {
        id: tutorialArticleId(bubble.id),
        category: 'guide',
        title: bubble.title,
        subject: null,
        subjectType: null,
        listedUnder: null,
        section: null,
        subjectLead: null,
        body: bubble.text,
        formulas: [],
        seeAlso: linked === undefined ? [] : [{ kind: 'link', text: linked.title, article: linked.id }],
      };
    });
}
