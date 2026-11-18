/** WHIST, Action record; ECON, Money in the Action record. */
import { describe, expect, it } from 'vitest';
import { historyView } from '../../src/engine/views/views.ts';
import { act, addMissionSite, advance, agentIds, gdrs, newCampaign, tryAct } from '../helpers/game.ts';

describe('WHIST: Action record', () => {
  it('Acceptance example: an undone action is not listed, and the Advance turn moves the record into the History entry', () => {
    const start = newCampaign({ money: 500 });
    expect(start.world.history.currentActions).toEqual([]);
    const { state: withSite, site } = addMissionSite(start, 'apprehend_member');
    let state = act(withSite, 'hireAgent');
    state = act(state, 'hireAgent');
    const [a1, a2, a3] = agentIds(withSite) as [string, string, string];
    const deployed = act(state, 'deployAgents', { missionSite: site, agents: [a1, a2, a3] });
    expect(deployed.world.history.currentActions.at(-1)).toEqual({
      operation: 'deployAgents',
      args: { missionSite: site, agents: [a1, a2, a3] },
      moneyChange: 0,
    });
    // Undo restores the Committed state before deployAgents, with its Action record.
    const ended = advance(state);
    const entry = ended.world.history.historyEntries.at(-1)!;
    expect(entry.actions).toEqual([
      { operation: 'hireAgent', args: {}, moneyChange: -gdrs.economy.hireCost },
      { operation: 'hireAgent', args: {}, moneyChange: -gdrs.economy.hireCost },
    ]);
    expect(ended.world.history.currentActions).toEqual([]);
    expect(historyView(ended, gdrs).entries.at(-1)!.actions).toHaveLength(2);
  });

  it('lists a Player cheat action with its money change, and neither a rejected action nor one with no effect', () => {
    let state = newCampaign({ money: 0 });
    state = act(state, 'addMoney', { amount: 250 }, 'developer');
    expect(state.world.history.currentActions).toEqual([
      { operation: 'addMoney', args: { amount: 250 }, moneyChange: 250 },
    ]);
    const rejected = tryAct(state, 'purchaseUpgrade', { upgrade: 'no_such_upgrade' });
    expect('rejected' in rejected).toBe(true);
    expect(state.world.history.currentActions).toHaveLength(1);
  });
});
