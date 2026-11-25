/**
 * GUI, Changed settings: the Settings panel lists every Global configuration setting whose stored value overrides its
 * Game build default, as `session.globalConfiguration.get()` reports them, in the order of the Global configuration
 * table in CONFIG, each in plain words with its value and its Game build default.
 */
import type { SettingReport } from '../engine/index.ts';
import { checkedCharts } from './chart-range.ts';

type Words = (value: unknown) => string;

const onOff: Words = (value) => (value === true ? 'on' : 'off');
const percent: Words = (value) => `${String(value)}%`;
/** The charts on Last 100 Turns, by name, or "none". */
const chartList: Words = (value) => {
  const charts = checkedCharts(value);
  return charts.length === 0 ? 'none' : charts.join(', ');
};

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
  autopilotControlsExpanded: {
    name: 'Autopilot controls',
    words: (value) => (value === true ? 'expanded' : 'collapsed'),
  },
  autopilotAi: { name: 'Autopilot AI', words: (value) => (value === '' ? 'first available' : String(value)) },
  devModeOn: { name: 'Dev mode', words: onOff },
  revealHiddenContentOn: { name: 'Reveal hidden content', words: onOff },
  combatSimulatorShown: {
    name: 'Combat simulator',
    words: (value) => (value === true ? 'shown' : 'hidden'),
  },
  screenLimit: { name: 'Screen limit', words: onOff },
  musicControlCollapsed: {
    name: 'Music control',
    words: (value) => (value === true ? 'collapsed' : 'expanded'),
  },
  sidePanelHidden: { name: 'Side panel', words: (value) => (value === true ? 'hidden' : 'shown') },
  lastTurnsCharts: { name: 'Charts on Last 100 Turns', words: (value) => chartList(value) },
  artworkTuning: { name: 'Artwork tuning', words: (value) => (value === '{}' ? 'none' : 'tuned') },
  combatReplayOptionsShown: {
    name: 'Combat replay Options',
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
