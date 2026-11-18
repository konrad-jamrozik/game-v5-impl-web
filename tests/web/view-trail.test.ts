/** CSCR, View trail: Follow, Go back, and the label of the Back control. */
import { describe, expect, it } from 'vitest';
import { backLabel, follow, goBack, type Place } from '../../src/web/view-trail.ts';

const sections: Place = {
  id: 'report',
  item: null,
  memo: { combat: null },
  scrollTop: 120,
  name: 'Turn report',
};
const combat: Place = {
  id: 'report',
  item: null,
  memo: { combat: 'mission-1' },
  scrollTop: 0,
  name: 'Combat report',
};

describe('CSCR: View trail', () => {
  it('is empty with no Back control until the Player follows something', () => {
    expect(backLabel([])).toBeNull();
    expect(goBack([])).toBeNull();
  });

  it('adds the place left on a Follow and names it on the Back control', () => {
    const trail = follow([], sections);
    expect(backLabel(trail)).toBe('‹ Turn report');
    expect(backLabel(follow(trail, combat))).toBe('‹ Combat report');
  });

  it('retraces the places one at a time, most recent first, as they were left', () => {
    const trail = follow(follow([], sections), combat);
    const first = goBack(trail);
    expect(first?.place).toEqual(combat);
    const second = goBack(first?.trail ?? []);
    expect(second?.place).toEqual(sections);
    expect(second?.place.scrollTop).toBe(120);
    expect(second?.trail).toEqual([]);
  });
});
