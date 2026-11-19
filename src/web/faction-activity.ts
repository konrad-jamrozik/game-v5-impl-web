/**
 * The two values the GUI derives from the Response Mission sites the Factions produced: the status bar's Turns since
 * last faction activity (CSCR, Status bar values) and the series of each Faction chart (CVIEW, Faction charts). Both
 * read every Response Mission site, whatever its lifecycle state, through its kind, target Faction, and Turn created,
 * which are Player-visible under MISSION, Player-visible information.
 */
import type { MissionSiteView } from '../engine/index.ts';

type Site = Pick<MissionSiteView, 'kind' | 'targetFaction' | 'turnCreated'>;

/**
 * CSCR, Status bar values, 6: the current Turn number minus 1 minus the greatest Turn created of any Response Mission
 * site, or the current Turn number minus 1 before any exists. It is 0 in the Turn after the Advance turn that created
 * a Response Mission site.
 */
export function turnsSinceLastFactionActivity(turn: number, sites: readonly Site[]): number {
  let latest = 0;
  for (const site of sites) {
    if (site.kind === 'Response' && site.turnCreated > latest) {
      latest = site.turnCreated;
    }
  }
  return turn - 1 - latest;
}

/**
 * CVIEW, Faction charts: for each Turn from 1 to `turn`, the number of Response Mission sites targeting `faction` whose
 * Turn created is less than that Turn, i.e. the total the Faction produced by the start of that Turn.
 */
export function responseSitesSeries(
  faction: string,
  turn: number,
  sites: readonly Site[],
): { turn: number; value: number }[] {
  const created = sites
    .filter((site) => site.kind === 'Response' && site.targetFaction === faction)
    .map((site) => site.turnCreated);
  return Array.from({ length: turn }, (_, index) => {
    const t = index + 1;
    return { turn: t, value: created.filter((value) => value < t).length };
  });
}
