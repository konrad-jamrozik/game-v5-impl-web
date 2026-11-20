/** Tests, from the former Acceptance examples, of TIMELINE and the Turn report example of ENG. */
import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { CONTROLLER, expectOk, scriptedAi, startHarness, type Harness } from '../helpers/test-rules.ts';

const timeline = (h: Harness) => expectOk(h.core.getTimelineStatus(CONTROLLER));
const turnEnds = async (h: Harness) =>
  expectOk(await h.core.listSaves(CONTROLLER))
    .filter((save) => save.autosaveKind === 'turnEnd')
    .map((save) => save.turn);
const hasReturn = async (h: Harness) =>
  expectOk(await h.core.listSaves(CONTROLLER)).some((save) => save.autosaveKind === 'furthestProgress');

async function fresh(seed = 'timeline'): Promise<Harness> {
  const h = await startHarness();
  expectOk(await h.core.createCampaign(CONTROLLER, { seed }));
  return h;
}

describe('SAVES: Listing Campaign saves reports the Player actions of the saved Turn', () => {
  it('counts the Player actions from the Turn start, not Undone actions, Advance turn, or cheats', async () => {
    const h = await fresh();
    const current = async () =>
      expectOk(await h.core.listSaves(CONTROLLER)).find((save) => save.autosaveKind === 'current');
    expect((await current())?.actions).toBe(0);
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    h.core.enableDevMode(CONTROLLER);
    expectOk(await h.cheat('addMoney', { amount: 9 }));
    h.core.disableDevMode(CONTROLLER);
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.undoAction(CONTROLLER));
    expect((await current())?.actions).toBe(2);
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expect((await current())?.actions).toBe(0);
    const turnEnd = expectOk(await h.core.listSaves(CONTROLLER)).find(
      (save) => save.autosaveKind === 'turnEnd',
    );
    expect(turnEnd?.actions).toBe(2);
  });
});

