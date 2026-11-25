/** MVIEW, Deployment: the deployment table's default order and its sorting by column headers. */
import { describe, expect, it } from 'vite-plus/test';
import { DEPLOY_NUMERIC, deployRows } from '../../src/web/deploy-table.ts';
import { pressHeader } from '../../src/web/table-sort.ts';

const agent = (
  id: string,
  combatRating: number,
  effectiveSkill: number,
  skill: number,
  exhaustion: number,
) => ({
  id,
  combatRating,
  effectiveSkill,
  skillHundredths: skill * 100,
  exhaustion,
});

// The orders by Instance ID, Combat rating, effective skill, base skill, and exhaustion all differ, so that each test
// shows its own key.
const candidates = [
  agent('agent-10', 150, 120, 130, 29),
  agent('agent-2', 110, 129, 129, 5),
  agent('agent-9', 160, 100, 125, 23),
  agent('agent-3', 120, 123, 140, 0),
];
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('MVIEW: Deployment table', () => {
  it('lists the Agents by Instance ID by default', () => {
    expect(ids(deployRows(candidates, []))).toEqual(['agent-2', 'agent-3', 'agent-9', 'agent-10']);
  });

  it('sorts by Combat rating, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'combatRating', DEPLOY_NUMERIC.has('combatRating'));
    expect(ids(deployRows(candidates, tiers))).toEqual(['agent-9', 'agent-10', 'agent-3', 'agent-2']);
  });

  it('sorts by effective skill, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'effectiveSkill', DEPLOY_NUMERIC.has('effectiveSkill'));
    expect(ids(deployRows(candidates, tiers))).toEqual(['agent-2', 'agent-3', 'agent-10', 'agent-9']);
  });

  it('sorts by base skill, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'skillHundredths', DEPLOY_NUMERIC.has('skillHundredths'));
    expect(ids(deployRows(candidates, tiers))).toEqual(['agent-3', 'agent-10', 'agent-2', 'agent-9']);
  });

  it('sorts by exhaustion, highest first, on the first press of its header', () => {
    const tiers = pressHeader([], 'exhaustion', DEPLOY_NUMERIC.has('exhaustion'));
    expect(ids(deployRows(candidates, tiers))).toEqual(['agent-10', 'agent-9', 'agent-2', 'agent-3']);
  });
});
