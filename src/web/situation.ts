/**
 * SITP, Groups: the one-line groups of the Situation panel, in the order SITP lists them, each left out when it has
 * nothing to show. Pure presentation over the Player API views; no gameplay rule.
 */
import type { CurrentStateView, InvestigationView, LeadView, MissionSiteView } from '../engine/index.ts';
import {
  completionEstimate,
  progressCircle,
  type CompletionEstimate,
  type ProgressCircleModel,
} from './completion.ts';

/** VIS, Panels and cards: a Mission site that expires within this many Turns shows them in Accent text. */
export const SOON_EXPIRING_TURNS = 2;

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
  | { readonly id: 'leads'; readonly count: number; readonly rows: readonly LeadView[] }
  | {
      readonly id: 'agents';
      /** The number of Serving Agents. */
      readonly count: number;
      readonly standby: number;
      readonly trainingFree: number;
    };

export const GROUP_TITLES: Record<SituationGroup['id'], string> = {
  missionSites: 'Active Mission sites',
  investigations: 'Active Investigations',
  leads: 'Leads to investigate',
  agents: 'Agents',
};

/** The Active Investigations, each with its Lead, Progress circle, and Completion estimate. */
export function activeInvestigationRows(state: CurrentStateView): ActiveInvestigationRow[] {
  const leadsById = new Map(state.leads.map((lead) => [lead.id, lead]));
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
export function leadsToInvestigate(state: CurrentStateView): LeadView[] {
  const investigated = new Set(
    state.investigations.filter((item) => item.lifecycle === 'Active').map((item) => item.lead),
  );
  return state.leads.filter((lead) => lead.status === 'Available' && !investigated.has(lead.id));
}

/** The Situation panel's groups; an empty result means that nothing needs attention. */
export function situationGroups(state: CurrentStateView): SituationGroup[] {
  const groups: SituationGroup[] = [];

  const sites = state.missionSites.filter((site) => site.lifecycle === 'Active');
  if (sites.length > 0) {
    groups.push({ id: 'missionSites', count: sites.length, rows: sites });
  }

  const investigations = activeInvestigationRows(state);
  if (investigations.length > 0) {
    groups.push({ id: 'investigations', count: investigations.length, rows: investigations });
  }

  const leads = leadsToInvestigate(state);
  if (leads.length > 0) {
    groups.push({ id: 'leads', count: leads.length, rows: leads });
  }

  const standby = state.agents.filter((agent) => agent.assignment?.kind === 'Standby').length;
  const trainingFree = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
  if (standby > 0 || trainingFree > 0) {
    groups.push({ id: 'agents', count: state.agency.servingAgents, standby, trainingFree });
  }
  return groups;
}

/** The Required progress range of a Lead as the GUI writes it, e.g. "3–4", or null while it is unknown. */
export function rangeText(lead: Pick<LeadView, 'requiredProgressRange'> | null | undefined): string | null {
  const range = lead?.requiredProgressRange;
  return range === undefined || range === 'unknown' ? null : `${range.min}–${range.max}`;
}
