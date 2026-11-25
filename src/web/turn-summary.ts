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
import {
  equipmentText,
  missionEquipment,
  missionSiteTitle,
  summedConsequenceLines,
  summedEquipmentList,
  type EquipmentCatalog,
  type GainLine,
  type MissionSiteTitle,
} from './mission-gains.ts';

export interface SummaryMission {
  readonly mission: string;
  readonly missionSite: string;
  /** GUI, Mission site titles. */
  readonly title: MissionSiteTitle;
  readonly result: 'Won' | 'Lost';
  readonly combatOutcome: string;
}

/** TSUM, Groups, Equipment: one line, e.g. "Recovered: 3 Items, 11 rounds · worth 165". */
export interface SummaryEquipmentLine extends GainLine {
  readonly label: 'Recovered' | 'Spent';
}

/** What the Turn summary reads of the Game build: the Items, AmmoTypes, and MissionSiteArchetypes. */
export interface SummaryGameData {
  readonly weapons: EquipmentCatalog['weapons'];
  readonly armors: EquipmentCatalog['armors'];
  readonly ammoTypes: EquipmentCatalog['ammoTypes'];
  readonly missionSiteArchetypes: readonly { readonly id: string; readonly firstWinPhrase: string | null }[];
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
  /** TSUM, Groups, Consequences: the summed Consequences on one line, then each rise in the Contracting cap. */
  readonly consequences: readonly GainLine[];
  /** TSUM, Groups, Equipment: Recovered, then Spent, each summed over every Mission and left out when empty. */
  readonly equipment: readonly SummaryEquipmentLine[];
  /** TSUM, Totals: each Lead discovered names no Mission. */
  readonly leads: readonly LeadView[];
  readonly investigations: readonly SummaryInvestigation[];
  readonly newSites: readonly SummarySite[];
  readonly expiredSites: readonly SummaryExpiredSite[];
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
  gameData: SummaryGameData | null = null,
): TurnSummaryModel {
  const sites = new Map<string, MissionSiteView>();
  for (const site of [...(retired?.missionSites ?? []), ...state.missionSites]) {
    sites.set(site.id, site);
  }
  const investigations = new Map<string, InvestigationView>();
  for (const item of [...(retired?.investigations ?? []), ...state.investigations]) {
    investigations.set(item.id, item);
  }
  const leads = new Map((retired?.leads ?? []).map((lead) => [lead.id, lead]));
  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;
  const siteName = (id: string, archetype?: string) => {
    const site = sites.get(id);
    return site?.name ?? (archetype === undefined ? id : siteArchetypeName(archetype));
  };

  const titles = new Map(
    report.missions.map((mission) => [
      mission.mission,
      missionSiteTitle(
        mission.missionSite,
        sites.get(mission.missionSite),
        { name: siteArchetypeName(mission.missionSiteArchetype), kind: mission.kind },
        factionName,
      ),
    ]),
  );
  const titleOf = (mission: string) => titles.get(mission) ?? { name: mission, details: '' };
  const combatOf = (mission: string) => report.combatReports.find((item) => item.mission === mission);

  const summaryMissions = report.missions.map((mission): SummaryMission => {
    // TSUM, Groups: a Mission card holds its Mission site title and outcome and nothing else.
    return {
      mission: mission.mission,
      missionSite: mission.missionSite,
      title: titleOf(mission.mission),
      result: mission.result,
      combatOutcome: combatOf(mission.mission)?.outcome ?? '',
    };
  });

  const firstWinPhrase = (archetype: string) =>
    gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.firstWinPhrase ?? null;
  const catalog: EquipmentCatalog | null =
    gameData === null
      ? null
      : {
          weapons: gameData.weapons,
          armors: gameData.armors,
          ammoTypes: gameData.ammoTypes,
          salePriceFraction: state.agency.equipment.salePriceFraction,
        };
  // TSUM, Totals: Consequences and Equipment sum every Mission and name none.
  const consequences = summedConsequenceLines(report.missions, firstWinPhrase, factionName);
  const lists = report.missions.map((mission) =>
    missionEquipment(mission, combatOf(mission.mission), catalog),
  );
  const recovered = summedEquipmentList(lists.map((list) => list.recovered));
  const spent = summedEquipmentList(lists.map((list) => list.spent));
  const equipment: SummaryEquipmentLine[] = [
    ...(recovered.entries.length === 0
      ? []
      : [{ label: 'Recovered' as const, text: equipmentText(recovered), tone: 'good' as const }]),
    ...(spent.entries.length === 0
      ? []
      : [{ label: 'Spent' as const, text: equipmentText(spent), tone: 'bad' as const }]),
  ];

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
    consequences,
    equipment,
    leads: report.discoveredLeads.flatMap((id) => {
      const lead = leads.get(id);
      return lead === undefined ? [] : [lead];
    }),
    investigations: summaryInvestigations,
    newSites,
    expiredSites,
    interrupted: report.investigationsInterrupted.map((item) => ({
      investigation: item.investigation,
      leadName: leads.get(item.lead)?.name ?? item.lead,
    })),
  };
}
