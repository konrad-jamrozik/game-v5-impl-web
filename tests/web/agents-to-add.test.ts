/** LVIEW, Team: the default order of the Agents to add table. */
import { describe, expect, it } from 'vitest';
import type { Assignment } from '../../src/engine/index.ts';
import { agentsToAddOrder } from '../../src/web/agents-to-add.ts';

const agent = (id: string, kind: Assignment['kind'], effectiveSkill: number) => ({
  id,
  assignment: { kind } as Assignment,
  effectiveSkill,
});

describe('LVIEW: Agents to add order', () => {
  it('puts Standby and Training first, then the rest, each by effective skill and then by Instance ID', () => {
    const order = agentsToAddOrder([
      agent('agent-1', 'Contracting', 300),
      agent('agent-2', 'Standby', 90),
      agent('agent-10', 'Training', 120),
      agent('agent-3', 'Investigation', 150),
      agent('agent-9', 'Standby', 120),
    ]).map((item) => item.id);
    expect(order).toEqual(['agent-9', 'agent-10', 'agent-2', 'agent-1', 'agent-3']);
  });
});
