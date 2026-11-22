/** WHIST, Action record; ECON, Money in the Action record. */
import { describe, expect, it } from 'vite-plus/test';
import { historyView } from '../../src/engine/views/views.ts';
import { act, addMissionSite, advance, agentIds, gdrs, newCampaign, tryAct } from '../helpers/game.ts';

describe('WHIST: Action record', () => {
  it('example: an undone action is not listed, and the Advance turn moves the record into the History entry', () => {
    const start = newCampaign({ money: 500 });
    expect(start.world.history.currentActions).toEqual([]);
    const { state: withSite, site } = addMissionSite(start, 'apprehend_member');
    let state = act(withSite, 'hireAgents', { count: 1 });
    state = act(state, 'hireAgents', { count: 1 });
    const [a1, a2, a3] = agentIds(withSite) as [string, string, string];
    const deployed = act(state, 'deployAgents', { missionSite: site, agents: [a1, a2, a3] });
    expect(deployed.world.history.currentActions.at(-1)).toEqual({
      operation: 'deployAgents',
      args: { missionSite: site, agents: [a1, a2, a3] },
      moneyChange: 0,
    });
    // Undo restores the World state before deployAgents, with its Action record.
    const ended = advance(state);
    const entry = ended.world.history.historyEntries.at(-1)!;
    expect(entry.actions).toEqual([
      { operation: 'hireAgents', args: { count: 1 }, moneyChange: -gdrs.economy.hireCost },
      { operation: 'hireAgents', args: { count: 1 }, moneyChange: -gdrs.economy.hireCost },
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

describe('WHIST: Open History entry', () => {
  it('example: follows the World state through undo and redo, and becomes the History entry', () => {
    const start = newCampaign({ money: 500 });
    // Before the first committed Advance turn, the Open History entry of Turn 1 is all getHistory() returns.
    expect(historyView(start, gdrs).entries).toEqual([]);
    expect(historyView(start, gdrs).openEntry).toMatchObject({ turn: 1, actions: [] });
    const once = act(start, 'hireAgents', { count: 1 });
    const twice = act(once, 'hireAgents', { count: 1 });
    const open = historyView(twice, gdrs).openEntry;
    expect(open.actions).toHaveLength(2);
    expect(open.turnStart).toEqual(start.world.history.currentTurnStart);
    expect(open.turnEnd.servingAgents).toBe(open.turnStart.servingAgents + 2);
    expect(open.turnEnd.money).toBe(500 - 2 * gdrs.economy.hireCost);
    // Undo restores the earlier World state, whose Open History entry lacks the undone item and its Agent.
    const undone = historyView(once, gdrs).openEntry;
    expect(undone.actions).toHaveLength(1);
    expect(undone.turnEnd.servingAgents).toBe(open.turnStart.servingAgents + 1);
    // Advance turn makes it the History entry of Turn 1, and Turn 2 starts with an empty one.
    const ended = advance(twice);
    const entry = historyView(ended, gdrs).entries.at(-1)!;
    expect({
      turn: entry.turn,
      turnStart: entry.turnStart,
      turnEnd: entry.turnEnd,
      actions: entry.actions,
    }).toEqual(open);
    expect(historyView(ended, gdrs).openEntry).toMatchObject({ turn: 2, actions: [] });
  });
});