describe('TIMELINE: examples', () => {
  it('Action undo and redo', async () => {
    const h = await fresh();
    const states = [h.state()];
    h.core.enableDevMode(CONTROLLER);
    expectOk(await h.cheat('addMoney', { amount: 9 }));
    h.core.disableDevMode(CONTROLLER);
    states.push(h.state());
    expectOk(await h.act('roll'));
    states.push(h.state());
    expectOk(await h.act('hire'));
    states.push(h.state());
    expect(expectOk(h.core.getStatus(CONTROLLER)).devMode).toBe(false);
    for (let i = 2; i >= 0; i -= 1) {
      expectOk(await h.core.undoAction(CONTROLLER));
      h.core.playerQuery(CONTROLLER, 'currentLiveWorldState');
      expect(h.state()).toEqual(states[i]);
    }
    for (let i = 1; i <= 3; i += 1) {
      expectOk(await h.core.redoAction(CONTROLLER));
      expect(h.state()).toEqual(states[i]);
    }
    expect(expectOk(h.core.getStatus(CONTROLLER)).devMode).toBe(false);
    const denied = await h.cheat('addMoney', { amount: 1 });
    expect(!denied.ok && denied.error.code).toBe('dev_mode_disabled');
  });

  it('Undo stops at the Turn-start state', async () => {
    const h = await fresh();
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const turnStart = h.state();
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(h.state()).toEqual(turnStart);
    const second = await h.core.undoAction(CONTROLLER);
    expect(!second.ok && second.error.code).toBe('no_target');
    const all = await h.core.undoAllActions(CONTROLLER);
    expect(!all.ok && all.error.code).toBe('no_target');
    expect(h.state()).toEqual(turnStart);
    expect(timeline(h)).toMatchObject({ canUndoAction: false, canRedoAction: true, undoneActions: 1 });
  });

  it('All actions at once', async () => {
    const h = await fresh();
    const turnStart = h.state();
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.act('roll'));
    }
    const end = h.state();
    expectOk(await h.core.undoAllActions(CONTROLLER));
    expect(h.state()).toEqual(turnStart);
    expect(timeline(h)).toMatchObject({ timelineEntries: 4, undoneActions: 4 });
    expectOk(await h.core.redoAllActions(CONTROLLER));
    expect(h.state()).toEqual(end);
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.core.undoAction(CONTROLLER));
    }
    expect(h.state()).toEqual(turnStart);
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.core.redoAction(CONTROLLER));
    }
    expect(h.state()).toEqual(end);
  });

  it('A new action discards the Undone actions', async () => {
    const h = await fresh();
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.act('gain', { amount: 2 }));
    const redo = await h.core.redoAction(CONTROLLER);
    expect(!redo.ok && redo.error.code).toBe('no_target');
    expect(h.view().money).toBe(102);
  });

  it('Undo needs no Campaign save', async () => {
    const h = await startHarness();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autosaveLimit', 0));
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expect(await turnEnds(h)).toEqual([]);
    const back = await h.core.undoToAutosave(CONTROLLER);
    expect(!back.ok && back.error.code).toBe('no_target');
    const turnStart = h.state();
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.act('roll'));
    }
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.core.undoAction(CONTROLLER));
    }
    expect(h.state()).toEqual(turnStart);
  });

  it('A Campaign save holds one Turn of Timeline', async () => {
    const h = await fresh();
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const turnStart = h.state();
    expectOk(await h.act('gain', { amount: 1 }));
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(h.state()).toEqual(turnStart);
    expect((await h.core.undoAction(CONTROLLER)).ok).toBe(false);
  });

  it('Keeping a line of play', async () => {
    const h = await fresh();
    for (const amount of [1, 2, 3]) {
      expectOk(await h.act('gain', { amount }));
    }
    const s1 = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.act('gain', { amount: 50 }));
    const s2 = expectOk(await h.core.save(CONTROLLER)).saveId;
    expect(s2).not.toBe(s1);
    expectOk(await h.core.load(CONTROLLER, s1));
    expect(h.view().money).toBe(106);
    expect(timeline(h).timelineEntries).toBe(3);
    expectOk(await h.core.load(CONTROLLER, s2));
    expect(h.view().money).toBe(151);
    expect(timeline(h).timelineEntries).toBe(2);
  });

  it('Autopilot actions are separate Timeline entries', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => {
        await api.act('gain', { amount: 1 });
        await api.act('gain', { amount: 1 });
        await api.act('gain', { amount: 1 });
        await api.advance();
      },
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    // The limit is three Player actions here: engage three times with singleAction.
    for (let i = 0; i < 3; i += 1) {
      const { engagementId } = expectOk(await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }));
      expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    }
    expect(timeline(h).timelineEntries).toBe(3);
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.core.undoAction(CONTROLLER));
    }
    expect(h.view().money).toBe(100);
    expect((await h.core.undoAction(CONTROLLER)).ok).toBe(false);
  });

  it('Going back and forward across Turns', async () => {
    const h = await fresh();
    const turnEndStates: unknown[] = [];
    for (let turn = 1; turn <= 3; turn += 1) {
      expectOk(await h.act('roll'));
      turnEndStates.push(h.state());
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 2 }));
    const turn4 = h.state();
    for (const turn of [3, 2, 1]) {
      const target = expectOk(await h.core.undoToAutosave(CONTROLLER));
      expect(target).toMatchObject({ autosaveKind: 'turnEnd', turn });
      expect(h.state()).toEqual(turnEndStates[turn - 1]);
    }
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'turnEnd',
      turn: 2,
    });
    expect(h.state()).toEqual(turnEndStates[1]);
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'turnEnd',
      turn: 3,
    });
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'furthestProgress',
      turn: 4,
    });
    expect(h.state()).toEqual(turn4);
    expect(timeline(h)).toMatchObject({ timelineEntries: 2, undoneActions: 0 });
    expect(await hasReturn(h)).toBe(false);
    expect((await h.core.redoToAutosave(CONTROLLER)).ok).toBe(false);
  });

  it('Undo within a loaded Turn', async () => {
    const h = await fresh();
    const turnStart = h.state();
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.act('roll'));
    }
    const turnEnd = h.state();
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.core.undoToAutosave(CONTROLLER));
    expect(h.state()).toEqual(turnEnd);
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.core.undoAction(CONTROLLER));
    }
    expect(h.state()).toEqual(turnStart);
    const status = expectOk(await h.core.getAutosaveStatus(CONTROLLER));
    expect(status.redoToAutosave).toMatchObject({ autosaveKind: 'turnEnd', turn: 1 });
    expect(status.undoToAutosave).toBeNull();
    expectOk(await h.core.redoToAutosave(CONTROLLER));
    expect(h.state()).toEqual(turnEnd);
  });

  it('Going back stops at the Autosave limit', async () => {
    const h = await fresh();
    for (let i = 0; i < 7; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    for (const turn of [7, 6, 5, 4, 3]) {
      expect(expectOk(await h.core.undoToAutosave(CONTROLLER)).turn).toBe(turn);
    }
    const sixth = await h.core.undoToAutosave(CONTROLLER);
    expect(!sixth.ok && sixth.error.code).toBe('no_target');
  });

  it('One call crosses an Autopilot engagement', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => {
        await api.act('roll');
        await api.advance();
      },
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    const { engagementId } = expectOk(
      await h.core.engage(CONTROLLER, 'x', { kind: 'turnAdvancements', count: 30 }),
    );
    expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    const turn35 = h.state();
    expect(h.view().turn).toBe(35);
    // Crossing an Autopilot engagement: `getAutosaveStatus()` reports it before the call is made.
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER))).toMatchObject({
      undoToAutosave: { autosaveKind: 'engagement', turn: 5, crossesAutopilotEngagement: true },
      redoToAutosave: null,
    });
    expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'engagement',
      turn: 5,
      crossesAutopilotEngagement: true,
    });
    // At the World state the Engagement Autosave holds, going forward crosses the engagement and going back does not.
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER))).toMatchObject({
      undoToAutosave: { autosaveKind: 'turnEnd', turn: 4, crossesAutopilotEngagement: false },
      redoToAutosave: { crossesAutopilotEngagement: true },
    });
    for (const turn of [4, 3, 2, 1]) {
      expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
        autosaveKind: 'turnEnd',
        turn,
        crossesAutopilotEngagement: false,
      });
    }
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER)).redoToAutosave).toMatchObject({
      crossesAutopilotEngagement: false,
    });
    for (let i = 0; i < 5; i += 1) {
      expectOk(await h.core.redoToAutosave(CONTROLLER));
    }
    expect(h.state()).toEqual(turn35);
  });

  it('The Disengagement Autosave is a target of Autosave navigation', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => void (await api.act('gain', { amount: 1 })),
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    const { engagementId } = expectOk(await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }));
    expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    const disengaged = h.state();
    // At the World state it holds, the Disengagement Autosave is not a target.
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER)).redoToAutosave).toBeNull();
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER)).redoToAutosave).toMatchObject({
      autosaveKind: 'disengagement',
      turn: 1,
    });
    expectOk(await h.core.redoToAutosave(CONTROLLER));
    expect(h.state()).toEqual(disengaged);
  });

  it('A new action removes later Autosaves', async () => {
    const h = await fresh();
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    expectOk(await h.core.undoToAutosave(CONTROLLER));
    expectOk(await h.core.undoToAutosave(CONTROLLER));
    expect(h.view().turn).toBe(2);
    expect(await hasReturn(h)).toBe(true);
    expectOk(await h.act('gain', { amount: 1 }));
    expect(await turnEnds(h)).toEqual([1, 2]);
    expect(await hasReturn(h)).toBe(false);
    const redo = await h.core.redoToAutosave(CONTROLLER);
    expect(!redo.ok && redo.error.code).toBe('no_target');
  });

  it('undoToAutosave N times then redoToAutosave M times lands where N minus M calls land', async () => {
    const h = await fresh();
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.act('roll'));
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    expectOk(await h.act('roll'));
    expectOk(await h.core.undoAction(CONTROLLER));
    const start = h.state();
    const startTimeline = timeline(h);
    const after: unknown[] = [start];
    for (let n = 1; n <= 4; n += 1) {
      expectOk(await h.core.undoToAutosave(CONTROLLER));
      after.push(h.state());
    }
    for (let m = 1; m <= 4; m += 1) {
      expectOk(await h.core.redoToAutosave(CONTROLLER));
      expect(h.state()).toEqual(after[4 - m]);
    }
    expect(timeline(h)).toEqual(startTimeline);
  });

  it('A Furthest progress Autosave that cannot be written fails undoToAutosave and changes nothing', async () => {
    const h = await fresh();
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const before = h.state();
    h.storage.failWrite = (header) => header.kind === 'furthestProgressAutosave';
    const result = await h.core.undoToAutosave(CONTROLLER);
    expect(!result.ok && result.error.code).toBe('unwritable_campaign_save');
    expect(h.state()).toEqual(before);
  });

  it('A missing Autosave is not a target', async () => {
    const h = await fresh();
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    h.storage.failWrite = (header) => header.kind === 'turnEndAutosave' && header.turn === 3;
    const advance = await h.core.advanceTurn(CONTROLLER);
    expect(advance.ok && advance.autosaveFailures.map((f) => f.autosave)).toEqual(['turnEnd']);
    h.storage.failWrite = null;
    expect(expectOk(await h.core.undoToAutosave(CONTROLLER)).turn).toBe(2);
  });

  it('Autosaves of a different line of play are not targets after a Campaign save is loaded', async () => {
    const h = await fresh();
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    const status = expectOk(await h.core.getAutosaveStatus(CONTROLLER));
    // The Turn-end Autosaves are later on the same line, reached through the action after the save.
    expect(status.undoToAutosave).toBeNull();
    expect(status.redoToAutosave).toMatchObject({ turn: 1 });
    expectOk(await h.act('gain', { amount: 77 }));
    expect(await turnEnds(h)).toEqual([]);
    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER)).redoToAutosave).toBeNull();
  });
});

