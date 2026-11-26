/**
 * VIS, Charts: the "Last 100 Turns" checkbox of every chart. Each chart keeps its own, unchecked by default, in the
 * Global configuration setting Last 100 Turns charts, which holds the charts whose checkbox is checked as a JSON array
 * of their names, so each stays as the Player last left it in every later Session.
 */
import { setSetting, settingValue, snapshot, useSnapshot } from './store.ts';

export { LAST_TURNS, lastTurnsFrom } from './series-chart-scene.ts';

/** The charts whose checkbox is checked, from the stored text of Last 100 Turns charts. */
export function checkedCharts(stored: unknown): readonly string[] {
  if (typeof stored !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether the chart named `chart` shows only its last 100 Turns, and the setter of that. */
export function useLastTurns(chart: string): [boolean, (on: boolean) => void] {
  const on = checkedCharts(settingValue(useSnapshot().configuration, 'lastTurnsCharts')).includes(chart);
  const set = (value: boolean) => {
    // Read at the moment of the change, so that two charts changed in turn both keep their choice.
    const others = checkedCharts(settingValue(snapshot().configuration, 'lastTurnsCharts')).filter(
      (name) => name !== chart,
    );
    void setSetting('lastTurnsCharts', JSON.stringify(value ? [...others, chart].sort() : others));
  };
  return [on, set];
}
