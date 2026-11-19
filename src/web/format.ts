/** Formatting of engine values for reading, shared by the screens; no gameplay rule. */
import type { ConsequenceRecord } from '../engine/index.ts';

/**
 * GUI, Decimal quantities shown: a Decimal quantity, held in hundredths, shown exactly with two decimals and never
 * rounded, e.g. 2940 as 29.40 and 10110 as 101.10. The text is built from the whole number of hundredths, never
 * through a binary float.
 */
export function decimalText(hundredths: number): string {
  const sign = hundredths < 0 ? '-' : '';
  const magnitude = Math.abs(hundredths);
  const whole = Math.floor(magnitude / 100);
  return `${sign}${whole}.${String(magnitude - whole * 100).padStart(2, '0')}`;
}

/** Investigation progress, counted in hundredths, shown in progress points with two decimals, e.g. 449 as 4.49. */
export function progressPoints(hundredths: number): string {
  return decimalText(hundredths);
}

/**
 * A Combatant's value from a Combat report, which holds it in hundredths for both sides (DEC-056): an Agent's is a
 * Decimal quantity, shown with two decimals; an Enemy's is a whole number, shown without decimals.
 */
export function combatantValueText(hundredths: number, side: 'agent' | 'enemy'): string {
  return side === 'agent' ? decimalText(hundredths) : String(hundredths / 100);
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** One Consequence that applied, and whether it is good or bad for the Player. */
export interface ConsequencePart {
  readonly text: string;
  readonly tone: 'good' | 'bad';
}

/**
 * The Consequences that applied, in order, each with its tone under VIS, Consequences: a gain of money or funding, a
 * Panic reduction, and an Eliminated Faction are good; a loss of funding and a Panic increase are bad. A loss of money,
 * which no Consequence gives today, would be bad too.
 */
export function consequenceParts(c: ConsequenceRecord): ConsequencePart[] {
  const parts: ConsequencePart[] = [];
  if (c.money !== 0) {
    parts.push({ text: `money ${signedNumber(c.money)}`, tone: c.money > 0 ? 'good' : 'bad' });
  }
  if (c.fundingChange !== 0) {
    parts.push({
      text: `funding ${signedNumber(c.fundingChange)}`,
      tone: c.fundingChange > 0 ? 'good' : 'bad',
    });
  }
  if (c.panicIncrease !== 0) {
    parts.push({ text: `Panic +${c.panicIncrease}`, tone: 'bad' });
  }
  if (c.panicReduction !== 0) {
    parts.push({ text: `Panic −${c.panicReduction}`, tone: 'good' });
  }
  if (c.eliminatedFaction !== null) {
    parts.push({ text: `eliminated ${c.eliminatedFaction}`, tone: 'good' });
  }
  return parts;
}

/** What one consequence of a Mission or a Mission site changed, e.g. "money +80, Panic −3". */
export function consequenceText(c: ConsequenceRecord): string {
  return (
    consequenceParts(c)
      .map((part) => part.text)
      .join(', ') || 'no consequence'
  );
}
