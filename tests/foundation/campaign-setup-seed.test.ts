/**
 * CONFIG, Campaign setup seed: every Campaign has one, `session.getStatus()` reports it, and creating a Campaign from it
 * gives the same Campaign whatever the Session's new-Campaign setup is, which then plays out the same under the same
 * Autopilot AI. One of another Game build still creates a Campaign and says so; one the Game build does not accept
 * fails creation. CTEST, Limits: the Campaign test plays 2 Campaigns of 3 Turns.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  decodeCampaignSetupSeed,
  encodeCampaignSetupSeed,
} from '../../src/engine/session/campaign-setup-seed.ts';
import { errorCode, ok, startEngine } from '../helpers/engine.ts';

type Engine = Awaited<ReturnType<typeof startEngine>>['engine'];

async function playTurns(engine: Engine, turns: number) {
  const engaged = ok(
    await engine.session.autopilot.engage('basic', { kind: 'turnAdvancements', count: turns }),
  );
  await engine.session.autopilot.whenDisengaged(engaged.engagementId);
  return ok(engine.player.queries.getCurrentLiveWorldState());
}

/** A Campaign of the default preset with one Preset edit, and its Campaign setup seed. */
async function editedCampaign() {
  const { engine } = await startEngine();
  const setup = ok(engine.session.newCampaignSetup.getSetup());
  const money = (setup.values['startingMoney'] ?? 0) + 345;
  ok(engine.session.newCampaignSetup.setPresetEdit(setup.preset, { key: 'startingMoney', value: money }));
  ok(await engine.session.campaign.create({ seed: 'setup seed test' }));
  const seed = ok(engine.session.getStatus()).campaignSetupSeed;
  if (seed === null) {
    throw new Error('A new Campaign has no Campaign setup seed.');
  }
  return { engine, seed, money, preset: setup.preset };
}

describe('CONFIG: Campaign setup seed', () => {
  it('holds the Campaign seed, the preset, the Preset edits, and the Game build, and is no Campaign seed', async () => {
    const { seed, money, preset } = await editedCampaign();
    expect(seed.length).toBeGreaterThan(64);
    expect(decodeCampaignSetupSeed(seed)).toEqual(
      expect.objectContaining({ seed: 'setup seed test', preset, edits: { startingMoney: money } }),
    );
  });

  it('creates the same Campaign, which plays out the same under the same Autopilot AI', async () => {
    const first = await editedCampaign();
    const original = await playTurns(first.engine, 3);
    // The Session's own new-Campaign setup is ignored: another edit is set, and the seed is given in the Seed field.
    const { engine } = await startEngine();
    const setup = ok(engine.session.newCampaignSetup.getSetup());
    ok(engine.session.newCampaignSetup.setPresetEdit(setup.preset, { key: 'startingMoney', value: 1 }));
    expect(ok(await engine.session.campaign.create({ seed: first.seed }))).toEqual({
      gameBuildDiffers: false,
      gameBuild: expect.any(String),
    });
    expect(ok(engine.session.getStatus()).campaignSetupSeed).toBe(first.seed);
    expect(ok(engine.player.queries.getCampaignConfiguration()).startingMoney).toBe(first.money);
    expect(await playTurns(engine, 3)).toEqual(original);
  });

  it('creates a Campaign from one of another Game build and reports it, and rejects one it cannot use', async () => {
    const { seed } = await editedCampaign();
    const decoded = decodeCampaignSetupSeed(seed);
    if (decoded === null) {
      throw new Error('The Campaign setup seed does not decode.');
    }
    const { engine } = await startEngine();
    const other = encodeCampaignSetupSeed({ ...decoded, gameBuild: 'another build' });
    expect(ok(await engine.session.campaign.create({ setupSeed: other }))?.gameBuildDiffers).toBe(true);
    const unknownPreset = encodeCampaignSetupSeed({ ...decoded, preset: 'no_such_preset' });
    expect(errorCode(await engine.session.campaign.create({ setupSeed: unknownPreset }))).toBe(
      'invalid_input',
    );
    const badEdit = encodeCampaignSetupSeed({ ...decoded, edits: { startingMoney: -5 } });
    expect(errorCode(await engine.session.campaign.create({ setupSeed: badEdit }))).toBe('invalid_input');
    expect(errorCode(await engine.session.campaign.create({ setupSeed: 'not a setup seed' }))).toBe(
      'invalid_input',
    );
  });
});
