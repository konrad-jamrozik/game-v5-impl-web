/**
 * VIS, Agent condition: wherever a table shows an Agent's exhaustion or current health, its colour tells the Player at
 * a glance how worn down the Agent is. The exhaustion thresholds come from AgentParameters, so they follow the GDRs.
 */
import type { GameDataView } from '../engine/index.ts';

export interface ExhaustionLevels {
  /** `exhaustion_work_start_max`: Warning from here. */
  readonly warning: number;
  /** The midpoint of the two, rounded up: Accent text from here. */
  readonly high: number;
  /** `exhaustion_work_limit`: Danger, with a warning triangle, from here. */
  readonly danger: number;
}

/** The exhaustion thresholds, from the Player-visible AgentParameters; the Bootstrap values when not yet loaded. */
export function exhaustionLevels(gameData: GameDataView | null): ExhaustionLevels {
  const params = gameData?.agentParameters ?? {};
  const warning = params['exhaustionWorkStartMax'] ?? 30;
  const danger = params['exhaustionWorkLimit'] ?? 70;
  return { warning, high: Math.ceil((warning + danger) / 2), danger };
}

/** The colour class of an exhaustion value, and whether it shows the warning triangle. */
export function exhaustionTone(
  exhaustion: number,
  levels: ExhaustionLevels,
): { tone: string; triangle: boolean } {
  if (exhaustion >= levels.danger) {
    return { tone: 'tone-bad', triangle: true };
  }
  if (exhaustion >= levels.high) {
    return { tone: 'tone-accent', triangle: false };
  }
  if (exhaustion >= levels.warning) {
    return { tone: 'tone-warning', triangle: false };
  }
  return { tone: '', triangle: false };
}

/** The current health scale's stops, from 100% down to 0%, as colour tokens. */
const HEALTH_STOPS: readonly (readonly [number, string])[] = [
  // The row's own text colour: Text, or Text muted in a muted row under AVIEW, Agent table.
  [100, 'currentColor'],
  [75, 'var(--warning)'],
  [50, 'var(--accent-text)'],
  [25, 'var(--danger)'],
  [0, 'var(--danger-deep)'],
];

/**
 * The colour of a current health value: a smooth scale over the share of effective max health, mixing the two neighbouring
 * stops in sRGB in proportion, e.g. 15 of 30 is Accent text.
 */
export function healthColor(current: number, base: number): string {
  const pct = base <= 0 ? 0 : Math.max(0, Math.min(100, (current / base) * 100));
  for (let i = 0; i < HEALTH_STOPS.length - 1; i += 1) {
    const [hi, hiColor] = HEALTH_STOPS[i] ?? [100, 'currentColor'];
    const [lo, loColor] = HEALTH_STOPS[i + 1] ?? [0, 'var(--danger-deep)'];
    if (pct >= lo) {
      const weight = Math.round(((pct - lo) / (hi - lo)) * 1000) / 10;
      if (weight >= 100) {
        return hiColor;
      }
      if (weight <= 0) {
        return loColor;
      }
      return `color-mix(in srgb, ${hiColor} ${weight}%, ${loColor})`;
    }
  }
  return 'var(--danger-deep)';
}

/**
 * VIS, Meters: the colour of a value against its limit, on the current health scale run the other way: Text at 0% of
 * the limit, Warning at 25%, Accent text at 50%, Danger at 75%, and Danger deep at 100%, mixed in sRGB in between.
 */
export function nearLimitColor(value: number, limit: number): string {
  const pct = limit <= 0 ? 100 : Math.max(0, Math.min(100, (value / limit) * 100));
  // The health scale reads its share from the top down, so the share left below the limit takes the same stops.
  const color = healthColor(100 - pct, 100);
  return color === 'currentColor' ? 'var(--text)' : color.replace('currentColor', 'var(--text)');
}
