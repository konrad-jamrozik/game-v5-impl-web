/** MVIEW, Deployment: the deployment table's default order and its sorting by column headers. */
import { describe, expect, it } from 'vite-plus/test';
import { DEPLOY_NUMERIC, deployRows } from '../../src/web/deploy-table.ts';
import { pressHeader } from '../../src/web/table-sort.ts';

const agent = (id: string, assignment: string, effectiveSkill: number, exhaustion: number) => ({
  id,
  assignment,
  effectiveSkill,
  exhaustion,
});

// The orders by Instance ID, by effective skill, and by exhaustion all differ, so that each test shows its own key.
const candidates = [
  agent('agent-10', 'Training', 120, 29),
  agent('agent-2', 'Standby', 129, 5),
  agent('agent-9', 'Standby', 100, 23),
  agent('agent-3', 'Training', 123, 0),
];
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);
const assignment = (row: { assignment: string }) => row.assignment;

describe('MVIEW: Deployment table', () => {
  it('lists the Agents by Instance ID by default', () => {
    expect(ids(deployRows(candidates, [], assignment))).toEqual([
      'agent-2',
      'agent-3',
      'agent-9',
      'agent-10',
    ]);
  });

  it('sorts by effective skill, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'effectiveSkill', DEPLOY_NUMERIC.has('effectiveSkill'));
    expect(ids(deployRows(candidates, tiers, assignment))).toEqual([
      'agent-2',
      'agent-3',
      'agent-10',
      'agent-9',
    ]);
  });

  it('sorts by exhaustion, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'exhaustion', DEPLOY_NUMERIC.has('exhaustion'));
    expect(ids(deployRows(candidates, tiers, assignment))).toEqual([
      'agent-10',
      'agent-9',
      'agent-2',
      'agent-3',
    ]);
  });

  it('refines an earlier sort: by Assignment, and within it by effective skill', () => {
    const bySkill = pressHeader([], 'effectiveSkill', true);
    const tiers = pressHeader(bySkill, 'assignment', DEPLOY_NUMERIC.has('assignment'));
    expect(ids(deployRows(candidates, tiers, assignment))).toEqual([
      'agent-2',
      'agent-9',
      'agent-3',
      'agent-10',
    ]);
  });
});
