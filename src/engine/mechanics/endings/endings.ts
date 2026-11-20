/** ENDING (Panic and Endings): the Panic step and the Ending check step, as functions of the values they read. */
import type { CampaignEnding, EndingReason } from '../../state/types.ts';

/** Panic of 100, in hundredths. */
export const PANIC_MAX_HUNDREDTHS = 10_000;

/**
 * ENDING, Panic step: the new Panic is max(0, min(100, P0 + C)); the clamp is applied once, to the sum. Panic and the
 * Pending panic change are Decimal quantities, held in hundredths, so no rounding occurs.
 */
export function applyPendingPanicChange(
  panicHundredths: number,
  pendingPanicChangeHundredths: number,
): number {
  return Math.max(0, Math.min(PANIC_MAX_HUNDREDTHS, panicHundredths + pendingPanicChangeHundredths));
}

export interface EndingDecision {
  readonly ending: CampaignEnding;
  readonly reasons: EndingReason[];
}

/**
 * ENDING, Ending check step: Victory is tried first and holds exactly when the Pending victory is yes, i.e. a
 * `win_campaign` Effect was applied in the Advance turn; otherwise Defeat holds with every Ending reason whose condition
 * holds: Panic at the Panic limit, money below zero, or the Pending defeat, i.e. an existential Faction operation not
 * stopped.
 */
export function checkEnding(input: {
  pendingVictory: boolean;
  pendingDefeat: boolean;
  panicHundredths: number;
  /** The Panic limit, `defeat_at_panic_pct`, a whole number of percent. */
  panicLimit: number;
  money: number;
}): EndingDecision | null {
  if (input.pendingVictory) {
    return { ending: 'Victory', reasons: ['CampaignObjectiveAchieved'] };
  }
  const reasons: EndingReason[] = [];
  if (input.panicHundredths >= input.panicLimit * 100) {
    reasons.push('PanicAtTheLimit');
  }
  if (input.money < 0) {
    reasons.push('MoneyBelowZero');
  }
  if (input.pendingDefeat) {
    reasons.push('ExistentialOperationNotStopped');
  }
  return reasons.length > 0 ? { ending: 'Defeat', reasons } : null;
}
