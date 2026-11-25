/** AVIEW, Agent table: how an Agent's Assignment reads, and the Lead or Mission site it leads to. */
import type { AgentView, CurrentLiveWorldStateView, CurrentRetiredWorldStateView } from '../engine/index.ts';

/** The Lead or Mission site an Assignment names, as the Detail view that details it selects it. */
export type AssignmentTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  | { readonly kind: 'missionSite'; readonly missionSite: string };

/** VIS, Icons: the In transit icon as text, a flying airplane, and the name the pointer resting on it shows. */
export const IN_TRANSIT_ICON = '✈';
export const IN_TRANSIT_NAME = 'In transit';

/**
 * AVIEW, Agent table: an Assignment in parts: its text, which never names the work it is on, e.g. "Investigating";
 * the Lead or Mission site it leads to and that item's `name`, which the pointer resting on the text shows; and
 * whether the Agent is In transit, which the In transit icon marks.
 */
export interface AssignmentParts {
  readonly text: string;
  readonly target: AssignmentTarget | null;
  readonly targetName: string | null;
  readonly inTransit: boolean;
}

/** AVIEW, Agent table: an Assignment reads without its Lead's or Mission site's name, and leads to it. */
export function assignmentParts(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired?: CurrentRetiredWorldStateView | null,
): AssignmentParts {
  const assignment = agent.assignment;
  const inTransit = agent.agentStatus === 'InTransit';
  if (assignment === null) {
    return { text: agent.agentStatus, target: null, targetName: null, inTransit };
  }
  if (assignment.kind === 'Investigation') {
    const investigation =
      state.investigations.find((item) => item.id === assignment.investigation) ??
      retired?.investigations.find((item) => item.id === assignment.investigation);
    return {
      text: 'Investigating',
      target: investigation === undefined ? null : { kind: 'lead', lead: investigation.lead },
      targetName: investigation?.leadName ?? null,
      inTransit,
    };
  }
  if (assignment.kind === 'Deployed') {
    const mission = state.missions.find((item) => item.id === assignment.mission);
    const site = state.missionSites.find((item) => item.id === mission?.missionSite);
    return {
      text: 'Deployed',
      target: mission === undefined ? null : { kind: 'missionSite', missionSite: mission.missionSite },
      targetName: site?.name ?? null,
      inTransit,
    };
  }
  if (assignment.kind === 'Recovery' && agent.recoveryTurnsRemaining !== null) {
    return {
      text: `Recovery · ${agent.recoveryTurnsRemaining} T left`,
      target: null,
      targetName: null,
      inTransit,
    };
  }
  return { text: assignment.kind, target: null, targetName: null, inTransit };
}

/**
 * AVIEW, Agent table: an Assignment as one line of text, the In transit icon included, e.g. "Contracting ✈"; the
 * value the Assignment column sorts by.
 */
export function assignmentText(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired?: CurrentRetiredWorldStateView | null,
): string {
  const parts = assignmentParts(agent, state, retired);
  return parts.inTransit ? `${parts.text} ${IN_TRANSIT_ICON}` : parts.text;
}

/**
 * AVIEW, Agent table: the colour of an Assignment cell, as a class: Accent text for Recovery, Text muted for Standby
 * or In transit, and Positive otherwise.
 */
export function assignmentTone(agent: AgentView): string {
  if (agent.assignment?.kind === 'Recovery' || agent.agentStatus === 'Recovering') {
    return 'tone-accent';
  }
  if (agent.agentStatus === 'InTransit' || agent.assignment?.kind === 'Standby') {
    return 'muted';
  }
  return 'tone-good';
}
