/**
 * TIMELINE, Timeline entries: a committed Advance turn discards the Timeline of the Turn it ends, including its Undone
 * actions, so an Undone action is never on the line of play of a later Turn. Autosave navigation (TIMELINE, Autosave
 * navigation) and the removal of Autosaves of abandoned play both read that line.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  ancestorStamps,
  commitAdvanceTurn,
  commitEntry,
  newCampaignRuntime,
} from '../../src/engine/timeline/campaign-runtime.ts';
import { CONTROLLER, expectOk, startHarness, type TestState } from '../helpers/test-rules.ts';

describe('TIMELINE: Undone actions discarded by Advance turn are not on the line of play', () => {
  it('a Turn ended from before an Undone action is not later than a Campaign save holding that action', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'lineage' }));
    expectOk(await h.act('gain', { amount: 1 }));
    // The save holds the World state after the gain; play then goes on from before it.
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const turnEnds = expectOk(await h.core.listSaves(CONTROLLER)).filter(
      (save) => save.autosaveKind === 'turnEnd',
    );
    expect(turnEnds.map((save) => save.turn)).toEqual([1, 2]);

    expectOk(await h.core.load(CONTROLLER, saveId));
    const status = expectOk(await h.core.getAutosaveStatus(CONTROLLER));
    // The Turn-end Autosave of Turn 1 holds the Turn-start state, which is earlier than the saved World state. That of
    // Turn 2 descends from the Turn-start state by Advance turn, not from the gain, so it belongs to another line.
    expect(status.undoToAutosave).toMatchObject({ autosaveKind: 'turnEnd', turn: 1 });
    expect(status.redoToAutosave).toBeNull();
    const redo = await h.core.redoToAutosave(CONTROLLER);
    expect(!redo.ok && redo.error.code).toBe('no_target');
  });

  it('ending a Turn with an Undone action leaves only the World states up to the Timeline pointer as ancestors', () => {
    const state = { configuration: { startingMoney: 0, multiplier: 1 } } as unknown as TestState;
    const record = { surface: 'player', name: 'gain', args: { amount: 1 } } as const;
    const campaign = newCampaignRuntime('campaign', state, 'turn-start');
    commitEntry(campaign, record, state, 'after-first');
    commitEntry(campaign, record, state, 'after-second');
    // Undo the second action: the Timeline pointer moves back by one.
    campaign.position -= 1;
    commitAdvanceTurn(campaign, state, 'next-turn-start');
    expect(ancestorStamps(campaign)).toEqual(['turn-start', 'after-first', 'next-turn-start']);
  });
});
