/** VIS, Charts: the Last 100 Turns checkbox. */
import { describe, expect, it } from 'vite-plus/test';
import { LAST_TURNS, lastTurnsFrom } from '../../src/web/chart-range.ts';

describe('VIS: the Last 100 Turns checkbox', () => {
  it('shows only the last 100 Turns while checked, and every Turn otherwise', () => {
    const turns = Array.from({ length: 150 }, (_, index) => index + 1);
    expect(LAST_TURNS).toBe(100);
    expect(lastTurnsFrom(turns, true)).toBe(51);
    expect(turns.filter((turn) => turn >= lastTurnsFrom(turns, true))).toHaveLength(100);
    expect(lastTurnsFrom(turns, false)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('changes nothing for a chart of 100 Turns or fewer', () => {
    const turns = Array.from({ length: 40 }, (_, index) => index + 1);
    expect(turns.filter((turn) => turn >= lastTurnsFrom(turns, true))).toEqual(turns);
  });
});
