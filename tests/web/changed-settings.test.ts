/** GUI, Changed settings: which settings the Settings panel lists as changed, and how each line reads. */
import { describe, expect, it } from 'vite-plus/test';
import { SETTINGS, type SettingValue } from '../../src/engine/session/global-configuration.ts';
import { changedSettingLine, changedSettings } from '../../src/web/changed-settings.ts';

/** The report of one setting, as `session.globalConfiguration.get()` gives it, holding a stored value. */
function stored(setting: string, value: SettingValue) {
  const descriptor = SETTINGS.find((item) => item.setting === setting)!;
  return {
    setting,
    name: descriptor.name,
    effectiveValue: value,
    gameBuildDefault: descriptor.gameBuildDefault,
    stored: true,
    permitted: descriptor.permitted,
  };
}

describe('GUI: Changed settings', () => {
  it('reads each setting in plain words, with volumes as percentages', () => {
    expect(changedSettingLine(stored('autopilotTurns', 100))).toBe('Autopilot Turns: 100 (default 10)');
    expect(changedSettingLine(stored('autopilotControlsShown', true))).toBe(
      'Autopilot controls: shown (default hidden)',
    );
    expect(changedSettingLine(stored('musicOn', false))).toBe('Music: off (default on)');
    expect(changedSettingLine(stored('soundsOn', false))).toBe('Sounds: off (default on)');
    expect(changedSettingLine(stored('musicVolume', 30))).toBe('Music volume: 30% (default 50%)');
    expect(changedSettingLine(stored('soundsVolume', 20))).toBe('Sounds volume: 20% (default 100%)');
    expect(changedSettingLine(stored('autosaveLimit', 3))).toBe('Autosave limit: 3 (default 5)');
    expect(changedSettingLine(stored('autopilotAutosaveLimit', 0))).toBe(
      'Autopilot Autosave limit: 0 (default 5)',
    );
    expect(changedSettingLine(stored('screenLimit', true))).toBe('Screen limit: on (default off)');
  });

  it('lists only stored values, in the order of the Global configuration table', () => {
    const unset = { ...stored('autosaveLimit', 5), stored: false };
    const listed = changedSettings([unset, stored('musicOn', false), stored('autopilotTurns', 100)]);
    expect(listed.map((item) => item.setting)).toEqual(['musicOn', 'autopilotTurns']);
    expect(SETTINGS.map((item) => item.setting)).toEqual([
      'autosaveLimit',
      'autopilotAutosaveLimit',
      'musicOn',
      'musicVolume',
      'soundsOn',
      'soundsVolume',
      'autopilotControlsShown',
      'autopilotTurns',
      'autopilotControlsExpanded',
      'autopilotAi',
      'devModeOn',
      'revealHiddenContentOn',
      'combatSimulatorShown',
      'screenLimit',
    ]);
  });
});
