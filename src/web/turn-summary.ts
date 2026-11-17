/**
 * GUI, Turn summary: what an Advance turn did that the Player must know, read from its Turn report and the current
 * Committed state, in the groups and order GUI lists, each left out when empty. Pure presentation; no gameplay rule.
 */
import type {
  ConsequenceRecord,
  CurrentStateView,
  HistoryView,
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
  readonly killed: readonly string[];
  readonly toRecovery: readonly string[];
  readonly enemiesDead: number;
  readonly enemiesPresent: number;
  readonly consequence: ConsequenceRecord;
}

export interface SummaryInvestigation {
  readonly investigation: string;
  readonly leadName: string;
  /** The number of Turns from its Turn started to the Turn the Advance turn ended; see DEC-042. */
  readonly turns: number;
  readonly finalProgress: number;
  readonly gain: number;
  /** In progress points; a Completed Investigation's Lead is always an Assessed Lead. */
  readonly requiredProgress: number | null;
  readonly range: { readonly min: number; readonly max: number } | null;
  readonly createdMissionSiteName: string | null;
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

export interface SummaryEndedSite {
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  readonly lifecycle: 'Expired' | 'Cancelled';
  /** The Consequences of an Expired one. */
  readonly consequence: ConsequenceRecord | null;
}

export interface TurnSummaryModel {
  /** The Turn the Advance turn ended. */
  readonly turn: number;
  readonly missions: readonly SummaryMission[];
  readonly investigations: readonly SummaryInvestigation[];
  readonly newSites: readonly SummarySite[];
  readonly endedSites: readonly SummaryEndedSite[];
  readonly leads: readonly LeadView[];
}

/** Whether the Turn report lists at least one thing the Turn summary shows. */
export function turnSummaryHasContent(report: TurnReport): boolean {
  return (
    report.combatReports.length > 0 ||
    report.investigationsCompleted.length > 0 ||
    report.createdMissionSites.length > 0 ||
    report.expiredMissionSites.length > 0 ||
    report.cancelledMissionSites.length > 0 ||
    report.discoveredLeads.length > 0
  );
}

/**
 * Whether the GUI shows the Turn summary now: only for the Advance turn the Player requested through the GUI, the
 * one ending `requestedTurn`, once its Turn report is the current one, and only when it lists something. Every other
 * way to reach a Turn report, e.g. loading, Timeline navigation, or Autopilot, leaves `requestedTurn` null.
 */
export function showsTurnSummary(requestedTurn: number | null, report: TurnReport | null): boolean {
  return (
    requestedTurn !== null &&
    report !== null &&
    report.turn === requestedTurn &&
    turnSummaryHasContent(report)
  );
}

export function turnSummary(
  report: TurnReport,
  state: CurrentStateView,
  history: HistoryView | null,
  siteArchetypeName: (archetype: string) => string,
): TurnSummaryModel {
  const sites = new Map<string, MissionSiteView>();
  for (const site of [...(history?.retained.missionSites ?? []), ...state.missionSites]) {
    sites.set(site.id, site);
  }
  const investigations = new Map<string, InvestigationView>();
  for (const item of [...(history?.retained.investigations ?? []), ...state.investigations]) {
    investigations.set(item.id, item);
  }
  const missions = new Map((history?.retained.missions ?? []).map((mission) => [mission.id, mission]));
  const leads = new Map(state.leads.map((lead) => [lead.id, lead]));
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
      killed: mission.killed,
      toRecovery: mission.toRecovery,
      enemiesDead: enemies.filter((who) => who.final.condition === 'dead').length,
      enemiesPresent: enemies.length,
      consequence: mission.consequence,
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

  const endedSites: SummaryEndedSite[] = [
    ...report.expiredMissionSites.map((item): SummaryEndedSite => ({
      missionSite: item.missionSite,
      name: siteName(item.missionSite, item.missionSiteArchetype),
      kind: item.kind,
      lifecycle: 'Expired',
      consequence: item.consequence,
    })),
    ...report.cancelledMissionSites.map((id): SummaryEndedSite => ({
      missionSite: id,
      name: siteName(id),
      kind: sites.get(id)?.kind ?? '',
      lifecycle: 'Cancelled',
      consequence: null,
    })),
  ];

  return {
    turn: report.turn,
    missions: summaryMissions,
    investigations: summaryInvestigations,
    newSites,
    endedSites,
    leads: report.discoveredLeads.flatMap((id) => {
      const lead = leads.get(id);
      return lead === undefined ? [] : [lead];
    }),
  };
}
