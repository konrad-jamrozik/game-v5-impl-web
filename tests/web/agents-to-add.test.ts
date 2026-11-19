/** LVIEW, Team: which Agents the Agents to add table lists, and its default order. */
import { describe, expect, it } from 'vite-plus/test';
import type { Assignment } from '../../src/engine/index.ts';
import { agentsToAddOrder, isInBase } from '../../src/web/agents-to-add.ts';

const agent = (id: string, kind: Assignment['kind'], effectiveSkill: number) => ({
  id,
  assignment: { kind } as Assignment,
  effectiveSkill,
});

describe('LVIEW: Agents to add', () => {
  it('lists only Agents on a Base Assignment', () => {
    expect(isInBase(agent('agent-1', 'Standby', 1))).toBe(true);
    expect(isInBase(agent('agent-2', 'Training', 1))).toBe(true);
    expect(isInBase(agent('agent-3', 'Contracting', 1))).toBe(false);
    expect(isInBase(agent('agent-4', 'Investigation', 1))).toBe(false);
  });

  it('orders by effective skill, highest first, and then by Instance ID', () => {
    const order = agentsToAddOrder([
      agent('agent-2', 'Standby', 90),
      agent('agent-10', 'Training', 120),
      agent('agent-9', 'Standby', 120),
    ]).map((item) => item.id);
    expect(order).toEqual(['agent-9', 'agent-10', 'agent-2']);
  });
});
