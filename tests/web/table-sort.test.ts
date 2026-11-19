/** VIS, Tables: sorting a table by its column headers in up to four sort tiers. */
import { describe, expect, it } from 'vite-plus/test';
import {
  pressHeader,
  pressHeaderUnderLock,
  sortRows,
  tierOpacity,
  withLockedTier,
  type SortTier,
} from '../../src/web/table-sort.ts';

type Key = 'a' | 'b' | 'c' | 'd' | 'e';

describe('VIS: Tables, sort tiers', () => {
  it('makes a column in no tier the first tier, descending when it holds numbers and ascending otherwise', () => {
    expect(pressHeader<Key>([], 'a', true)).toEqual([{ key: 'a', desc: true }]);
    expect(pressHeader<Key>([{ key: 'a', desc: true }], 'b', false)).toEqual([
      { key: 'b', desc: false },
      { key: 'a', desc: true },
    ]);
  });

  it('drops a tier pushed past the fourth', () => {
    let tiers: SortTier<Key>[] = [];
    for (const key of ['a', 'b', 'c', 'd', 'e'] as const) {
      tiers = pressHeader(tiers, key, false);
    }
    expect(tiers.map((tier) => tier.key)).toEqual(['e', 'd', 'c', 'b']);
  });

  it('flips the direction of the first tier', () => {
    expect(
      pressHeader<Key>(
        [
          { key: 'a', desc: true },
          { key: 'b', desc: false },
        ],
        'a',
        true,
      ),
    ).toEqual([
      { key: 'a', desc: false },
      { key: 'b', desc: false },
    ]);
  });

  it('moves a lower tier to the first with the direction it had, and the tiers above it down one', () => {
    const tiers: SortTier<Key>[] = [
      { key: 'a', desc: false },
      { key: 'b', desc: true },
      { key: 'c', desc: true },
    ];
    expect(pressHeader(tiers, 'c', false)).toEqual([
      { key: 'c', desc: true },
      { key: 'a', desc: false },
      { key: 'b', desc: true },
    ]);
  });

  it('orders by the first tier, then the second, and keeps the default order for rows equal in every tier', () => {
    // E.g., sorting by effective skill and then by Blocked by puts the empty ones first, ordered by effective skill.
    const rows = [
      { id: 'agent-1', skill: 50, reason: 'Already on Contracting' },
      { id: 'agent-2', skill: 70, reason: '' },
      { id: 'agent-3', skill: 60, reason: '' },
      { id: 'agent-10', skill: 70, reason: '' },
    ];
    let tiers: SortTier<'skill' | 'reason'>[] = [];
    tiers = pressHeader(tiers, 'skill', true);
    tiers = pressHeader(tiers, 'reason', false);
    const sorted = sortRows(rows, tiers, (row, key) => row[key]);
    expect(sorted.map((row) => row.id)).toEqual(['agent-2', 'agent-10', 'agent-3', 'agent-1']);
  });

  it('puts a locked tier above the Player tiers, ignores presses on its header, and counts it as the first', () => {
    const locked: SortTier<Key> = { key: 'a', desc: false };
    const player: SortTier<Key>[] = [
      { key: 'b', desc: true },
      { key: 'c', desc: false },
      { key: 'd', desc: false },
      { key: 'e', desc: false },
    ];
    expect(withLockedTier(locked, player).map((tier) => tier.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(withLockedTier(null, player)).toEqual(player);
    expect(pressHeaderUnderLock(player, 'a', false, 'a')).toEqual(player);
    expect(pressHeaderUnderLock(player, 'c', false, 'a')[0]).toEqual({ key: 'c', desc: false });
    expect([0, 1, 2, 3, 4].map(tierOpacity)).toEqual([1, 0.7, 0.45, 0.25, 0.25]);
  });
});
