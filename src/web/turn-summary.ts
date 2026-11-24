/**
 * TSUM, Groups: what an Advance turn did that the Player must know, read from its Turn report and the current
 * World state, in the groups and order TSUM lists, each left out when empty. Pure presentation; no gameplay rule.
 */
import type {
  ConsequenceRecord,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  InvestigationView,
  LeadView,
  MissionSiteView,
  TurnReport,
} from '../engine/index.ts';

export interface SummaryMission {
  readonly mission: string;
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  readonly factionName: string;
  readonly result: 'Won' | 'Lost';
  readonly combatOutcome: string;
  readonly teamSent: number;
  /** TSUM, Groups: the number of Agents Killed; the card names no Agent. */
  readonly killed: number;
  /** The number of Agents of its Team sent whose Assignment is now Recovery. */
  readonly toRecovery: number;
  readonly enemiesDead: number;
  readonly enemiesPresent: number;
  readonly consequence: ConsequenceRecord;
  /** TSUM, Groups: the number of Leads discovered in the Advance turn that are credited to the Mission. */
  readonly leadsDiscovered: number;
  /** TSUM, Groups: the rise in the Contracting cap the Mission brings; 0 for none. */
  readonly contractingCapRise: number;
  /** TSUM, Groups: whether the Mission brought Spoils of war, which its card marks "Equipment recovered". */
  readonly equipmentRecovered: boolean;
}

