/** VIS, Agent condition: the coloured exhaustion and current health values; the scales are in condition-scale.ts. */
import { exhaustionTone, healthColor, type ExhaustionLevels } from './condition-scale.ts';
import { decimalText } from './format.ts';

export { exhaustionLevels, exhaustionTone, healthColor, type ExhaustionLevels } from './condition-scale.ts';

function Triangle() {
  return (
    <svg className="warn-triangle" width="12" height="12" viewBox="0 0 16 16" role="img" aria-label="Warning">
      <path
        d="M8 1.5 15 14.5H1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 6v4.2M8 12v.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** An Agent's exhaustion, coloured under VIS, Agent condition. */
export function Exhaustion(props: { value: number; levels: ExhaustionLevels }) {
  const { tone, triangle } = exhaustionTone(props.value, props.levels);
  return (
    <span className={`condition ${tone}`}>
      {triangle ? <Triangle /> : null}
      {props.value}
    </span>
  );
}

/**
 * An Agent's current health, a Decimal quantity in hundredths, against its effective max health, coloured under VIS, Agent
 * condition from the exact share and shown with two decimals under GUI, Decimal quantities shown, e.g. "29.40/30".
 */
export function Health(props: { currentHundredths: number; base: number }) {
  return (
    <span className="condition" style={{ color: healthColor(props.currentHundredths / 100, props.base) }}>
      {decimalText(props.currentHundredths)}/{props.base}
    </span>
  );
}