describe('TIMELINE: Restored World states, as a property', () => {
  it('any sequence of actions, undos, and redos restores equal Campaign state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('roll', 'hire', 'gain', 'undo', 'redo', 'advance', 'bad'), {
          maxLength: 25,
        }),
        async (steps) => {
          const h = await fresh('property');
          // model: the World states of the current Turn and the position among them
          let states = [h.state()];
          let position = 0;
          for (const step of steps) {
            if (step === 'undo') {
              const result = await h.core.undoAction(CONTROLLER);
              expect(result.ok).toBe(position > 0);
              position = Math.max(0, position - 1);
            } else if (step === 'redo') {
              const result = await h.core.redoAction(CONTROLLER);
              expect(result.ok).toBe(position < states.length - 1);
              position = Math.min(states.length - 1, position + 1);
            } else if (step === 'advance') {
              expectOk(await h.core.advanceTurn(CONTROLLER));
              states = [h.state()];
              position = 0;
            } else if (step === 'bad') {
              expect((await h.act('spend', { amount: 10 ** 9 })).ok).toBe(false);
            } else {
              expectOk(await h.act(step, { amount: 3 }));
              states = [...states.slice(0, position + 1), h.state()];
              position += 1;
            }
            expect(h.state()).toEqual(states[position]);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('ENG: examples', () => {
  it('Turn report and history', async () => {
    const h = await fresh();
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'turnReport'))).toBeNull();
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'history'))).toEqual([]);
    for (let i = 0; i < 7; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    const report = expectOk(h.core.playerQuery(CONTROLLER, 'turnReport'));
    const history = expectOk(h.core.playerQuery(CONTROLLER, 'history'));
    expect(report).toMatchObject({ turn: 7 });
    expect(history).toHaveLength(7);
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'turnReport'))).toEqual(report);
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'history'))).toEqual(history);
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const next = expectOk(h.core.playerQuery(CONTROLLER, 'turnReport'));
    expect(next).toMatchObject({ turn: 8 });
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'history'))).toHaveLength(8);
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'turnReport'))).toEqual(next);
    expect(expectOk(h.core.playerQuery(CONTROLLER, 'history'))).toHaveLength(8);
  });

  it('Returned views are detached', async () => {
    const h = await fresh();
    const view = h.view();
    view.agents.push('intruder');
    view.money = -5;
    expect(h.view()).toMatchObject({ money: 100, agents: [] });
    const inspected = h.state();
    inspected.world.current.money = 1;
    expect(h.state().world.current.money).toBe(100);
  });

  it('A rejected request changes nothing', async () => {
    const h = await fresh();
    expectOk(await h.act('gain', { amount: 1 }));
    const before = { state: h.state(), timeline: timeline(h), writes: h.storage.writeCount };
    expect((await h.act('spend', { amount: 10 ** 9 })).ok).toBe(false);
    expect((await h.act('no-such-action')).ok).toBe(false);
    expect((await h.cheat('addMoney', { amount: 5 })).ok).toBe(false);
    expect((await h.core.redoAction(CONTROLLER)).ok).toBe(false);
    expect({ state: h.state(), timeline: timeline(h), writes: h.storage.writeCount }).toEqual(before);
  });
});
