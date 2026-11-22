/**
 * COND (Conditions): evaluating a Condition that a GDR declares, and the two Condition kinds of the game, which their
 * owning specifications define: `mission_won` (MISSION, Mission won Condition kind) and `lead_completed` (LEAD, Lead
 * completed Condition kind). Evaluation reads one World state and changes nothing.
 */
import type { Condition } from '../../../gdr/index.ts';
import type { Investigation, Mission, MissionSite } from '../../state/types.ts';

/** The parts of a World state that the Condition kinds read. */
export interface ConditionWorld {
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly missions: Readonly<Record<string, Mission>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
}

/** The supplied inputs of an evaluation: the Faction, by Instance ID, that every `mission_won` Condition reads. */
export interface ConditionInputs {
  readonly faction: string | null;
  /**
   * The Won Missions of the same World state from `wonMissionIndex`, when the caller evaluates many Conditions against
   * one unchanging World state; without it each `mission_won` reads every Mission.
   */
  readonly won?: WonMissionIndex;
}

/** The Won Missions of a World state, as `wonKey` of each one's MissionSiteArchetype and target Faction. */
export type WonMissionIndex = ReadonlySet<string>;

const wonKey = (missionSiteArchetype: string, faction: string | null): string =>
  `${missionSiteArchetype}|${faction ?? ''}`;

/** The Won Missions of a World state, read once for evaluating many Conditions against it. */
export function wonMissionIndex(world: ConditionWorld): WonMissionIndex {
  const index = new Set<string>();
  for (const mission of Object.values(world.missions)) {
    const site = world.missionSites[mission.constants.missionSite];
    if (mission.state.lifecycle === 'Won' && site !== undefined) {
      index.add(wonKey(site.archetype, site.constants.targetFaction));
    }
  }
  return index;
}

/**
 * MISSION, Mission won Condition kind: at least one Mission is Won whose Mission site has the MissionSiteArchetype and
 * the supplied Faction as its target Faction, whichever Lead, if any, created the Mission site.
 */
export function missionWonHolds(
  missionSiteArchetype: string,
  faction: string | null,
  world: ConditionWorld,
  won?: WonMissionIndex,
): boolean {
  if (won !== undefined) {
    return won.has(wonKey(missionSiteArchetype, faction));
  }
  return Object.values(world.missions).some((mission) => {
    const site = world.missionSites[mission.constants.missionSite];
    return (
      mission.state.lifecycle === 'Won' &&
      site !== undefined &&
      site.archetype === missionSiteArchetype &&
      site.constants.targetFaction === faction
    );
  });
}

/** LEAD, Lead completed Condition kind: the Lead is a Completed Lead, i.e. has a Completed Investigation. */
export function leadCompletedHolds(lead: string, world: ConditionWorld): boolean {
  return Object.values(world.investigations).some(
    (item) => item.constants.lead === lead && item.state.lifecycle === 'Completed',
  );
}

/** COND, Condition format and Evaluating a Condition: whether the Condition holds in the given World state. */
export function conditionHolds(
  condition: Condition,
  world: ConditionWorld,
  inputs: ConditionInputs,
): boolean {
  switch (condition.kind) {
    case 'all':
      return condition.conditions.every((item) => conditionHolds(item, world, inputs));
    case 'any':
      return condition.conditions.some((item) => conditionHolds(item, world, inputs));
    case 'not':
      return !conditionHolds(condition.condition, world, inputs);
    case 'mission_won':
      return missionWonHolds(condition.missionSiteArchetype, inputs.faction, world, inputs.won);
    case 'lead_completed':
      return leadCompletedHolds(condition.lead, world);
  }
}
