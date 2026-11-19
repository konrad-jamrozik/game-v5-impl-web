/** LEAD (Leads and Progression): Lead discovery, Lead availability, and Lead status. */
import type { LeadGdr, MissionSiteArchetypeGdr } from '../../../gdr/index.ts';
import type { Faction, Investigation, Mission, MissionSite } from '../../state/types.ts';
import { conditionHolds } from '../conditions/conditions.ts';
import { missionSiteCanExist } from '../missions/missions.ts';

/** The parts of a World state that Lead discovery and Lead availability read. */
export interface LeadWorld {
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly missions: Readonly<Record<string, Mission>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
  readonly factions: Readonly<Record<string, Faction>>;
  /** LEAD, Lead discovery: the set of discovered Leads, by GDR identifier, in the order they were discovered. */
  readonly discoveredLeads: readonly string[];
}

/** The four conditions of LEAD, Lead availability, each read from one World state; never Player-visible. */
export interface LeadAvailability {
  readonly available: boolean;
  /** Condition 1: Discovered. */
  readonly discovered: boolean;
  /** Condition 2: May be investigated again, under its `investigate_again`. */
  readonly mayBeInvestigatedAgain: boolean;
  /** Condition 3: No Unfinished Mission site. */
  readonly noUnfinishedMissionSite: boolean;
  /** Condition 4: Its Mission site can exist. */
  readonly missionSiteCanExist: boolean;
  /** Whether the Faction of the Lead is Eliminated; read by Lead status. */
  readonly factionEliminated: boolean;
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

function factionOf(lead: LeadGdr, world: Pick<LeadWorld, 'factions'>): Faction | undefined {
  return Object.values(world.factions).find((item) => item.archetype === lead.faction);
}

/** LEAD, Missions from a Lead: the completion count, i.e. the number of Completed Investigations of the Lead. */
export function completionCount(
  leadId: string,
  investigations: Readonly<Record<string, Investigation>>,
): number {
  return Object.values(investigations).filter(
    (item) => item.constants.lead === leadId && item.state.lifecycle === 'Completed',
  ).length;
}

/** LEAD, Lead availability: the four conditions, each read from the given World state. */
export function leadAvailability(
  lead: LeadGdr,
  world: LeadWorld,
  missionSiteArchetypes: readonly MissionSiteArchetypeGdr[],
): LeadAvailability {
  const faction = factionOf(lead, world);
  const discovered = world.discoveredLeads.includes(lead.id);
  const sites = Object.values(world.missionSites).filter(
    (site) => leadOfMissionSite(site, world.investigations) === lead.id,
  );
  // The `investigate_again` table: `never` allows another Investigation while none is Completed, `until_mission_won`
  // while no Mission from the Lead is Won, and `always` always.
  let mayBeInvestigatedAgain: boolean;
  switch (lead.investigateAgain) {
    case 'never':
      mayBeInvestigatedAgain = completionCount(lead.id, world.investigations) === 0;
      break;
    case 'until_mission_won':
      mayBeInvestigatedAgain = !Object.values(world.missions).some(
        (mission) =>
          mission.state.lifecycle === 'Won' &&
          sites.some((site) => site.id === mission.constants.missionSite),
      );
      break;
    case 'always':
      mayBeInvestigatedAgain = true;
      break;
  }
  // MISSION, Glossary: an Unfinished Mission site is Active or Deployed.
  const noUnfinishedMissionSite = !sites.some(
    (site) => site.state.lifecycle === 'Active' || site.state.lifecycle === 'Deployed',
  );
  const archetype = missionSiteArchetypes.find((item) => item.id === lead.onCompletion.createMissionSite);
  const canExist = archetype !== undefined && missionSiteCanExist(archetype, faction, world);
  return {
    available: discovered && mayBeInvestigatedAgain && noUnfinishedMissionSite && canExist,
    discovered,
    mayBeInvestigatedAgain,
    noUnfinishedMissionSite,
    missionSiteCanExist: canExist,
    factionEliminated: faction === undefined || faction.state.eliminated,
  };
}

/** LEAD, Lead discovery: whether the Lead is in the stored set of discovered Leads. */
export function leadDiscovered(lead: LeadGdr, world: Pick<LeadWorld, 'discoveredLeads'>): boolean {
  return world.discoveredLeads.includes(lead.id);
}

/**
 * LEAD, Lead discovery: adds to the set of discovered Leads every Lead not yet in it whose `discovered_when` holds in
 * the given World state, with the Faction of the Lead supplied to every `mission_won` Condition; a Lead without
 * `discovered_when` always joins it. Leads that join together are added in Game build order (DEC-035). No Lead ever
 * leaves the set. Returns the Leads it added.
 */
export function discoverLeads(
  world: LeadWorld & { discoveredLeads: string[] },
  leads: readonly LeadGdr[],
): string[] {
  const added = leads
    .filter(
      (lead) =>
        !world.discoveredLeads.includes(lead.id) &&
        (lead.discoveredWhen === null ||
          conditionHolds(lead.discoveredWhen, world, { faction: factionOf(lead, world)?.id ?? null })),
    )
    .map((lead) => lead.id);
  world.discoveredLeads.push(...added);
  return added;
}

export type LeadStatus = 'Available' | 'Inactive' | 'Archived';

/**
 * LEAD, Lead status of a discovered Lead, in the order of the table: Archived when condition 2 of Lead availability
 * does not hold or its Faction is Eliminated, otherwise Inactive when it is not available, otherwise Available.
 */
export function leadStatus(availability: LeadAvailability): LeadStatus {
  if (!availability.mayBeInvestigatedAgain || availability.factionEliminated) {
    return 'Archived';
  }
  return availability.available ? 'Available' : 'Inactive';
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
