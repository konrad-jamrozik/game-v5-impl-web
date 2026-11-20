/** Tests of the Autopilot Autosave of SAVES, Autosaves, and of Autosave navigation over it under TIMELINE. */
import { describe, expect, it } from 'vite-plus/test';
import { CONTROLLER, expectOk, scriptedAi, startHarness, type Harness } from '../helpers/test-rules.ts';

const listed = async (h: Harness, kind: string) =>
  expectOk(await h.core.listSaves(CONTROLLER))
    .filter((save) => save.autosaveKind === kind)
    .map((save) => save.turn)
    .sort((a, b) => a - b);

/** A Harness whose Autopilot AI commits one action and then ends the Turn, at every step. */
async function withAi(): Promise<Harness> {
  let harness: Harness | null = null;
  const ai = scriptedAi('x', () => harness!.core, [
    async (api) => {
      await api.act('roll');
      await api.advance();
    },
  ]);
  const h = await startHarness({ ais: [ai] });
  harness = h;
  return h;
}

async function play(h: Harness, turns: number): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    expectOk(await h.core.advanceTurn(CONTROLLER));
  }
}

async function autopilot(h: Harness, turns: number) {
  const { engagementId } = expectOk(
    await h.core.engage(CONTROLLER, 'x', { kind: 'turnAdvancements', count: turns }),
  );
  return expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
}

describe('SAVES: Autopilot Autosaves', () => {
  it('each Turn an Autopilot AI ends gets an Autopilot Autosave, kept up to the Autopilot Autosave limit', async () => {
    const h = await withAi();
    expectOk(await h.core.createCampaign(CONTROLLER));
    await play(h, 3);
    await autopilot(h, 8);
    expect(h.view().turn).toBe(12);
    // The Turns the Autopilot AI played never displace those the player played.
    expect(await listed(h, 'turnEnd')).toEqual([1, 2, 3]);
    expect(await listed(h, 'autopilot')).toEqual([7, 8, 9, 10, 11]);
    // Turn ends outside an Autopilot engagement write Turn-end Autosaves and leave the Autopilot Autosaves alone.
    await play(h, 2);
    expect(await listed(h, 'turnEnd')).toEqual([1, 2, 3, 12, 13]);
    expect(await listed(h, 'autopilot')).toEqual([7, 8, 9, 10, 11]);
  });

  it('the Autopilot Autosave limit counts only Autopilot Autosaves', async () => {
    const h = await withAi();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autopilotAutosaveLimit', 2));
    expectOk(await h.core.createCampaign(CONTROLLER));
    await play(h, 6);
    await autopilot(h, 4);
    expect(await listed(h, 'turnEnd')).toEqual([2, 3, 4, 5, 6]);
    expect(await listed(h, 'autopilot')).toEqual([9, 10]);
  });

  it('with an Autopilot Autosave limit of 0, no Autopilot Autosave is written', async () => {
    const h = await withAi();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autopilotAutosaveLimit', 0));
    expectOk(await h.core.createCampaign(CONTROLLER));
    await play(h, 1);
    await autopilot(h, 3);
    expect(await listed(h, 'autopilot')).toEqual([]);
    expect(await listed(h, 'turnEnd')).toEqual([1]);
    expect(await listed(h, 'engagement')).toEqual([2]);
  });

  it('an Autopilot Autosave of a Turn that has a Turn-end Autosave replaces it', async () => {
    const h = await withAi();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('roll'));
    await play(h, 1);
    // Back at the Turn-end state of Turn 1, whose Turn-end Autosave stays because it holds that World state.
    expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'turnEnd',
      turn: 1,
    });
    expect(await listed(h, 'turnEnd')).toEqual([1]);
    await autopilot(h, 1);
    expect(h.view().turn).toBe(2);
    expect(await listed(h, 'turnEnd')).toEqual([]);
    expect(await listed(h, 'autopilot')).toEqual([1]);
  });

  it('an Autopilot Autosave that cannot be written is reported and the Turn still ends', async () => {
    let harness: Harness | null = null;
    const reported: string[][] = [];
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => {
        const result = (await api.advance()) as Awaited<ReturnType<Harness['core']['advanceTurn']>>;
        reported.push(result.ok ? result.autosaveFailures.map((failure) => failure.autosave) : ['rejected']);
      },
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    h.storage.failWrite = (header) => header.kind === 'autopilotAutosave' && header.turn === 2;
    await autopilot(h, 3);
    expect(h.view().turn).toBe(4);
    // The result of the last Advance turn may reach the Autopilot AI after disengagement completes.
    expect(reported.slice(0, 2)).toEqual([[], ['autopilot']]);
    expect(await listed(h, 'autopilot')).toEqual([1, 3]);
  });
});

describe('TIMELINE: Autosave navigation over Autopilot Autosaves', () => {
  it('steps through the Autopilot Autosaves of Turns 104 down to 100, then crosses to the Engagement Autosave', async () => {
    const h = await withAi();
    expectOk(await h.core.createCampaign(CONTROLLER));
    await play(h, 14);
    expect(h.view().turn).toBe(15);
    await autopilot(h, 90);
    expect(h.view().turn).toBe(105);
    const disengaged = h.state();
    expect(await listed(h, 'autopilot')).toEqual([100, 101, 102, 103, 104]);

    expect(expectOk(await h.core.getAutosaveStatus(CONTROLLER)).undoToAutosave).toMatchObject({
      autosaveKind: 'autopilot',
      turn: 104,
      crossesAutopilotEngagement: false,
    });
    for (const turn of [104, 103, 102, 101, 100]) {
      expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
        autosaveKind: 'autopilot',
        turn,
        crossesAutopilotEngagement: false,
      });
    }
    // The next call crosses the Player actions between the start of the engagement and its earliest Autopilot
    // Autosave.
    expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'engagement',
      turn: 15,
      crossesAutopilotEngagement: true,
    });
    expect(expectOk(await h.core.undoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'turnEnd',
      turn: 14,
      crossesAutopilotEngagement: false,
    });

    // Going forward lands on the same targets in reverse.
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'engagement',
      turn: 15,
      crossesAutopilotEngagement: false,
    });
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'autopilot',
      turn: 100,
      crossesAutopilotEngagement: true,
    });
    for (const turn of [101, 102, 103, 104]) {
      expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
        autosaveKind: 'autopilot',
        turn,
        crossesAutopilotEngagement: false,
      });
    }
    expect(expectOk(await h.core.redoToAutosave(CONTROLLER))).toMatchObject({
      autosaveKind: 'furthestProgress',
      turn: 105,
      crossesAutopilotEngagement: false,
    });
    expect(h.state()).toEqual(disengaged);
  });
});
