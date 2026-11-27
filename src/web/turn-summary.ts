/**
 * TSUM, Summary events: what an Advance turn did that the Player must know, read from its Turn report and the current
 * World state, as Summary events in the kinds and order TSUM lists, each shown on its own. Pure presentation; no
 * gameplay rule.
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
  joinedLines,
  missionConsequenceLines,
  missionEquipment,
  missionSiteTitle,
  siteConsequenceLines,
  type EquipmentCatalog,
  type GainLine,
  type MissionSiteTitle,
} from './mission-gains.ts';

/** TSUM, Summary events, Mission: one Equipment line, e.g. "Recovered: 3 Items, 11 rounds · worth 165". */
export interface SummaryEquipmentLine extends GainLine {
  readonly label: 'Recovered' | 'Spent';
}

export interface SummaryMission {
  readonly mission: string;
  readonly missionSite: string;
  /** GUI, Mission site titles. */
  readonly title: MissionSiteTitle;
  readonly result: 'Won' | 'Lost';
  readonly combatOutcome: string;
  /** Its own Consequences joined on one line, then its rise in the Contracting cap on a line of its own. */
  readonly consequences: readonly GainLine[];
  /** Recovered, then Spent, each left out when empty. */
  readonly equipment: readonly SummaryEquipmentLine[];
  readonly deployed: number;
  /** The Agents killed, by Instance ID. */
  readonly killed: readonly string[];
  /** The number of survivors sent to Recovery. */
  readonly wounded: number;
  /** The names of the Leads discovered that the Turn report credits to it. */
  readonly leads: readonly string[];
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
  readonly createdMissionSite: string | null;
  readonly createdMissionSiteName: string | null;
  /** TSUM, Summary events: its Lead's Completion effect holds unlock_contracting, so Agents can now go to Contracting. */
  readonly unlocksContracting: boolean;
  /** The names of the Leads discovered that the Turn report credits to it. */
  readonly leads: readonly string[];
}

export interface SummaryLead {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly faction: string | null;
  /**
   * TSUM, Summary events, Lead discovered: what discovered it, i.e. the Mission site name of each Mission, then the
   * Lead name of each completed Investigation, that the Turn report credits it to.
   */
  readonly from: readonly string[];
}

export interface SummarySite {
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  readonly faction: string;
  /** The Lead of its origin Investigation, e.g. "from Locate member", or empty when its origin is its Faction. */
  readonly origin: string;
  readonly enemies: number;
  readonly enemiesCombatRating: number;
  readonly turnsUntilExpiration: number;
  readonly rewards: readonly GainLine[];
  readonly penalties: readonly GainLine[];
}

/** TSUM, Summary events, Expired Mission site: a Cancelled Mission site is left out, as it changed nothing. */
export interface SummaryExpiredSite {
  readonly missionSite: string;
  readonly name: string;
  readonly kind: string;
  readonly faction: string;
  readonly consequence: ConsequenceRecord;
}

export interface TurnSummaryModel {
  /** The Turn the Advance turn ended. */
  readonly turn: number;
  readonly missions: readonly SummaryMission[];
  readonly investigations: readonly SummaryInvestigation[];
  readonly leads: readonly SummaryLead[];
  readonly newSites: readonly SummarySite[];
  readonly expiredSites: readonly SummaryExpiredSite[];
  /** The Investigations interrupted, each with its Lead's name. */
  readonly interrupted: readonly { readonly investigation: string; readonly leadName: string }[];
}

/** TSUM, Summary events: one thing the Turn summary shows on its own, by kind. */
export type SummaryEvent =
  | { readonly kind: 'mission'; readonly key: string; readonly mission: SummaryMission }
  | { readonly kind: 'investigation'; readonly key: string; readonly investigation: SummaryInvestigation }
  | { readonly kind: 'lead'; readonly key: string; readonly lead: SummaryLead }
  | { readonly kind: 'site'; readonly key: string; readonly site: SummarySite }
  | { readonly kind: 'expired'; readonly key: string; readonly site: SummaryExpiredSite }
  | {
      readonly kind: 'interrupted';
      readonly key: string;
      readonly item: { readonly investigation: string; readonly leadName: string };
    };

/** TSUM, Summary events: the Summary events in the order of their kinds, and of the Turn report within a kind. */
export function summaryEvents(model: TurnSummaryModel): SummaryEvent[] {
  return [
    ...model.missions.map((mission) => ({ kind: 'mission' as const, key: mission.mission, mission })),
    ...model.investigations.map((investigation) => ({
      kind: 'investigation' as const,
      key: investigation.investigation,
      investigation,
    })),
    ...model.leads.map((lead) => ({ kind: 'lead' as const, key: lead.id, lead })),
    ...model.newSites.map((site) => ({ kind: 'site' as const, key: site.missionSite, site })),
    ...model.expiredSites.map((site) => ({ kind: 'expired' as const, key: site.missionSite, site })),
    ...model.interrupted.map((item) => ({ kind: 'interrupted' as const, key: item.investigation, item })),
  ];
}

