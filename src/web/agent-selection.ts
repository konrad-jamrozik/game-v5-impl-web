/**
 * AVIEW, Assignment filters and Agent table: which Agents in the Agents View can be selected, and what blocks the
 * others.
 */
import type { AgentView } from '../engine/index.ts';

export const ASSIGNMENTS = ['Standby', 'Contracting', 'Training'] as const;
export type OrderAssignment = (typeof ASSIGNMENTS)[number];

/** The inputs that decide which Agents can be selected, under AVIEW, Assignment filters. */
export interface Selectability {
  /** For each Assignment, the Agents `assignAgents` would accept alone; see DEC-046. */
  readonly acceptedAlone: Readonly<Record<OrderAssignment, readonly string[]>>;
  readonly trainingPlacesLeft: number;
  /** The Assignment filter that is on, if any. */
  readonly assignmentFilter: OrderAssignment | null;
}

/**
 * AVIEW, Assignment filters: while one is on, only the Agents its button would succeed with alone can be selected;
 * while none is on, every shown Serving Agent can be, and the buttons follow the whole selection.
 */
export function isSelectable(agent: AgentView, s: Selectability): boolean {
  return s.assignmentFilter === null || s.acceptedAlone[s.assignmentFilter].includes(agent.id);
}

/**
 * AVIEW, Agent table: the Blocked by of an Agent, the first reason that applies, or '' when it can be selected, which
 * is every Agent's while no Assignment filter is on. `fallback` gives the engine's rejection message for an Agent no
 * listed reason covers.
 */
export function blockedBy(agent: AgentView, s: Selectability, fallback: () => string): string {
  if (isSelectable(agent, s)) {
    return '';
  }
  const kind = agent.assignment?.kind;
  const filter = s.assignmentFilter;
  if (kind === 'Deployed') {
    return 'Deployed';
  }
  if (kind === 'Recovery') {
    return 'Recovering';
  }
  if (agent.agentStatus === 'InTransit') {
    return 'In transit';
  }
  if (
    (kind === 'Contracting' || kind === 'Investigation') &&
    (filter === 'Contracting' || filter === 'Training')
  ) {
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