/** TSUM, Groups, Spoils of war: one Weapon or AmmoType with its count summed over the Missions resolved. */
export interface SummarySpoil {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/** The Weapons and AmmoTypes of the Game build, in authored order, which name and order the Spoils of war. */
export interface SpoilsCatalog {
  readonly weapons: readonly { readonly id: string; readonly name: string }[];
  readonly ammoTypes: readonly { readonly id: string; readonly name: string }[];
}

/**
 * TSUM, Groups, Spoils of war: the Spoils of war of every Mission resolved, summed per Weapon or AmmoType, Weapons
 * before AmmoTypes, each in authored order; an identifier the catalog lacks follows them, named by itself.
 */
export function summedSpoils(report: TurnReport, catalog: SpoilsCatalog | null): SummarySpoil[] {
  const counts = new Map<string, number>();
  for (const mission of report.missions) {
    for (const [id, count] of Object.entries(mission.equipment.spoils)) {
      counts.set(id, (counts.get(id) ?? 0) + count);
    }
  }
  const known = [...(catalog?.weapons ?? []), ...(catalog?.ammoTypes ?? [])];
  const ordered = known.flatMap((item) => {
    const count = counts.get(item.id) ?? 0;
    return count > 0 ? [{ id: item.id, name: item.name, count }] : [];
  });
  const rest = [...counts.entries()]
    .filter(([id, count]) => count > 0 && !known.some((item) => item.id === id))
    .map(([id, count]) => ({ id, name: id, count }));
  return [...ordered, ...rest];
}

/** TSUM, Groups: e.g. "1 new Lead discovered" or "2 new Leads discovered". */
export function leadsDiscoveredText(count: number): string {
  return `${count} new ${count === 1 ? 'Lead' : 'Leads'} discovered`;
}

/** TSUM, Groups: e.g. "Reputation increased: 4 more Contracting opportunities available". */
export function contractingCapRiseText(rise: number): string {
  return `Reputation increased: ${rise} more Contracting ${rise === 1 ? 'opportunity' : 'opportunities'} available`;
}

export interface SummaryInvestigation {
  readonly investigation: string;
  readonly leadName: string;
  /** The number of Turns from its Turn started to the Turn the Advance turn ended. */
  readonly turns: number;
  readonly finalProgress: number;
  readonly gain: number;
  /** In progress points; a Completed Investigation's Lead is always an Assessed Lead. */
  readonly requiredProgress: number | null;
  readonly range: { readonly min: number; readonly max: number } | null;
  readonly createdMissionSiteName: string | null;
  /** TSUM, Groups: its Lead's Completion effect holds unlock_contracting, so Agents can now go to Contracting. */
  readonly unlocksContracting: boolean;
}

export interface SummarySite {
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  /** The Lead of its origin Investigation, or its target Faction. */
  readonly origin: string;
  readonly enemies: number;
  readonly turnsUntilExpiration: number;
}

/** TSUM, Groups, Expired Mission sites: a Cancelled Mission site is left out, as it changed nothing. */
export interface SummaryExpiredSite {
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  readonly consequence: ConsequenceRecord;
}

export interface TurnSummaryModel {
  /** The Turn the Advance turn ended. */
  readonly turn: number;
  readonly missions: readonly SummaryMission[];
  /** TSUM, Groups, Spoils of war: summed over the Missions resolved, naming no Mission. */
  readonly spoils: readonly SummarySpoil[];
  readonly investigations: readonly SummaryInvestigation[];
  readonly newSites: readonly SummarySite[];
  readonly expiredSites: readonly SummaryExpiredSite[];
  readonly leads: readonly LeadView[];
  /** TSUM, Groups: the Investigations interrupted, each with its Lead's name. */
  readonly interrupted: readonly { readonly investigation: string; readonly leadName: string }[];
}

/**
 * Whether the Turn report lists at least one thing the Turn summary shows other than an Expired Mission site, which
 * alone never shows it after the Advance turn (TSUM, Groups): the Situation panel shows it instead.
 */
function hasNewsBesidesExpiry(report: TurnReport): boolean {
  return (
    report.combatReports.length > 0 ||
    report.investigationsCompleted.length > 0 ||
    report.createdMissionSites.length > 0 ||
    report.discoveredLeads.length > 0 ||
    report.investigationsInterrupted.length > 0
  );
}

/**
 * Whether the Turn summary of this Turn report would have at least one group, so that it can be reopened (TRVIEW,
 * Turn summary button), including when its only group is Expired Mission sites.
 */
export function turnSummaryHasContent(report: TurnReport): boolean {
  return hasNewsBesidesExpiry(report) || report.expiredMissionSites.length > 0;
}

/**
 * Whether the GUI shows the Turn summary now: only for the Advance turn the Player requested through the GUI, the
 * one ending `requestedTurn`, once its Turn report is the current one, and only when it lists something other than an
 * Expired Mission site. Every other way to reach a Turn report, e.g. loading, Timeline navigation, or Autopilot,
 * leaves `requestedTurn` null.
 */
export function showsTurnSummary(requestedTurn: number | null, report: TurnReport | null): boolean {
  return (
    requestedTurn !== null && report !== null && report.turn === requestedTurn && hasNewsBesidesExpiry(report)
  );
}

export function turnSummary(
  report: TurnReport,
  state: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView | null,
  siteArchetypeName: (archetype: string) => string,
  spoilsCatalog: SpoilsCatalog | null = null,
): TurnSummaryModel {
  const sites = new Map<string, MissionSiteView>();
  for (const site of [...(retired?.missionSites ?? []), ...state.missionSites]) {
    sites.set(site.id, site);
  }
  const investigations = new Map<string, InvestigationView>();
  for (const item of [...(retired?.investigations ?? []), ...state.investigations]) {
    investigations.set(item.id, item);
  }
  const missions = new Map((retired?.missions ?? []).map((mission) => [mission.id, mission]));
  const leads = new Map((retired?.leads ?? []).map((lead) => [lead.id, lead]));
  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;
  const siteName = (id: string, archetype?: string) => {
    const site = sites.get(id);
    return site?.name ?? (archetype === undefined ? id : siteArchetypeName(archetype));
  };

  const summaryMissions = report.missions.map((mission, index): SummaryMission => {
    const combat = report.combatReports[index];
    const site = sites.get(mission.missionSite);
    const enemies = combat?.participants.filter((who) => who.side === 'enemy') ?? [];
    return {
      mission: mission.mission,
      missionSite: mission.missionSite,
      name: siteName(mission.missionSite, mission.missionSiteArchetype),
      kind: mission.kind,
      factionName: site === undefined ? '' : factionName(site.targetFaction),
      result: mission.result,
      combatOutcome: combat?.outcome ?? '',
      teamSent: missions.get(mission.mission)?.teamSent.length ?? combat?.agents.length ?? 0,
      killed: mission.killed.length,
      toRecovery: mission.toRecovery.length,
      enemiesDead: enemies.filter((who) => who.final.condition === 'dead').length,
      enemiesPresent: enemies.length,
      consequence: mission.consequence,
      leadsDiscovered: mission.discoveredLeads.length,
      contractingCapRise: mission.contractingCapRise,
      equipmentRecovered: Object.values(mission.equipment.spoils).some((count) => count > 0),
    };
  });

  const summaryInvestigations = report.investigationsCompleted.map((item): SummaryInvestigation => {
    const investigation = investigations.get(item.investigation);
    const lead = investigation === undefined ? undefined : leads.get(investigation.lead);
    const created =
      report.investigations.find((entry) => entry.investigation === item.investigation)?.createdMissionSite ??
      null;
    const range = lead?.requiredProgressRange;
    const required = lead?.requiredProgress;
    return {
      investigation: item.investigation,
      leadName: investigation?.leadName ?? item.investigation,
      turns: investigation === undefined ? 0 : report.turn - investigation.turnStarted,
      finalProgress: investigation?.progress ?? item.gain,
      gain: item.gain,
      requiredProgress: required === undefined || required === 'unknown' ? null : required,
      range: range === undefined || range === 'unknown' ? null : range,
      createdMissionSiteName: created === null ? null : siteName(created),
      unlocksContracting: lead?.unlocksContracting === true,
    };
  });

  const newSites = report.createdMissionSites.map((id): SummarySite => {
    const site = sites.get(id);
    let origin = '';
    if (site !== undefined) {
      origin =
        site.origin.kind === 'Investigation'
          ? `from ${leads.get(site.lead ?? '')?.name ?? site.lead ?? ''}`
          : factionName(site.targetFaction);
    }
    return {
      missionSite: id,
      name: siteName(id),
      kind: site?.kind ?? '',
      origin,
      enemies: site?.enemies.length ?? 0,
      turnsUntilExpiration: site?.turnsUntilExpiration ?? 0,
    };
  });

  const expiredSites = report.expiredMissionSites.map((item): SummaryExpiredSite => ({
    missionSite: item.missionSite,
    name: siteName(item.missionSite, item.missionSiteArchetype),
    kind: item.kind,
    consequence: item.consequence,
  }));

  return {
    turn: report.turn,
    missions: summaryMissions,
    spoils: summedSpoils(report, spoilsCatalog),
    investigations: summaryInvestigations,
    newSites,
    expiredSites,
    leads: report.discoveredLeads.flatMap((id) => {
      const lead = leads.get(id);
      return lead === undefined ? [] : [lead];
    }),
    interrupted: report.investigationsInterrupted.map((item) => ({
      investigation: item.investigation,
      leadName: leads.get(item.lead)?.name ?? item.lead,
    })),
  };
}
