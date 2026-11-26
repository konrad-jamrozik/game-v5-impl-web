/**
 * LVIEW, Selected Lead: what a Lead's completion does, one line for each Effect of its `on_completion`. Pure
 * presentation over the Player API views; no gameplay rule.
 */
import type { CurrentLiveWorldStateView, GameDataView, LeadView } from '../engine/index.ts';
import { groupDigits } from './format.ts';

/** The name of the Faction a Lead concerns, or its FactionArchetype when no Faction of the Campaign has it. */
export function leadFactionName(
  lead: LeadView,
  state: Pick<CurrentLiveWorldStateView, 'factions'>,
): string | null {
  if (lead.factionArchetype === null) {
    return null;
  }
  return (
    state.factions.find((item) => item.id === lead.faction)?.name ??
    state.factions.find((item) => item.archetype === lead.factionArchetype)?.name ??
    lead.factionArchetype
  );
}

/**
 * One line of the "On completion" group: its text, with the name it gives in `strong`, e.g. "Creates the Mission site"
 * and "Apprehend member" and " · 3 Enemies".
 */
export interface OnCompletionLine {
  readonly key: 'site' | 'eliminate' | 'contracting' | 'win';
  readonly before: string;
  readonly strong: string;
  readonly after: string;
  readonly good: boolean;
}

/** The text of a line as one string, e.g. "Creates the Mission site Apprehend member · 3 Enemies". */
export function onCompletionText(line: OnCompletionLine): string {
  return `${line.before}${line.strong}${line.after}`;
}

/**
 * LVIEW, Selected Lead: one line for each Effect of the Lead's `on_completion`, in the order the specification lists
 * them: the Mission site it creates with its MissionSiteArchetype's `name` and its number of Enemies; its Faction made
 * Eliminated, in Positive; Contracting unlocked, with the Contracting cap it opens, in Positive; and the Campaign
 * won, in Positive. An empty `on_completion` gives no line.
 */
export function onCompletionLines(
  lead: LeadView,
  gameData: Pick<GameDataView, 'missionSiteArchetypes' | 'economy'> | null,
  state: Pick<CurrentLiveWorldStateView, 'factions'>,
): OnCompletionLine[] {
  const lines: OnCompletionLine[] = [];
  const site = lead.createsMissionSite;
  if (site !== null) {
    const archetype = gameData?.missionSiteArchetypes.find((item) => item.id === site);
    const enemies = archetype?.enemies.reduce((sum, item) => sum + item.count, 0);
    lines.push({
      key: 'site',
      before: 'Creates the Mission site ',
      strong: archetype?.name ?? site,
      after: enemies === undefined ? '' : ` · ${groupDigits(enemies)} ${enemies === 1 ? 'Enemy' : 'Enemies'}`,
      good: false,
    });
  }
  if (lead.eliminatesFaction) {
    lines.push({
      key: 'eliminate',
      before: 'Eliminates ',
      strong: leadFactionName(lead, state) ?? 'its Faction',
      after: '',
      good: true,
    });
  }
  if (lead.unlocksContracting) {
    const places = gameData?.economy['baseContractingCap'];
    lines.push({
      key: 'contracting',
      before: 'Unlocks Contracting',
      strong: '',
      after: places === undefined ? '' : ` · ${groupDigits(places)} ${places === 1 ? 'place' : 'places'}`,
      good: true,
    });
  }
  if (lead.winsCampaign) {
    lines.push({ key: 'win', before: 'Wins the Campaign', strong: '', after: '', good: true });
  }
  return lines;
}
