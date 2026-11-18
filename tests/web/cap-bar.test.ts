/** AVIEW, Header, and VIS, Cap bars: free places and the taken share. */
import { describe, expect, it } from 'vitest';
import { capBar } from '../../src/web/cap-bar.ts';

describe('VIS: Cap bars', () => {
  it('shows the free places and fills with the share of the cap that is taken', () => {
    // e.g. Training places free 4 / 12: the bar is filled two thirds of the way.
    const bar = capBar(8, 12);
    expect(bar.free).toBe(4);
    expect(bar.cap).toBe(12);
    expect(bar.takenShare).toBeCloseTo(2 / 3);
  });

  it('never shows a free count below 0, and a cap with more taken than it allows is a full bar', () => {
    expect(capBar(14, 12)).toEqual({ free: 0, cap: 12, takenShare: 1 });
  });

  it('is empty when nothing is taken', () => {
    expect(capBar(0, 20)).toEqual({ free: 20, cap: 20, takenShare: 0 });
    expect(capBar(0, 0)).toEqual({ free: 0, cap: 0, takenShare: 0 });
  });
});
