/** VIS, Tallies: a count that has no limit as a stack of squares, 10 per row, up to 10 rows. */
export const TALLY_ROW = 10;
export const TALLY_MAX = 100;

/** How many squares a tally of `count` items shows: one per item, none for 0, and at most 100. */
export function tallySquares(count: number): number {
  return Math.max(0, Math.min(TALLY_MAX, Math.floor(count)));
}
