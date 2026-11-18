/**
 * AVIEW, Header, and VIS, Cap bars: the free places under a cap and the share of the cap that is taken. Pure
 * presentation; no gameplay rule.
 */

export interface CapBarModel {
  /** The places still free, never below 0. */
  readonly free: number;
  readonly cap: number;
  /** The share of the cap that is taken, from 0 to 1; a cap with more taken than it allows is full. */
  readonly takenShare: number;
}

export function capBar(taken: number, cap: number): CapBarModel {
  const takenShare = cap <= 0 ? (taken > 0 ? 1 : 0) : Math.max(0, Math.min(1, taken / cap));
  return { free: Math.max(0, cap - taken), cap, takenShare };
}
