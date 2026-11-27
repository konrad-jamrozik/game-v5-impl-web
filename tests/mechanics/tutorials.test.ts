/**
 * TSUM, Tutorials: a Campaign configuration value, true in every preset of the Game build, adjustable during play,
 * and read by no rule yet.
 */
import { describe, expect, it } from 'vite-plus/test';
import { createGameRules } from '../../src/engine/game-rules.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';

describe('TSUM: Tutorials', () => {
  it('is on in every preset of the Game build and adjustable during play', () => {
    const rules = createGameRules(bootstrapGdrCatalog());
    expect(rules.presets.map((preset) => preset.values['tutorials'])).toEqual(rules.presets.map(() => 1));
    const tutorials = rules.configurationValues.find((value) => value.key === 'tutorials')!;
    expect(tutorials.adjustable).toBe(true);
    expect([0, 1, 2, -1, 0.5].map((value) => tutorials.isPermitted(value))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('starts on, and the Player turns it off and on during play without a Player action', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'tutorials' }));
    expect(ok(engine.player.queries.getCampaignConfiguration()).tutorials).toBe(1);
    const turn = ok(engine.player.queries.getCurrentLiveWorldState()).turn;
    ok(await engine.session.campaignConfiguration.set({ tutorials: 0 }));
    expect(ok(engine.player.queries.getCampaignConfiguration()).tutorials).toBe(0);
    expect(ok(engine.session.timeline.getStatus()).canUndoAction).toBe(false);
    expect(ok(engine.player.queries.getCurrentLiveWorldState()).turn).toBe(turn);
    ok(await engine.session.campaignConfiguration.set({ tutorials: 1 }));
    expect(ok(engine.player.queries.getCampaignConfiguration()).tutorials).toBe(1);
  });
});
