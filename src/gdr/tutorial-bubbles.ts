/**
 * TUTOR (Tutorials): the Tutorial anchors the GUI offers, and the rules that relate the TutorialBubble GDRs to the
 * rest of the Game build. A bubble's `text` is templated text whose Placeholders are replaced as in a Compendium
 * article (COMP, Placeholders), once, when the catalog is built.
 */
import {
  gdrsById,
  leadsNamed,
  resolveTemplate,
  usesFactionCondition,
  type RawGdr,
} from './compendium-articles.ts';
import type { CatalogTutorialBubble, SpecialEventPointIcon, TutorialBubbleGdr } from './types.ts';

/**
 * TUTOR, Tutorial anchors: every Tutorial anchor the GUI offers, in the order of the table, which is also the order in
 * which the Tutorials category of the Compendium View lists the bubbles.
 */
export const TUTORIAL_ANCHORS = [
  'tutorial_intro.bubble',
  'campaign_screen.panic',
  'campaign_screen.advance_turn',
  'campaign_screen.operations',
  'campaign_screen.situation',
  'agents_view.hire',
  'agents_view.assign_to',
  'agents_view.equip',
  'agents_view.exhaustion_column',
] as const;

export type TutorialAnchor = (typeof TUTORIAL_ANCHORS)[number];

/** TSUM, Special events: the icons a point of a Special event may name. */
export const SPECIAL_EVENT_POINT_ICONS: readonly SpecialEventPointIcon[] = [
  'agents',
  'support',
  'objective',
  'bubble',
  'records',
  'compendium',
];

/**
 * TUTOR, TutorialBubble: the rules that relate bubbles to each other and to the Game build. Each `anchor` is a Tutorial
 * anchor and no two bubbles share one, each `article` names a CompendiumArticle, and each `visible_when` uses only the
 * Condition kinds of a CompendiumArticle's `visible_when`, i.e. `lead_completed` with a Lead of the Game build. Returns
 * each bubble with every Placeholder of its `text` replaced.
 */
export function validateTutorialBubbles(
  bubbles: readonly TutorialBubbleGdr[],
  gdrs: readonly RawGdr[],
  articleIds: ReadonlySet<string>,
  problems: string[],
): CatalogTutorialBubble[] {
  const byId = gdrsById(gdrs);
  const anchors = new Set<string>();
  return bubbles.map((bubble) => {
    const report = (message: string) => {
      problems.push(`TutorialBubble ${bubble.id}: ${message}`);
    };
    if (!(TUTORIAL_ANCHORS as readonly string[]).includes(bubble.anchor)) {
      report(`anchor ${bubble.anchor} is not a Tutorial anchor`);
    }
    if (anchors.has(bubble.anchor)) {
      report(`a second TutorialBubble has anchor ${bubble.anchor}`);
    }
    anchors.add(bubble.anchor);
    if (bubble.article !== null && !articleIds.has(bubble.article)) {
      report(`article ${bubble.article} is not a CompendiumArticle`);
    }
    if (bubble.visibleWhen !== null) {
      if (usesFactionCondition(bubble.visibleWhen)) {
        report('Visibility Condition is valid');
      }
      for (const lead of leadsNamed(bubble.visibleWhen)) {
        if (!(byId.get(lead) ?? []).some((gdr) => gdr['type'] === 'Lead')) {
          report(`Visibility Condition is valid (${lead})`);
        }
      }
    }
    return { ...bubble, text: resolveTemplate(bubble.text, null, byId, report) };
  });
}
