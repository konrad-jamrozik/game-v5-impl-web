/** AVIEW, Agent table: how an Agent's Assignment reads, and the Lead or Mission site it leads to. */
import type { AgentView, CurrentLiveWorldStateView, CurrentRetiredWorldStateView } from '../engine/index.ts';

/** The Lead or Mission site an Assignment names, as the Detail view that details it selects it. */
export type AssignmentTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  | { readonly kind: 'missionSite'; readonly missionSite: string };

/**
 * AVIEW, Agent table: an Assignment in parts: the text before the Lead or Mission site it names, that name and the
 * item it leads to, and the In transit that follows, e.g. "Investigating: " and "Contracting opportunities".
 */
export interface AssignmentParts {
  readonly lead: string;
  readonly name: string | null;
  readonly target: AssignmentTarget | null;
  readonly transit: string;
}

/** AVIEW, Agent table: an Assignment names its Lead or Mission site, and an Agent In transit says so. */
export function assignmentParts(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired?: CurrentRetiredWorldStateView | null,
): AssignmentParts {
  const assignment = agent.assignment;
  const transit = agent.agentStatus === 'InTransit' ? ' · In transit' : '';
  if (assignment === null) {
    return { lead: agent.agentStatus, name: null, target: null, transit };
  }
  if (assignment.kind === 'Investigation') {
    const investigation =
      state.investigations.find((item) => item.id === assignment.investigation) ??
      retired?.investigations.find((item) => item.id === assignment.investigation);
    return {
      lead: 'Investigating: ',
      name: investigation?.leadName ?? assignment.investigation,
      target: investigation === undefined ? null : { kind: 'lead', lead: investigation.lead },
      transit,
    };
  }
  if (assignment.kind === 'Deployed') {
    const mission = state.missions.find((item) => item.id === assignment.mission);
    const site = state.missionSites.find((item) => item.id === mission?.missionSite);
    return {
      lead: 'Deployed: ',
      name: site?.name ?? assignment.mission,
      target: mission === undefined ? null : { kind: 'missionSite', missionSite: mission.missionSite },
      transit,
    };
  }
  if (assignment.kind === 'Recovery' && agent.recoveryTurnsRemaining !== null) {
    return { lead: `Recovery · ${agent.recoveryTurnsRemaining} T left`, name: null, target: null, transit };
  }
  return { lead: assignment.kind, name: null, target: null, transit };
}

/** AVIEW, Agent table: an Assignment as one line of text, e.g. "Investigating: Contracting opportunities". */
export function assignmentText(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired?: CurrentRetiredWorldStateView | null,
): string {
  const parts = assignmentParts(agent, state, retired);
  return `${parts.lead}${parts.name ?? ''}${parts.transit}`;
}
