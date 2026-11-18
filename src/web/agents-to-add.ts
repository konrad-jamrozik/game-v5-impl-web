/**
 * LVIEW, Team: which Agents the Agents to add table lists, and its default order: by effective skill, highest first,
 * and then by Instance ID. Pure presentation; no gameplay rule.
 */
import type { AgentView } from '../engine/index.ts';
import { compareValues } from './table-sort.ts';

/** Whether an Agent's Assignment is a Base Assignment, Standby or Training, the only one an Agent joins from. */
export function isInBase(agent: Pick<AgentView, 'assignment'>): boolean {
  return agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training';
}

/** The Agents in the default order of the Agents to add table. */
export function agentsToAddOrder<A extends Pick<AgentView, 'id' | 'effectiveSkill'>>(
  agents: readonly A[],
): A[] {
  return [...agents].sort((a, b) => b.effectiveSkill - a.effectiveSkill || compareValues(a.id, b.id));
}
