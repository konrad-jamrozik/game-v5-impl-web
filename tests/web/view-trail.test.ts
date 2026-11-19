/** CSCR, View trail: Follow, Go back, and the label of the Back control. */
import { describe, expect, it } from 'vite-plus/test';
import {
  backLabel,
  closeReturnsTo,
  follow,
  fromTurnSummary,
  goBack,
  TURN_SUMMARY,
  type Place,
} from '../../src/web/view-trail.ts';

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

  it('holds only the Turn summary, over the place it was shown over, after opening from the Turn summary', () => {
    const missions: Place = {
      id: 'missions',
      item: 'mission-site-3',
      memo: {},
      scrollTop: 40,
      name: 'Missions',
    };
    const trail = fromTurnSummary(missions);
    expect(trail).toHaveLength(1);
    expect(backLabel(trail)).toBe('‹ Turn summary');
    expect(goBack(trail)?.place).toMatchObject({ id: TURN_SUMMARY, under: missions });
    // A Follow from there keeps the Turn summary first, so closing still returns to it.
    const deeper = follow(trail, combat);
    expect(backLabel(deeper)).toBe('‹ Combat report');
    expect(closeReturnsTo(deeper)).toMatchObject({ id: TURN_SUMMARY, under: missions });
  });

  it('closes to the globe when the Turn summary is not the first place', () => {
    expect(closeReturnsTo([])).toBeNull();
    expect(closeReturnsTo(follow([], sections))).toBeNull();
    expect(closeReturnsTo(fromTurnSummary(null))).toMatchObject({ id: TURN_SUMMARY, under: null });
  });
});
