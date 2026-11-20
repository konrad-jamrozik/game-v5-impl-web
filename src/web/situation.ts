/**
 * SITP, Groups: the one-line groups of the Situation panel, in the order SITP lists them, each left out when it has
 * nothing to show. Pure presentation over the Player API views; no gameplay rule.
 */
import type {
  CurrentLiveWorldStateView,
  HistoryView,
  InvestigationView,
  LeadView,
  MissionSiteView,
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

export type SituationGroup =
  | { readonly id: 'missionSites'; readonly count: number; readonly rows: readonly MissionSiteView[] }
  | {
      readonly id: 'investigations';
      readonly count: number;
      readonly rows: readonly ActiveInvestigationRow[];
    }
  | {
      readonly id: 'leads';
      /** The number of all the Leads of the group, however many of them it shows. */
      readonly count: number;
      /** The Leads shown, newest first. */
      readonly rows: readonly LeadView[];
      /** How many Leads the group does not show; 0 when it shows them all. */
      readonly more: number;
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
  missionSites: 'Active Mission sites',
  investigations: 'Active Investigations',
  leads: 'Leads',
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
 * SITP, Leads shown: the Turn in which each Lead was discovered, as the History entries record it. A Lead discovered at
 * campaign creation is in no History entry, and so has none.
 */
export function leadDiscoveryTurns(
  history: Pick<HistoryView, 'entries'> | null,
): ReadonlyMap<string, number> {
  const turns = new Map<string, number>();
  for (const entry of history?.entries ?? []) {
    for (const lead of entry.report.discoveredLeads) {
      turns.set(lead, entry.turn);
    }
  }
  return turns;
}

/**
 * SITP, Leads shown: the Leads from the newest to the oldest by the Turn in which each was discovered, those of one
 * Turn, or of campaign creation, in the authored order of the Lead GDRs, which `leads` keeps. A Lead discovered at
 * campaign creation is older than every Lead discovered in a Turn.
 */
export function newestLeadsFirst(
  leads: readonly LeadView[],
  discoveryTurns: ReadonlyMap<string, number>,
): LeadView[] {
  const turnOf = (lead: LeadView) => discoveryTurns.get(lead.id) ?? Number.NEGATIVE_INFINITY;
  // The sort is stable, so Leads of one Turn keep their authored order.
  return [...leads].sort((a, b) => (turnOf(a) === turnOf(b) ? 0 : turnOf(a) > turnOf(b) ? -1 : 1));
}

/**
 * The Situation panel's groups, in the order SITP, Groups lists them; an empty result means that nothing needs
 * attention. `discoveryTurns` orders the Leads group, under SITP, Leads shown.
 */
export function situationGroups(
  state: CurrentLiveWorldStateView,
  leads: readonly LeadView[],
  discoveryTurns: ReadonlyMap<string, number> = new Map(),
): SituationGroup[] {
  const groups: SituationGroup[] = [];

  const standby = state.agents.filter((agent) => agent.assignment?.kind === 'Standby').length;
  const trainingFree = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
  if (standby > 0 || trainingFree > 0) {
    groups.push({ id: 'agents', count: state.agency.servingAgents, standby, trainingFree });
  }

  const sites = state.missionSites.filter((site) => site.lifecycle === 'Active');
  if (sites.length > 0) {
    groups.push({ id: 'missionSites', count: sites.length, rows: sites });
  }

  const investigations = activeInvestigationRows(state, leads);
  if (investigations.length > 0) {
    groups.push({ id: 'investigations', count: investigations.length, rows: investigations });
  }

  const toInvestigate = newestLeadsFirst(leadsToInvestigate(state, leads), discoveryTurns);
  if (toInvestigate.length > 0) {
    // SITP, Leads shown: at most four lines; with more than four Leads, the first three and a line for the rest.
    const shown =
      toInvestigate.length <= LEADS_SHOWN_MAX ? toInvestigate : toInvestigate.slice(0, LEADS_SHOWN_MAX - 1);
    groups.push({
      id: 'leads',
      count: toInvestigate.length,
      rows: shown,
      more: toInvestigate.length - shown.length,
    });
  }
  return groups;
}

/** The Required progress range of a Lead as the GUI writes it, e.g. "3–4", or null while it is unknown. */
export function rangeText(lead: Pick<LeadView, 'requiredProgressRange'> | null | undefined): string | null {
  const range = lead?.requiredProgressRange;
  return range === undefined || range === 'unknown' ? null : `${range.min}–${range.max}`;
}