/**
 * Whether the Turn report has at least one Summary event other than an Expired Mission site, which alone never shows
 * the Turn summary after the Advance turn (TSUM, Summary events): the Situation panel shows it instead.
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
 * Whether the Turn summary of this Turn report would have at least one Summary event, so that it can be reopened
 * (TRVIEW, Turn summary button), including when its only Summary events are Expired Mission sites.
 */
export function turnSummaryHasContent(report: TurnReport): boolean {
  return hasNewsBesidesExpiry(report) || report.expiredMissionSites.length > 0;
}

/**
 * Whether the GUI shows the Turn summary now: only for the Advance turn the Player requested through the GUI, the
 * one ending `requestedTurn`, once its Turn report is the current one, and only when it has a Summary event other than
 * an Expired Mission site. Every other way to reach a Turn report, e.g. loading, Timeline navigation, or Autopilot,
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
  const leads = new Map<string, LeadView>((retired?.leads ?? []).map((lead) => [lead.id, lead]));
  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;
  const siteName = (id: string, archetype?: string) => {
    const site = sites.get(id);
    return site?.name ?? (archetype === undefined ? id : siteArchetypeName(archetype));
  };
  const siteFaction = (id: string) => {
    const site = sites.get(id);
    return site === undefined ? '' : factionName(site.targetFaction);
  };

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

  const summaryMissions = report.missions.map((mission): SummaryMission => {
    const combat = report.combatReports.find((item) => item.mission === mission.mission);
    const { recovered, spent } = missionEquipment(mission, combat, catalog);
    return {
      mission: mission.mission,
      missionSite: mission.missionSite,
      title: missionSiteTitle(
        mission.missionSite,
        sites.get(mission.missionSite),
        { name: siteArchetypeName(mission.missionSiteArchetype), kind: mission.kind },
        factionName,
      ),
      result: mission.result,
      combatOutcome: combat?.outcome ?? '',
      consequences: joinedLines(
        missionConsequenceLines(mission, firstWinPhrase(mission.missionSiteArchetype), factionName),
      ),
      equipment: [
        ...(recovered.entries.length === 0
          ? []
          : [{ label: 'Recovered' as const, text: equipmentText(recovered), tone: 'good' as const }]),
        ...(spent.entries.length === 0
          ? []
          : [{ label: 'Spent' as const, text: equipmentText(spent), tone: 'bad' as const }]),
      ],
      deployed: mission.killed.length + mission.toRecovery.length + mission.toStandby.length,
      killed: mission.killed,
      wounded: mission.toRecovery.length,
      leads: mission.discoveredLeads.map((id) => leads.get(id)?.name ?? id),
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
      createdMissionSite: created,
      createdMissionSiteName: created === null ? null : siteName(created),
      unlocksContracting: lead?.unlocksContracting === true,
      leads: (item.discoveredLeads ?? []).map((id) => leads.get(id)?.name ?? id),
    };
  });

  const summaryLeads = report.discoveredLeads.flatMap((id): SummaryLead[] => {
    const lead = leads.get(id);
    if (lead === undefined) {
      return [];
    }
    const fromMissions = report.missions
      .filter((mission) => mission.discoveredLeads.includes(id))
      .map((mission) => siteName(mission.missionSite, mission.missionSiteArchetype));
    const fromInvestigations = report.investigationsCompleted
      .filter((item) => item.discoveredLeads?.includes(id) === true)
      .map((item) => investigations.get(item.investigation)?.leadName ?? item.investigation);
    return [
      {
        id,
        name: lead.name,
        description: lead.description,
        faction: lead.faction === null ? null : factionName(lead.faction),
        from: [...fromMissions, ...fromInvestigations],
      },
    ];
  });

  const newSites = report.createdMissionSites.map((id): SummarySite => {
    const site = sites.get(id);
    const origin =
      site?.origin.kind === 'Investigation'
        ? `from ${leads.get(site.lead ?? '')?.name ?? site.lead ?? ''}`
        : '';
    return {
      missionSite: id,
      name: siteName(id),
      kind: site?.kind ?? '',
      faction: siteFaction(id),
      origin,
      enemies: site?.enemies.length ?? 0,
      enemiesCombatRating: site?.enemiesCombatRating ?? 0,
      turnsUntilExpiration: site?.turnsUntilExpiration ?? 0,
      rewards: site === undefined ? [] : siteConsequenceLines(site.rewards, site.targetFaction, factionName),
      penalties:
        site === undefined ? [] : siteConsequenceLines(site.penalties, site.targetFaction, factionName),
    };
  });

  const expiredSites = report.expiredMissionSites.map((item): SummaryExpiredSite => ({
    missionSite: item.missionSite,
    name: siteName(item.missionSite, item.missionSiteArchetype),
    kind: item.kind,
    faction: siteFaction(item.missionSite),
    consequence: item.consequence,
  }));

  return {
    turn: report.turn,
    missions: summaryMissions,
    investigations: summaryInvestigations,
    leads: summaryLeads,
    newSites,
    expiredSites,
    interrupted: report.investigationsInterrupted.map((item) => ({
      investigation: item.investigation,
      leadName: leads.get(item.lead)?.name ?? item.lead,
    })),
  };
}
