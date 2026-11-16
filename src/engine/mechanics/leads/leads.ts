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
  /** Condition 3. */
  readonly noMissionSiteInProgress: boolean;
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

/** LEAD, Lead availability: the four conditions, each read from the given Committed state. */
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

  let inProgress = false;
  for (const site of Object.values(world.missionSites)) {
    if (leadOfMissionSite(site, world.investigations) !== lead.id) {
      continue;
    }
    if (site.state.lifecycle === 'Active') {
      inProgress = true;
    } else if (site.state.lifecycle === 'Attempted') {
      const deployed = Object.values(world.missions).some(
        (mission) => mission.constants.missionSite === site.id && mission.state.lifecycle === 'Deployed',
      );
      inProgress ||= deployed;
    }
  }

  const factionNotEliminated = faction !== undefined && !faction.state.eliminated;

  const conditions = [prerequisitesHold, noMissionWon, !inProgress, factionNotEliminated];
  const blockingConditions = conditions.flatMap((holds, index) => (holds ? [] : [index + 1]));
  return {
    available: blockingConditions.length === 0,
    prerequisitesHold,
    prerequisites,
    noMissionWon,
    noMissionSiteInProgress: !inProgress,
    factionNotEliminated,
    blockingConditions,
  };
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
