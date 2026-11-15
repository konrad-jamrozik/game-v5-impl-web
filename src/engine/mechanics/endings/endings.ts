/** ENDING (Panic and Endings): the Panic step and the Ending check step, as functions of the values they read. */
import type { CampaignEnding, EndingReason } from '../../state/types.ts';

/** ENDING, Panic step: the new Panic is max(0, min(100, P0 + C)); the clamp is applied once, to the sum. */
export function applyPendingPanicChange(panic: number, pendingPanicChange: number): number {
  return Math.max(0, Math.min(100, panic + pendingPanicChange));
}

export interface EndingDecision {
  readonly ending: CampaignEnding;
  readonly reasons: EndingReason[];
}

/**
 * ENDING, Ending check step: Victory is tried first and holds when the Campaign has at least one Faction and every
 * Faction is Defeated; otherwise Defeat holds when Panic is at the Panic limit or money is below zero.
 */
export function checkEnding(input: {
  factionsDefeated: readonly boolean[];
  panic: number;
  panicLimit: number;
  money: number;
}): EndingDecision | null {
  if (input.factionsDefeated.length >= 1 && input.factionsDefeated.every((defeated) => defeated)) {
    return { ending: 'Victory', reasons: ['EveryFactionDefeated'] };
  }
  const reasons: EndingReason[] = [];
  if (input.panic >= input.panicLimit) {
    reasons.push('PanicAtTheLimit');
  }
  if (input.money < 0) {
    reasons.push('MoneyBelowZero');
  }
  return reasons.length > 0 ? { ending: 'Defeat', reasons } : null;
}
