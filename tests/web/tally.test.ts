/** VIS, Tallies; UVIEW, Upgrade cards. */
import { describe, expect, it } from 'vite-plus/test';
import { tallySquares } from '../../src/web/tally.ts';

describe('VIS: Tallies', () => {
  it('shows one square per item, none for 0, and stops at 10 rows of 10', () => {
    expect(tallySquares(0)).toBe(0);
    expect(tallySquares(13)).toBe(13);
    expect(tallySquares(100)).toBe(100);
    expect(tallySquares(137)).toBe(100);
  });
});
