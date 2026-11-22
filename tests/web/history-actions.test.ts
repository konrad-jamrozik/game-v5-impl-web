/** HVIEW, Turn by Turn table and Player actions list. */
import { describe, expect, it } from 'vite-plus/test';
import type { ActionRecordItem } from '../../src/engine/index.ts';
import { actionLines, expenditures, type ActionNames } from '../../src/web/history-actions.ts';

const names: ActionNames = {
  lead: (id) => (id === 'locate_red_dawn_courier' ? 'Locate Red Dawn courier' : id),
  investigationLead: () => 'Locate Red Dawn courier',
  missionSite: () => 'Raid safehouse',
  upgrade: (id) => (id === 'agent_cap' ? 'Agent cap' : id),
};

const item = (operation: string, args: unknown, moneyChange = 0): ActionRecordItem => ({
  operation,
  args,
  moneyChange,
});

describe('HVIEW: Player actions list', () => {
  it('groups consecutive equal items into one line with their totals', () => {
    const actions = [
      ...Array.from({ length: 4 }, () => item('hireAgents', { count: 1 }, -50)),
      ...Array.from({ length: 3 }, () => item('purchaseUpgrade', { upgrade: 'agent_cap' }, -200)),
    ];
    expect(actionLines(actions, names)).toEqual([
      { numbers: '1–4', text: 'Hired 4 Agents', moneyChange: -200 },
      { numbers: '5–7', text: 'Bought 3 Agent cap Upgrades', moneyChange: -600 },
    ]);
    expect(expenditures(actions)).toBe(800);
  });

  it('joins consecutive hireAgents items whatever their count, and counts an item written as hireAgent as one Agent', () => {
    const actions = [
      item('hireAgents', { count: 12 }, -600),
      item('hireAgents', { count: 1 }, -50),
      item('hireAgent', {}, -50),
      item('purchaseUpgrade', { upgrade: 'agent_cap' }, -200),
      item('hireAgents', { count: 3 }, -150),
    ];
    expect(actionLines(actions, names)).toEqual([
      { numbers: '1–3', text: 'Hired 14 Agents', moneyChange: -700 },
      { numbers: '4', text: 'Bought 1 Agent cap Upgrade', moneyChange: -200 },
      { numbers: '5', text: 'Hired 3 Agents', moneyChange: -150 },
    ]);
  });

  it('says what each operation did, in the singular for a count of 1', () => {
    const lines = actionLines(
      [
        item('hireAgents', { count: 1 }, -50),
        item('assignAgents', { agents: ['a1', 'a2', 'a3', 'a4', 'a5'], assignment: 'Contracting' }),
        item('startInvestigation', { lead: 'locate_red_dawn_courier', agents: ['a6', 'a7'] }),
        item('assignAgentsToInvestigation', { investigation: 'i1', agents: ['a8'] }),
        item('deployAgents', { missionSite: 's1', agents: ['a1', 'a2', 'a3'] }),
        item('dismissAgents', { agents: ['a9'] }),
        item('addMoney', { amount: 500 }, 500),
        item('addMoney', { amount: -15 }, -15),
        item('addAgents', { count: 2 }),
        item('overrideRandomOutcome', { outcome: 'combat.hit.a1', value: true }),
      ],
      names,
    ).map((line) => line.text);
    expect(lines).toEqual([
      'Hired 1 Agent',
      'Assigned 5 Agents to Contracting',
      'Started Investigation of Locate Red Dawn courier with 2 Agents',
      'Assigned 1 Agent to Investigation of Locate Red Dawn courier',
      'Deployed 3 Agents to Raid safehouse',
      'Dismissed 1 Agent',
      'Added 500 money (cheat)',
      'Removed 15 money (cheat)',
      'Added 2 Agents (cheat)',
      'overrideRandomOutcome',
    ]);
  });

  it('counts only money spent as Expenditures', () => {
    expect(expenditures([item('addMoney', { amount: 500 }, 500), item('assignAgents', {})])).toBe(0);
  });
});
