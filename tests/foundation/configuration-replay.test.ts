/**
 * CONFIG, Changing Campaign configuration during play, with SAVES, Loading, and TIMELINE, Restored World states: a
 * load makes the saved Campaign state current whole, so every World state of its Timeline is the one first produced,
 * under the Campaign configuration in force when its Player action was committed, not under the one in force at the
 * save. The Game has no Campaign configuration value adjustable during play yet (CONFIG, TODOs), so a Fixture game,
 * the test rules with a `gain` that the adjustable multiplier scales, makes the configuration an action ran under
 * visible in its outcome.
 */
import { describe, expect, it } from 'vite-plus/test';
import type { GameRules } from '../../src/engine/rules.ts';
import { MemoryStorage } from '../../src/engine/saves/storage.ts';
import { EngineCore } from '../../src/engine/session/core.ts';
import { CONTROLLER, expectOk, testRules, type TestState } from '../helpers/test-rules.ts';

/** The test rules, except that `gain` adds its amount times the multiplier of the World state it is applied to. */
const scaledRules: GameRules<TestState> = {
  ...testRules,
  applyAction(state, record) {
    const amount = (record.args as { amount?: unknown } | undefined)?.amount;
    if (record.surface === 'player' && record.name === 'gain' && typeof amount === 'number') {
      return testRules.applyAction(state, {
        ...record,
        args: { amount: amount * state.configuration.multiplier },
      });
    }
    return testRules.applyAction(state, record);
  },
};

async function startScaled(): Promise<EngineCore<TestState>> {
  let next = 0;
  return EngineCore.start(
    {
      storage: new MemoryStorage(),
      newId: () => {
        next += 1;
        return `replay-${next}`;
      },
      randomNumbers: (count) => Array.from({ length: count }, (_, i) => i + 1),
    },
    scaledRules,
    [],
  );
}

const money = (core: EngineCore<TestState>) =>
  (expectOk(core.playerQuery(CONTROLLER, 'currentLiveWorldState')) as { money: number }).money;
const multiplier = (core: EngineCore<TestState>) =>
  (expectOk(core.playerQuery(CONTROLLER, 'campaignConfiguration')) as TestState['configuration']).multiplier;
const gain = (core: EngineCore<TestState>, amount: number) =>
  core.commitAction(CONTROLLER, { surface: 'player', name: 'gain', args: { amount } });
const setMultiplier = (core: EngineCore<TestState>, value: number) =>
  core.setCampaignConfiguration(CONTROLLER, { multiplier: value });

describe('CONFIG: a load replays each Timeline entry under the Campaign configuration it was committed under', () => {
  it('restores every World state of the Turn as first produced, after the configuration changed twice mid-Turn', async () => {
    const core = await startScaled();
    expectOk(await core.createCampaign(CONTROLLER));
    const start = money(core);
    const first = multiplier(core);
    // Fixture multipliers: each differs from the one before it, so every change shows in a later gain.
    const [second, third] = [first + 1, first + 2];

    expectOk(await gain(core, 10));
    const afterFirst = start + 10 * first;
    expectOk(await setMultiplier(core, second));
    expectOk(await gain(core, 10));
    const afterSecond = afterFirst + 10 * second;
    // A gain committed from a World state that was itself produced under `second`.
    expectOk(await gain(core, 5));
    const afterThird = afterSecond + 5 * second;
    expect(money(core)).toBe(afterThird);

    // The third gain becomes an Undone action, and the configuration changes again before the save.
    expectOk(await core.undoAction(CONTROLLER));
    expectOk(await setMultiplier(core, third));
    const { saveId } = expectOk(await core.save(CONTROLLER));
    // Play on, so that the load has to rebuild the saved Timeline rather than keep the one in memory.
    expectOk(await core.advanceTurn(CONTROLLER));

    expectOk(await core.load(CONTROLLER, saveId));
    expect(money(core)).toBe(afterSecond);
    expect(multiplier(core)).toBe(third);
    // Redo reaches the Undone action as first produced, under `second`, not under `third` now in force.
    expectOk(await core.redoAction(CONTROLLER));
    expect(money(core)).toBe(afterThird);
    expectOk(await core.undoAllActions(CONTROLLER));
    expect(money(core)).toBe(start);
    expectOk(await core.redoAction(CONTROLLER));
    expect(money(core)).toBe(afterFirst);
  });
});
