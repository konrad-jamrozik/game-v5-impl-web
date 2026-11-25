/**
 * MVIEW, Deployment: the order of the Agents in the deployment table. Pure presentation; no gameplay rule.
 */
import type { AgentView } from '../engine/index.ts';
import { compareValues, sortRows, type SortTier } from './table-sort.ts';

/** MVIEW, Deployment: the sortable columns of the deployment table, in their order; it shows no Assignment. */
export type DeployKey = 'id' | 'combatRating' | 'effectiveSkill' | 'skillHundredths' | 'exhaustion';

/** MVIEW, Deployment: the columns that hold numbers, which sort descending first under VIS, Tables. */
export const DEPLOY_NUMERIC: ReadonlySet<DeployKey> = new Set([
  'combatRating',
  'effectiveSkill',
  'skillHundredths',
  'exhaustion',
]);

type DeployAgent = Pick<
  AgentView,
  'id' | 'combatRating' | 'effectiveSkill' | 'skillHundredths' | 'exhaustion'
>;

/**
 * MVIEW, Deployment: `candidates` in the table's default order, by Instance ID, then ordered by `tiers` under
 * VIS, Tables.
 */
export function deployRows<A extends DeployAgent>(
  candidates: readonly A[],
  tiers: readonly SortTier<DeployKey>[],
): A[] {
  const byId = [...candidates].sort((a, b) => compareValues(a.id, b.id));
  return sortRows(byId, tiers, (agent, key) =>
    key === 'combatRating' ? (agent.combatRating ?? 0) : agent[key],
  );
}
