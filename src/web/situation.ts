/**
 * SITP, Groups: the one-line groups of the Situation panel, in the order SITP lists them, each left out when it has
 * nothing to show. Pure presentation over the Player API views; no gameplay rule.
 */
import type {
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  InvestigationView,
  LeadView,
  MissionSiteView,
  TurnReport,
} from '../engine/index.ts';
import {
  completionEstimate,
  progressCircle,
  type CompletionEstimate,
  type ProgressCircleModel,
} from './completion.ts';

/** VIS, Panels and cards: a Mission site that expires within this many Turns shows them in Accent text. */
export const SOON_EXPIRING_TURNS = 2;

/** SITP, Leads shown: the most lines the Leads group shows. */
export const LEADS_SHOWN_MAX = 4;

export interface ActiveInvestigationRow {
  readonly investigation: InvestigationView;
  readonly lead: LeadView | null;
  readonly circle: ProgressCircleModel;
  readonly estimate: CompletionEstimate;
}

/**
 * SITP, Mission site urgency: how a Mission site line stands out. `next` is an Active Mission site that Expires in the
 * next Advance turn; `lost` one that became Expired or Cancelled in the most recent Advance turn.
 */
export type MissionSiteUrgency = 'next' | 'lost' | 'other';

export interface MissionSiteRow {
  readonly site: MissionSiteView;
  readonly urgency: MissionSiteUrgency;
}

export type SituationGroup =
  | {
      readonly id: 'missionSites';
      /** SITP, Groups: the number of Active Mission sites; a lost one waits for no decision. */
      readonly count: number;
      readonly rows: readonly MissionSiteRow[];
    }
  | {
      readonly id: 'investigations';
      readonly count: number;
      readonly rows: readonly ActiveInvestigationRow[];
    }
  | {
      readonly id: 'agents';
      /** The number of Serving Agents. */
      readonly count: number;
      readonly standby: number;
      readonly trainingFree: number;
    };

export const GROUP_TITLES: Record<SituationGroup['id'], string> = {
  agents: 'Agents',
  missionSites: 'Mission sites',
  investigations: 'Active Investigations',
};

/** The Active Investigations, each with its Lead, Progress circle, and Completion estimate. */
export function activeInvestigationRows(
  state: CurrentLiveWorldStateView,
  leads: readonly LeadView[],
): ActiveInvestigationRow[] {
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  return state.investigations
    .filter((item) => item.lifecycle === 'Active')
    .map((investigation) => {
      const lead = leadsById.get(investigation.lead) ?? null;
      return {
        investigation,
        lead,
        circle: progressCircle(lead, investigation.progress),
        estimate: completionEstimate(lead, investigation),
      };
    });
}

/** The Discovered Leads that are Available and have no Active Investigation. */
export function leadsToInvestigate(state: CurrentLiveWorldStateView, leads: readonly LeadView[]): LeadView[] {
  const investigated = new Set(
    state.investigations.filter((item) => item.lifecycle === 'Active').map((item) => item.lead),
  );
  return leads.filter((lead) => lead.status === 'Available' && !investigated.has(lead.id));
}

/**
 * The Situation panel's groups, in the order SITP, Groups lists them; an empty result means that nothing needs
 * attention. SITP shows no Leads group: the Leads View lists the Leads to investigate.
 */
export function situationGroups(
  state: CurrentLiveWorldStateView,
  leads: readonly LeadView[],
  /** SITP, Groups: the Mission sites that became Expired or Cancelled in the most recent Advance turn, in order. */
  lost: readonly MissionSiteView[] = [],
): SituationGroup[] {
  const groups: SituationGroup[] = [];

  const standby = state.agents.filter((agent) => agent.assignment?.kind === 'Standby').length;
  const trainingFree = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
  if (standby > 0 || trainingFree > 0) {
    groups.push({ id: 'agents', count: state.agency.servingAgents, standby, trainingFree });
  }

  // SITP, Groups: the Active Mission sites soonest to expire first, then those lost in the most recent Advance turn.
  const sites = state.missionSites
    .filter((site) => site.lifecycle === 'Active')
    .sort((a, b) => a.turnsUntilExpiration - b.turnsUntilExpiration);
  const rows: MissionSiteRow[] = [
    ...sites.map((site): MissionSiteRow => ({
      site,
      urgency: site.turnsUntilExpiration === 1 ? 'next' : 'other',
    })),
    ...lost.map((site): MissionSiteRow => ({ site, urgency: 'lost' })),
  ];
  if (rows.length > 0) {
    groups.push({ id: 'missionSites', count: sites.length, rows });
  }

  const investigations = activeInvestigationRows(state, leads);
  if (investigations.length > 0) {
    groups.push({ id: 'investigations', count: investigations.length, rows: investigations });
  }

  return groups;
}

/**
 * SITP, Groups: the Mission sites that became Expired or Cancelled in the Advance turn of `report`, read from the
 * Retired world state, where a Mission site in a final state is kept.
 */
export function lostMissionSites(
  report: TurnReport | null,
  retired: CurrentRetiredWorldStateView | null,
): MissionSiteView[] {
  if (report === null) {
    return [];
  }
  const byId = new Map((retired?.missionSites ?? []).map((site) => [site.id, site]));
  const ids = [
    ...report.expiredMissionSites.map((item) => item.missionSite),
    ...report.cancelledMissionSites,
  ];
  return ids.flatMap((id) => {
    const site = byId.get(id);
    return site === undefined ? [] : [site];
  });
}

/** The Required progress range of a Lead as the GUI writes it, e.g. "3–4", or null while it is unknown. */
export function rangeText(lead: Pick<LeadView, 'requiredProgressRange'> | null | undefined): string | null {
  const range = lead?.requiredProgressRange;
  return range === undefined || range === 'unknown' ? null : `${range.min}–${range.max}`;
}
