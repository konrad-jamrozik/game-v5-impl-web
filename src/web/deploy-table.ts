/**
 * MVIEW, Deployment: the order of the Agents in the deployment table. Pure presentation; no gameplay rule.
 */
import type { AgentView } from '../engine/index.ts';
import { compareValues, sortRows, type SortTier } from './table-sort.ts';

/** MVIEW, Deployment: the sortable columns of the deployment table, in their order. */
export type DeployKey = 'id' | 'assignment' | 'effectiveSkill' | 'exhaustion';

/** MVIEW, Deployment: the columns that hold numbers, which sort descending first under VIS, Tables. */
export const DEPLOY_NUMERIC: ReadonlySet<DeployKey> = new Set(['effectiveSkill', 'exhaustion']);

/**
 * MVIEW, Deployment: `candidates` in the table's default order, by Instance ID, then ordered by `tiers` under
 * VIS, Tables. The exhaustion column sorts by every Agent's exhaustion, whether its cell shows it or not.
 */
export function deployRows<A extends Pick<AgentView, 'id' | 'effectiveSkill' | 'exhaustion'>>(
  candidates: readonly A[],
  tiers: readonly SortTier<DeployKey>[],
  assignment: (agent: A) => string,
): A[] {
  const byId = [...candidates].sort((a, b) => compareValues(a.id, b.id));
  return sortRows(byId, tiers, (agent, key) => (key === 'assignment' ? assignment(agent) : agent[key]));
}
