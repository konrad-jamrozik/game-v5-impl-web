/**
 * LVIEW, Team: the default order of the Agents to add table. The Agents whose Assignment is Standby or Training join
 * without interrupting any work, so they come first, and then the rest; within each group by effective skill, highest
 * first, and then by Instance ID. Pure presentation; no gameplay rule.
 */
import type { AgentView } from '../engine/index.ts';
import { compareValues } from './table-sort.ts';

/** Whether an Agent joins without interrupting any work: its Assignment is Standby or Training. */
export function joinsWithoutInterrupting(agent: Pick<AgentView, 'assignment'>): boolean {
  return agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training';
}

/** The Agents in the default order of the Agents to add table. */
export function agentsToAddOrder<A extends Pick<AgentView, 'id' | 'assignment' | 'effectiveSkill'>>(
  agents: readonly A[],
): A[] {
  return [...agents].sort(
    (a, b) =>
      Number(joinsWithoutInterrupting(b)) - Number(joinsWithoutInterrupting(a)) ||
      b.effectiveSkill - a.effectiveSkill ||
      compareValues(a.id, b.id),
  );
}
