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

/** What one consequence of a Mission or a Mission site changed, e.g. "money +80, Panic −3". */
export function consequenceText(c: ConsequenceRecord): string {
  const parts: string[] = [];
  if (c.money !== 0) {
    parts.push(`money ${signedNumber(c.money)}`);
  }
  if (c.fundingChange !== 0) {
    parts.push(`funding ${signedNumber(c.fundingChange)}`);
  }
  if (c.panicIncrease !== 0) {
    parts.push(`Panic +${c.panicIncrease}`);
  }
  if (c.panicReduction !== 0) {
    parts.push(`Panic −${c.panicReduction}`);
  }
  if (c.eliminatedFaction !== null) {
    parts.push(`eliminated ${c.eliminatedFaction}`);
  }
  return parts.join(', ') || 'no consequence';
}
