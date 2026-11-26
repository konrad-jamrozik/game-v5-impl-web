/** Formatting of engine values for reading, shared by the screens; no gameplay rule. */
import { groupDigitString, type ConsequenceRecord } from '../engine/index.ts';

/**
 * GUI, Digit grouping: a number as the GUI shows it, with a comma between each group of three digits of its whole
 * part, counted from the right, e.g. 45817 as "45,817", -1040 as "-1,040", and 999 as "999". The text is built from
 * the digits, never from the browser locale. An identifier, e.g. a seed, and a number in a field the Player edits are
 * not numbers to group and never pass through here.
 */
export function groupDigits(n: number): string {
  const [whole = '', fraction] = String(Math.abs(n)).split('.');
  const grouped = groupDigitString(whole);
  return `${n < 0 ? '-' : ''}${fraction === undefined ? grouped : `${grouped}.${fraction}`}`;
}

/** A change of a number, with "+" before a gain, e.g. 1200 as "+1,200", -80 as "-80", and 0 as "0". */
export function signedNumber(value: number): string {
  return value > 0 ? `+${groupDigits(value)}` : groupDigits(value);
}

/**
 * GUI, Decimal quantities shown: one of the few Decimal quantities shown with two decimals, held in hundredths, shown
 * exactly and never rounded, e.g. 2940 as 29.40, 10110 as 101.10, and 125050 as 1,250.50 under GUI, Digit grouping.
 * The text is built from the whole number of hundredths, never through a binary float.
 */
export function decimalText(hundredths: number): string {
  const sign = hundredths < 0 ? '-' : '';
  const magnitude = Math.abs(hundredths);
  const whole = Math.floor(magnitude / 100);
  return `${sign}${groupDigits(whole)}.${String(magnitude - whole * 100).padStart(2, '0')}`;
}

/**
 * GUI, Decimal quantities shown: by default a Decimal quantity, held in hundredths, is shown as a whole number,
 * rounded down so that it never reads as having reached a threshold it has not, e.g. 10190 as 101 and 2940 as 29. A
 * whole number held in hundredths, e.g. an Enemy's health in a Combat report, is shown as it is. Its digits are grouped
 * under GUI, Digit grouping, e.g. 123400 as 1,234.
 */
export function wholeText(hundredths: number): string {
  return groupDigits(Math.floor(hundredths / 100));
}

/**
 * COMBAT, Player-visible information: a hit chance, held in thousandths, shown as a percentage with exactly one
 * decimal place, exactly and never rounded again, e.g. 996 as "99.6%" and 800 as "80.0%".
 */
export function hitChanceText(thousandths: number): string {
  const whole = Math.floor(thousandths / 10);
  return `${whole}.${thousandths - whole * 10}%`;
}

/** Investigation progress, counted in hundredths, shown as whole progress points rounded down, e.g. 449 as 4. */
export function progressPoints(hundredths: number): string {
  return wholeText(hundredths);
}

/** A gain of Investigation progress, shown with two decimals so that a gain below one point shows, e.g. 104 as 1.04. */
export function progressGain(hundredths: number): string {
  return decimalText(hundredths);
}

/** One Consequence that applied, and whether it is good or bad for the Player. */
export interface ConsequencePart {
  readonly text: string;
  readonly tone: 'good' | 'bad';
}

/**
 * The Consequences that applied, in order, each with its tone under VIS, Consequences: a gain of money or funding, a
 * Panic reduction, and an Eliminated Faction are good; a loss of funding, a Panic increase, and a Defeat, read
 * "Campaign lost", are bad. A loss of money, which no Consequence gives today, would be bad too. A Panic change is shown
 * with two decimals under GUI, Decimal quantities shown, e.g. "Panic −0.50".
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
  if (c.panicIncreaseHundredths !== 0) {
    parts.push({ text: `Panic +${decimalText(c.panicIncreaseHundredths)}`, tone: 'bad' });
  }
  if (c.panicReductionHundredths !== 0) {
    parts.push({ text: `Panic −${decimalText(c.panicReductionHundredths)}`, tone: 'good' });
  }
  if (c.eliminatedFaction !== null) {
    parts.push({ text: `eliminated ${c.eliminatedFaction}`, tone: 'good' });
  }
  if (c.defeat) {
    parts.push({ text: 'Campaign lost', tone: 'bad' });
  }
  return parts;
}

/** GUI, Decimal quantities shown: Panic, held in hundredths, shown with two decimals, e.g. 2435 as "24.35%". */
export function panicText(hundredths: number): string {
  return `${decimalText(hundredths)}%`;
}

/** What one consequence of a Mission or a Mission site changed, e.g. "money +80, Panic −0.50". */
export function consequenceText(c: ConsequenceRecord): string {
  return (
    consequenceParts(c)
      .map((part) => part.text)
      .join(', ') || 'no consequence'
  );
}
