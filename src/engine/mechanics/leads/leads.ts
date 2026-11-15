/** LEAD (Leads and Progression): Prerequisites and Lead availability, as Derived values of the values they read. */
import type { LeadGdr } from '../../../gdr/index.ts';
import type { Faction, Investigation, Mission, MissionSite } from '../../state/types.ts';

/** The parts of Current world state that Lead availability reads. */
export interface LeadWorld {
  readonly leadProgression: Readonly<Record<string, readonly string[]>>;
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly missions: Readonly<Record<string, Mission>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
  readonly factions: Readonly<Record<string, Faction>>;
}

export interface LeadAvailability {
  readonly available: boolean;
  /** Condition 1, with each prerequisite and whether it holds. */
  readonly prerequisitesHold: boolean;
  readonly prerequisites: readonly { readonly lead: string; readonly holds: boolean }[];
  /** Condition 2. */
  readonly noWinRecorded: boolean;
  /** Condition 3. */
  readonly noMissionSiteInProgress: boolean;
  /** Condition 4. */
  readonly factionNotDefeated: boolean;
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

export function hasRecordedWin(leadId: string, world: Pick<LeadWorld, 'leadProgression'>): boolean {
  return (world.leadProgression[leadId]?.length ?? 0) > 0;
}

/** LEAD, Lead availability: the four conditions, each read from the given Committed state. */
export function leadAvailability(lead: LeadGdr, world: LeadWorld): LeadAvailability {
  const prerequisites = lead.requires.map((entry) => ({
    lead: entry.missionWonFromLead,
    holds: hasRecordedWin(entry.missionWonFromLead, world),
  }));
  const prerequisitesHold = prerequisites.every((entry) => entry.holds);
  const noWinRecorded = !hasRecordedWin(lead.id, world);

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

  const faction = Object.values(world.factions).find((item) => item.archetype === lead.faction);
  const factionNotDefeated = faction !== undefined && !faction.state.defeated;

  const conditions = [prerequisitesHold, noWinRecorded, !inProgress, factionNotDefeated];
  const blockingConditions = conditions.flatMap((holds, index) => (holds ? [] : [index + 1]));
  return {
    available: blockingConditions.length === 0,
    prerequisitesHold,
    prerequisites,
    noWinRecorded,
    noMissionSiteInProgress: !inProgress,
    factionNotDefeated,
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
