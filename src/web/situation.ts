/**
 * GUI, Situation panel: the groups of work under way and of work waiting for the Player, in the order GUI lists them,
 * each left out when it has nothing to show. Pure presentation over the Player API views; no gameplay rule.
 */
import type { CurrentStateView, InvestigationView, LeadView, MissionSiteView } from '../engine/index.ts';

/** VIS, Panels and cards: a Mission site that expires within this many Turns shows them in Accent text. */
export const SOON_EXPIRING_TURNS = 2;

export interface ActiveInvestigationRow {
  readonly investigation: InvestigationView;
  readonly lead: LeadView | null;
  readonly teamSize: number;
  readonly inTransit: number;
  /** The number of Turns since its Turn started. */
  readonly turns: number;
}

export type SituationGroup =
  | {
      readonly id: 'investigations';
      readonly count: number;
      readonly rows: readonly ActiveInvestigationRow[];
    }
  | { readonly id: 'leads'; readonly count: number; readonly rows: readonly LeadView[] }
  | {
      readonly id: 'missionSites';
      readonly count: number;
      readonly rows: readonly { readonly site: MissionSiteView; readonly factionName: string }[];
    }
  | { readonly id: 'training'; readonly count: number; readonly cap: number }
  | { readonly id: 'standby'; readonly count: number; readonly agents: readonly string[] };

export const GROUP_TITLES: Record<SituationGroup['id'], string> = {
  investigations: 'Active Investigations',
  leads: 'Leads to investigate',
  missionSites: 'Active Mission sites',
  training: 'Free Training places',
  standby: 'Agents on Standby',
};

/** The Situation panel's groups; an empty result means that nothing needs attention. */
export function situationGroups(state: CurrentStateView): SituationGroup[] {
  const groups: SituationGroup[] = [];
  const leadsById = new Map(state.leads.map((lead) => [lead.id, lead]));

  const investigations = state.investigations
    .filter((item) => item.lifecycle === 'Active')
    .map((investigation) => ({
      investigation,
      lead: leadsById.get(investigation.lead) ?? null,
      teamSize: investigation.currentTeam.length,
      inTransit: investigation.currentTeam.filter((member) => member.agentStatus === 'InTransit').length,
      turns: state.turn - investigation.turnStarted,
    }));
  if (investigations.length > 0) {
    groups.push({ id: 'investigations', count: investigations.length, rows: investigations });
  }

  const activeLeads = new Set(
    state.investigations.filter((item) => item.lifecycle === 'Active').map((item) => item.lead),
  );
  const leads = state.leads.filter((lead) => lead.status === 'Available' && !activeLeads.has(lead.id));
  if (leads.length > 0) {
    groups.push({ id: 'leads', count: leads.length, rows: leads });
  }

  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]));
  const sites = state.missionSites
    .filter((site) => site.lifecycle === 'Active')
    .map((site) => ({ site, factionName: factionNames.get(site.targetFaction) ?? site.targetFaction }));
  if (sites.length > 0) {
    groups.push({ id: 'missionSites', count: sites.length, rows: sites });
  }

  const freeTraining = state.agency.trainingCap - state.agency.trainingAgents;
  if (freeTraining > 0) {
    groups.push({ id: 'training', count: freeTraining, cap: state.agency.trainingCap });
  }

  const standby = state.agents
    .filter((agent) => agent.assignment?.kind === 'Standby')
    .map((agent) => agent.id);
  if (standby.length > 0) {
    groups.push({ id: 'standby', count: standby.length, agents: standby });
  }
  return groups;
}

/** The Required progress range of a Lead as the Situation panel and Turn summary write it, e.g. "3–4". */
export function rangeText(lead: Pick<LeadView, 'requiredProgressRange'> | null | undefined): string | null {
  const range = lead?.requiredProgressRange;
  return range === undefined || range === 'unknown' ? null : `${range.min}–${range.max}`;
}
