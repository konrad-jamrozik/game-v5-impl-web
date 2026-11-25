/**
 * VIS, Agent condition: wherever a table shows an Agent's exhaustion or current health, its colour tells the Player at
 * a glance how worn down the Agent is. The exhaustion thresholds come from AgentParameters, so they follow the GDRs.
 */
import type { GameDataView } from '../engine/index.ts';

export interface ExhaustionLevels {
  /** `exhaustion_work_start_max`: Warning above it, i.e. from one more. */
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
  if (exhaustion > levels.warning) {
    return { tone: 'tone-warning', triangle: false };
  }
  return { tone: '', triangle: false };
}

/** VIS, Danger scale: its stops, from 0%, nothing wrong, to 100%, the worst, as colour tokens after the neutral one. */
const DANGER_STOPS: readonly (readonly [number, string])[] = [
  [25, 'var(--warning)'],
  [50, 'var(--accent-text)'],
  [75, 'var(--danger)'],
  [100, 'var(--danger-deep)'],
];

/**
 * VIS, Danger scale: the colour of a severity from 0% to 100%, mixing the two neighbouring stops in sRGB in proportion,
 * e.g. 12.5% is halfway between Text and Warning. Its 0% stop is `neutral`, Text unless a use says otherwise.
 */
export function dangerScaleColor(severityPct: number, neutral = 'var(--text)'): string {
  const severity = Math.max(0, Math.min(100, severityPct));
  const stops: readonly (readonly [number, string])[] = [[0, neutral], ...DANGER_STOPS];
  for (let i = 1; i < stops.length; i += 1) {
    const [hi, hiColor] = stops[i] ?? [100, 'var(--danger-deep)'];
    const [lo, loColor] = stops[i - 1] ?? [0, neutral];
    if (severity <= hi) {
      // The share of the higher stop, rounded to a tenth of a percent.
      const weight = Math.round(((severity - lo) / (hi - lo)) * 1000) / 10;
      if (weight <= 0) {
        return loColor;
      }
      if (weight >= 100) {
        return hiColor;
      }
      return `color-mix(in srgb, ${loColor} ${Math.round((100 - weight) * 10) / 10}%, ${hiColor})`;
    }
  }
  return 'var(--danger-deep)';
}

/**
 * VIS, Agent condition, Current health: the Danger scale, with the share of effective max health that current health
 * falls short of as its severity, e.g. 15 of 30 is Accent text. Its neutral end is the row's own text colour: Text, or
 * Text muted in a muted row under AVIEW, Agent table.
 */
export function healthColor(current: number, base: number): string {
  const pct = base <= 0 ? 0 : Math.max(0, Math.min(100, (current / base) * 100));
  return dangerScaleColor(100 - pct, 'currentColor');
}

/** VIS, Meters: the Danger scale, with the share of the limit reached as its severity. */
export function nearLimitColor(value: number, limit: number): string {
  const pct = limit <= 0 ? 100 : (value / limit) * 100;
  return dangerScaleColor(pct);
}
