/** Tests, from the former Acceptance examples, of CONFIG. The test rules supply the presets Standard and Hard the examples name. */
import { describe, expect, it } from 'vite-plus/test';
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

describe('CONFIG: examples', () => {
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
    expect(setting(h, 'autopilotAutosaveLimit')).toMatchObject({
      name: 'Autopilot Autosave limit',
      effectiveValue: 5,
      gameBuildDefault: 5,
      stored: false,
    });
    const invalid = await h.core.setGlobalSetting(CONTROLLER, 'autopilotAutosaveLimit', 1.5);
    expect(!invalid.ok && invalid.error.code).toBe('invalid_input');
    expect(await h.storage.readGlobalConfiguration()).toBeNull();
  });

  it('Autopilot settings: Autopilot controls shown and Autopilot Turns persist across Sessions once set', async () => {
    const h = await startHarness();
    expect(setting(h, 'autopilotControlsShown')).toMatchObject({
      name: 'Autopilot controls shown',
      effectiveValue: false,
      gameBuildDefault: false,
      stored: false,
    });
    expect(setting(h, 'autopilotTurns')).toMatchObject({
      name: 'Autopilot Turns',
      effectiveValue: 10,
      gameBuildDefault: 10,
      stored: false,
    });
    for (const value of [0, -1, 1.5, '100']) {
      const invalid = await h.core.setGlobalSetting(CONTROLLER, 'autopilotTurns', value);
      expect(!invalid.ok && invalid.error.code).toBe('invalid_input');
    }
    const notBoolean = await h.core.setGlobalSetting(CONTROLLER, 'autopilotControlsShown', 1);
    expect(!notBoolean.ok && notBoolean.error.code).toBe('invalid_input');
    expect(await h.storage.readGlobalConfiguration()).toBeNull();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autopilotControlsShown', true));
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autopilotTurns', 100));
    await h.restart();
    expect(setting(h, 'autopilotControlsShown')).toMatchObject({ effectiveValue: true, stored: true });
    expect(setting(h, 'autopilotTurns')).toMatchObject({ effectiveValue: 100, stored: true });
    expectOk(await h.core.resetGlobalSetting(CONTROLLER, 'autopilotTurns'));
    expect(setting(h, 'autopilotTurns')).toMatchObject({ effectiveValue: 10, stored: false });
  });

  it('two Sessions over one Game storage keep each other’s settings, e.g. two browser tabs', async () => {
    const a = await startHarness();
    const b = await startHarness({ storage: a.storage });
    expectOk(await a.core.setGlobalSetting(CONTROLLER, 'revealHiddenContentOn', true));
    // The second Session, started before the change, changes another setting and keeps the first Session's one.
    expectOk(await b.core.setGlobalSetting(CONTROLLER, 'autopilotTurns', 50));
    expect(setting(b, 'revealHiddenContentOn')).toMatchObject({ effectiveValue: true, stored: true });
    expectOk(await b.core.resetGlobalSetting(CONTROLLER, 'autopilotTurns'));
    await a.restart();
    expect(setting(a, 'revealHiddenContentOn')).toMatchObject({ effectiveValue: true, stored: true });
    expect(setting(a, 'autopilotTurns')).toMatchObject({ stored: false });
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

describe('CONFIG: Changing Campaign configuration during play', () => {
  // The test rules make the multiplier adjustable during play and starting money fixed after creation.
  const set = (h: Harness, values: unknown) => h.core.setCampaignConfiguration(CONTROLLER, values);
  const code = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? 'ok' : result.error?.code);

  it('Invalid adjustment and Fixed value: the whole request fails and nothing changes', async () => {
    const h = await startHarness();
    expect(code(await set(h, { multiplier: 2 }))).toBe('no_current_campaign');
    expectOk(await h.core.createCampaign(CONTROLLER));
    const before = h.state();
    for (const values of [
      { multiplier: 9 },
      { multiplier: 3, startingMoney: 100 },
      { multiplier: 3, unknown: 1 },
      [1],
      null,
    ]) {
      expect(code(await set(h, values))).toBe('invalid_input');
    }
    expect(h.state()).toEqual(before);
  });

  it('a change is not a Player action, stays through undo and redo, and is saved at once', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    const first = h.state();
    expectOk(await set(h, { multiplier: 3 }));
    // A request that leaves Campaign configuration unchanged is accepted and changes nothing.
    expectOk(await set(h, { multiplier: 3 }));
    expectOk(await set(h, {}));
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER))).toMatchObject({
      timelineEntries: 1,
      undoneActions: 0,
    });
    expect(h.state().configuration.multiplier).toBe(3);
    // Undo and redo move only the Timeline pointer: the change stays, and redo reaches the World state as it was.
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(h.state().configuration.multiplier).toBe(3);
    expectOk(await h.core.redoAction(CONTROLLER));
    expect(h.state()).toEqual({ ...first, configuration: { ...first.configuration, multiplier: 3 } });
    // The Current Autosave holds the change, so resuming from it keeps it.
    const current = expectOk(await h.core.listSaves(CONTROLLER)).find(
      (save) => save.autosaveKind === 'current',
    );
    await h.restart();
    expectOk(await h.core.load(CONTROLLER, current!.saveId));
    expect(h.state().configuration.multiplier).toBe(3);
    expectOk(await h.act('gain', { amount: 1 }));
    // Replay after a load commits each Timeline entry under the Campaign configuration it was committed under.
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    const played = h.state();
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(h.state()).toEqual(played);
  });

  it('a load takes the saved Campaign configuration, while Autosave navigation keeps the current one', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await set(h, { multiplier: 4 }));
    expectOk(await h.core.undoToAutosave(CONTROLLER));
    expect(h.state().configuration.multiplier).toBe(4);
    expectOk(await h.core.redoToAutosave(CONTROLLER));
    expect(h.state().configuration.multiplier).toBe(4);
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(h.state().configuration.multiplier).toBe(1);
  });
});
