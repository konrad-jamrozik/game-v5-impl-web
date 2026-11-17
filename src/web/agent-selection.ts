/**
 * AVIEW, Filters and Agent table: which Agents in the Agents View can be selected, and why the others cannot.
 */
import type { AgentView } from '../engine/index.ts';

export const ASSIGNMENTS = ['Standby', 'Contracting', 'Training'] as const;
export type OrderAssignment = (typeof ASSIGNMENTS)[number];

/**
 * AVIEW, Re-assigning: changing the Assignment of an Agent on Contracting or an Investigation, or of an Agent In
 * transit.
 */
export function isReassigning(agent: AgentView): boolean {
  return (
    agent.agentStatus === 'InTransit' ||
    agent.assignment?.kind === 'Contracting' ||
    agent.assignment?.kind === 'Investigation'
  );
}

/** The inputs that decide which Agents can be selected, under AVIEW, Filters. */
export interface Selectability {
  /** For each Assignment, the Agents `assignAgents` would accept alone; see DEC-046. */
  readonly acceptedAlone: Readonly<Record<OrderAssignment, readonly string[]>>;
  readonly dismissable: readonly string[];
  readonly trainingPlacesLeft: number;
  readonly selectionFilter: OrderAssignment | null;
  readonly allowReassign: boolean;
}

/** AVIEW, Selection filters: whether a button of Assign to would succeed with this Agent alone. */
function wouldAssign(agent: AgentView, assignment: OrderAssignment, s: Selectability): boolean {
  return s.acceptedAlone[assignment].includes(agent.id) && (s.allowReassign || !isReassigning(agent));
}

/** AVIEW, Selection filters: whether the Agent can be selected. */
export function isSelectable(agent: AgentView, s: Selectability): boolean {
  if (s.selectionFilter !== null) {
    return wouldAssign(agent, s.selectionFilter, s);
  }
  return (
    ASSIGNMENTS.some((assignment) => wouldAssign(agent, assignment, s)) || s.dismissable.includes(agent.id)
  );
}

/**
 * AVIEW, Agent table: why an Agent cannot be selected, as the first reason that applies, or '' when it can be.
 * `fallback` gives the engine's rejection message for an Agent no listed reason covers.
 */
export function unselectableReason(agent: AgentView, s: Selectability, fallback: () => string): string {
  if (isSelectable(agent, s)) {
    return '';
  }
  const kind = agent.assignment?.kind;
  const filter = s.selectionFilter;
  if (kind === 'Deployed') {
    return 'Deployed';
  }
  if (kind === 'Recovery') {
    return 'Recovering';
  }
  if (!s.allowReassign && agent.agentStatus === 'InTransit') {
    return 'In transit';
  }
  if (!s.allowReassign && (kind === 'Contracting' || kind === 'Investigation')) {
    return 'On assignment';
  }
  if (filter !== null && kind === filter) {
    return `Already on ${filter}`;
  }
  if (!agent.fitForWork && (filter === 'Contracting' || filter === 'Training')) {
    return 'Too exhausted';
  }
  if (filter === 'Training' && s.trainingPlacesLeft === 0) {
    return 'Training full';
  }
  return fallback();
}
