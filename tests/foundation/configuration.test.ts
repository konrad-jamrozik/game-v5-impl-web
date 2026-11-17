/** Acceptance examples of CONFIG. The test rules supply the presets Standard and Hard the examples name. */
import { describe, expect, it } from 'vitest';
import { CONTROLLER, expectOk, startHarness, type Harness } from '../helpers/test-rules.ts';

const presets = (h: Harness) => expectOk(h.core.listPresets(CONTROLLER));
const preset = (h: Harness, id: string) =>
  Object.fromEntries(
    expectOk(h.core.getPreset(CONTROLLER, id)).map((value) => [
      value.key,
      value.presetEdit ?? value.presetValue,
    ]),
  );
const edit = (h: Harness, value: unknown) =>
  h.core.setPresetEdit(CONTROLLER, 'hard', { key: 'startingMoney', value });
const setting = (h: Harness, name: string) =>
  expectOk(h.core.getGlobalConfiguration(CONTROLLER)).settings.find((item) => item.setting === name)!;

describe('CONFIG: Acceptance examples', () => {
  it('Values copied at creation', async () => {
    const h = await startHarness();
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(await h.core.createCampaign(CONTROLLER));
    expect(h.state().configuration).toEqual({ startingMoney: 60, multiplier: 2 });
    const a = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(edit(h, 80));
    expectOk(await h.core.createCampaign(CONTROLLER));
    expect(h.state().configuration).toEqual({ startingMoney: 80, multiplier: 2 });
    expect(h.view().money).toBe(80);
    expectOk(await h.core.load(CONTROLLER, a));
    expect(h.state().configuration).toEqual({ startingMoney: 60, multiplier: 2 });
  });

  it('Edits survive switching presets', async () => {
    const h = await startHarness();
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(edit(h, 80));
    expectOk(h.core.selectPreset(CONTROLLER, 'standard'));
    expect(expectOk(h.core.getSetup(CONTROLLER))).toEqual({
      preset: 'standard',
      values: { startingMoney: 100, multiplier: 1 },
    });
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expect(expectOk(h.core.getSetup(CONTROLLER))).toEqual({
      preset: 'hard',
      values: { startingMoney: 80, multiplier: 2 },
    });
  });

  it('Creation discards edits', async () => {
    const h = await startHarness();
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(edit(h, 80));
    expectOk(await h.core.createCampaign(CONTROLLER));
    expect(presets(h).find((item) => item.isSelected)!.preset).toBe('standard');
    expect(preset(h, 'hard')).toEqual({ startingMoney: 60, multiplier: 2 });
  });

  it('New Session starts from the default', async () => {
    const h = await startHarness();
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(edit(h, 80));
    await h.restart();
    expect(presets(h).find((item) => item.isSelected)!.preset).toBe('standard');
    expect(preset(h, 'hard')).toEqual({ startingMoney: 60, multiplier: 2 });
  });

  it('Invalid edit', async () => {
    const h = await startHarness();
    expectOk(edit(h, 80));
    for (const value of [-1, 1.5, 'much', 5000]) {
      const result = edit(h, value);
      expect(!result.ok && result.error.code).toBe('invalid_input');
    }
    expect(preset(h, 'hard')['startingMoney']).toBe(80);
    expectOk(h.core.removePresetEdit(CONTROLLER, 'hard', 'startingMoney'));
    expect(preset(h, 'hard')['startingMoney']).toBe(60);
    expect(h.core.selectPreset(CONTROLLER, 'nope').ok).toBe(false);
  });

  it('Changing a setting without a Campaign', async () => {
    const h = await startHarness();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'musicVolume', 30));
    expect(setting(h, 'musicVolume')).toMatchObject({
      effectiveValue: 30,
      stored: true,
      gameBuildDefault: 50,
    });
    await h.restart();
    expect(setting(h, 'musicVolume')).toMatchObject({ effectiveValue: 30, stored: true });
    expectOk(await h.core.resetGlobalSetting(CONTROLLER, 'musicVolume'));
    expect(setting(h, 'musicVolume')).toMatchObject({ effectiveValue: 50, stored: false });
    const invalid = await h.core.setGlobalSetting(CONTROLLER, 'autosaveLimit', -1);
    expect(!invalid.ok && invalid.error.code).toBe('invalid_input');
    expect(setting(h, 'autosaveLimit').effectiveValue).toBe(5);
  });

  it('Unset setting follows the Game build', async () => {
    const h = await startHarness();
    expect(setting(h, 'autosaveLimit')).toMatchObject({ effectiveValue: 5, stored: false });
    expect(await h.storage.readGlobalConfiguration()).toBeNull();
  });

  it('Listing presets and their values', async () => {
    const h = await startHarness();
    expect(presets(h)).toEqual([
      {
        preset: 'standard',
        name: 'Standard',
        isGameBuildDefault: true,
        isSelected: true,
        hasPresetEdits: false,
      },
      { preset: 'hard', name: 'Hard', isGameBuildDefault: false, isSelected: false, hasPresetEdits: false },
    ]);
    expectOk(edit(h, 80));
    const money = expectOk(h.core.getPreset(CONTROLLER, 'hard')).find((v) => v.key === 'startingMoney')!;
    expect(money).toMatchObject({ presetValue: 60, presetEdit: 80, adjustableDuringPlay: false });
    expect(presets(h).find((item) => item.preset === 'hard')!.hasPresetEdits).toBe(true);
  });

  it('Invalid stored value', async () => {
    const h = await startHarness();
    await h.storage.writeGlobalConfiguration(JSON.stringify({ musicVolume: 200, autosaveLimit: 3 }));
    await h.restart();
    const report = expectOk(h.core.getGlobalConfiguration(CONTROLLER));
    expect(setting(h, 'musicVolume')).toMatchObject({ effectiveValue: 50, stored: false });
    expect(setting(h, 'autosaveLimit').effectiveValue).toBe(3);
    expect(report.problems).toHaveLength(1);
    await h.storage.writeGlobalConfiguration('not json');
    await h.restart();
    expect(expectOk(h.core.getGlobalConfiguration(CONTROLLER)).problems).toHaveLength(1);
  });

  it('Global configuration is not a Player action and is unchanged by undo and load', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'musicVolume', 30));
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(1);
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(setting(h, 'musicVolume').effectiveValue).toBe(30);
  });
});
