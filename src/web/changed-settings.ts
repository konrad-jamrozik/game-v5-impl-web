/**
 * GUI, Changed settings: the Settings panel lists every Global configuration setting whose stored value overrides its
 * Game build default, as `session.globalConfiguration.get()` reports them, in the order of the Global configuration
 * table in CONFIG, each in plain words with its value and its Game build default.
 */
import type { SettingReport } from '../engine/index.ts';

type Words = (value: unknown) => string;

const onOff: Words = (value) => (value === true ? 'on' : 'off');
const percent: Words = (value) => `${String(value)}%`;

/** How each setting reads in its line: its name and the words for one of its values. */
const WORDING: Readonly<Record<string, { readonly name: string; readonly words: Words }>> = {
  musicOn: { name: 'Music', words: onOff },
  musicVolume: { name: 'Music volume', words: percent },
  soundsOn: { name: 'Sounds', words: onOff },
  soundsVolume: { name: 'Sounds volume', words: percent },
  autopilotControlsShown: {
    name: 'Autopilot controls',
    words: (value) => (value === true ? 'shown' : 'hidden'),
  },
  combatSimulatorShown: {
    name: 'Combat simulator',
    words: (value) => (value === true ? 'shown' : 'hidden'),
  },
};

/** The line of one changed setting, e.g. "Autopilot Turns: 100 (default 10)" or "Music volume: 30% (default 50%)". */
export function changedSettingLine(setting: SettingReport): string {
  const wording = WORDING[setting.setting] ?? {
    name: setting.name,
    words: (value: unknown) => String(value),
  };
  return `${wording.name}: ${wording.words(setting.effectiveValue)} (default ${wording.words(setting.gameBuildDefault)})`;
}

/** The changed settings, in the order the report lists them, which is the order of the Global configuration table. */
export function changedSettings(settings: readonly SettingReport[]): readonly SettingReport[] {
  return settings.filter((setting) => setting.stored);
}
