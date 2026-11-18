/** Formatting of engine values for reading, shared by the screens; no gameplay rule. */
import type { ConsequenceRecord } from '../engine/index.ts';

/** Investigation progress, counted in hundredths, shown in progress points with two decimals, e.g. 449 as 4.49. */
export function progressPoints(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  return `${whole}.${String(hundredths - whole * 100).padStart(2, '0')}`;
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
