/** LEAD (Leads and Progression): Prerequisites and Lead availability, as Derived values of the values they read. */
import type { LeadGdr } from '../../../gdr/index.ts';
import type { Faction, Investigation, Mission, MissionSite } from '../../state/types.ts';

/** The parts of Current world state that Lead availability reads. */
export interface LeadWorld {
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly missions: Readonly<Record<string, Mission>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
  readonly factions: Readonly<Record<string, Faction>>;
}

export interface LeadAvailability {
  readonly available: boolean;
  /** Condition 1, with each prerequisite and whether it holds. */
  readonly prerequisitesHold: boolean;
  readonly prerequisites: readonly { readonly missionWon: string; readonly holds: boolean }[];
  /** Condition 2. */
  readonly noMissionWon: boolean;
  /** Condition 3: No Unfinished Mission site. */
  readonly noUnfinishedMissionSite: boolean;
  /** Condition 4. */
  readonly factionNotEliminated: boolean;
  /** The numbers of the conditions that do not hold. */
  readonly blockingConditions: readonly number[];
}

/** The Lead that created a Mission site: the Lead of its origin Investigation; none for a Response Mission site. */
export function leadOfMissionSite(
  site: MissionSite,
  investigations: Readonly<Record<string, Investigation>>,
): string | null {
  if (site.constants.origin.kind !== 'Investigation') {
    return null;
  }
  return investigations[site.constants.origin.investigation]?.constants.lead ?? null;
}

/** The Mission sites that have a Won Mission. */
function sitesWithWonMission(world: Pick<LeadWorld, 'missions' | 'missionSites'>): MissionSite[] {
  return Object.values(world.missions).flatMap((mission) => {
    const site = world.missionSites[mission.constants.missionSite];
    return mission.state.lifecycle === 'Won' && site !== undefined ? [site] : [];
  });
}

/** LEAD, Lead availability: the four conditions, each read from the given World state. */
export function leadAvailability(lead: LeadGdr, world: LeadWorld): LeadAvailability {
  const faction = Object.values(world.factions).find((item) => item.archetype === lead.faction);
  const won = sitesWithWonMission(world);
  // LEAD, Prerequisites: a Won Mission at a Mission site of the named MissionSiteArchetype that targets the Faction of
  // the Lead, whichever Lead, if any, created the Mission site.
  const prerequisites = lead.requires.map((entry) => ({
    missionWon: entry.missionWon,
    holds: won.some(
      (site) => site.archetype === entry.missionWon && site.constants.targetFaction === faction?.id,
    ),
  }));
  const prerequisitesHold = prerequisites.every((entry) => entry.holds);
  const noMissionWon = !won.some((site) => leadOfMissionSite(site, world.investigations) === lead.id);

  // MISSION, Glossary: an Unfinished Mission site is Active or Deployed.
  const unfinished = Object.values(world.missionSites).some(
    (site) =>
      leadOfMissionSite(site, world.investigations) === lead.id &&
      (site.state.lifecycle === 'Active' || site.state.lifecycle === 'Deployed'),
  );

  const factionNotEliminated = faction !== undefined && !faction.state.eliminated;

  const conditions = [prerequisitesHold, noMissionWon, !unfinished, factionNotEliminated];
  const blockingConditions = conditions.flatMap((holds, index) => (holds ? [] : [index + 1]));
  return {
    available: blockingConditions.length === 0,
    prerequisitesHold,
    prerequisites,
    noMissionWon,
    noUnfinishedMissionSite: !unfinished,
    factionNotEliminated,
    blockingConditions,
  };
}

/**
 * LEAD, Lead discovery: a Lead is discovered exactly when condition 1 of Lead availability holds for it. A Derived
 * value, never stored; only a discovered Lead is Player-visible.
 */
export function leadDiscovered(lead: LeadGdr, world: LeadWorld): boolean {
  return leadAvailability(lead, world).prerequisitesHold;
}

export type LeadStatus = 'Available' | 'Inactive' | 'Archived';

/**
 * LEAD, Lead status of a discovered Lead, decided by its Blocking conditions in the order of the table: Archived when
 * condition 2 or 4 does not hold, otherwise Inactive when condition 3 does not hold, otherwise Available.
 */
export function leadStatus(availability: LeadAvailability): LeadStatus {
  if (!availability.noMissionWon || !availability.factionNotEliminated) {
    return 'Archived';
  }
  return availability.noUnfinishedMissionSite ? 'Available' : 'Inactive';
}

/** The Active Investigation of a Lead, if any; see INVSTG, One Active Investigation per Lead. */
export function activeInvestigationOf(
  leadId: string,
  investigations: Readonly<Record<string, Investigation>>,
): Investigation | null {
  return (
    Object.values(investigations).find(
      (item) => item.constants.lead === leadId && item.state.lifecycle === 'Active',
    ) ?? null
  );
}
