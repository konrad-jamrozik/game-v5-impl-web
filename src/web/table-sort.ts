/**
 * VIS, Tables: sorting a table by its column headers in up to four sort tiers, so that a new sort refines the earlier
 * ones instead of discarding them. Pure presentation; no gameplay rule.
 */

export interface SortTier<K extends string> {
  readonly key: K;
  /** Descending when true, ascending otherwise. */
  readonly desc: boolean;
}

/** VIS, Tables: a table remembers up to four sort tiers. */
export const MAX_SORT_TIERS = 4;

/**
 * VIS, Tables: whether a column's header shows the sort arrow: only the column of the first tier does, and the lower
 * tiers order the rows without one. `tiers` are the column tiers, without a locked tier that is no column.
 */
export function showsSortArrow<K extends string>(tiers: readonly SortTier<K>[], column: K): boolean {
  return tiers[0]?.key === column;
}

/**
 * VIS, Tables: the tiers a table sorts by when a view locks a tier above the up to four the Player chose, e.g. the
 * Blocked by tier of the Agent table while an Assignment filter is on.
 */
export function withLockedTier<K extends string>(
  locked: SortTier<K> | null,
  tiers: readonly SortTier<K>[],
): SortTier<K>[] {
  return locked === null ? [...tiers] : [locked, ...tiers.filter((tier) => tier.key !== locked.key)];
}

/** VIS, Tables: pressing a locked tier's header changes nothing; any other header changes the tiers under it. */
export function pressHeaderUnderLock<K extends string>(
  tiers: readonly SortTier<K>[],
  key: K,
  numeric: boolean,
  lockedKey: K | null,
): SortTier<K>[] {
  return key === lockedKey ? [...tiers] : pressHeader(tiers, key, numeric);
}

/**
 * VIS, Tables: the tiers after the Player presses the header of column `key`. A column in no tier becomes the first
 * tier, descending when it holds numbers; the first tier flips its direction; a lower tier becomes the first with the
 * direction it had.
 */
export function pressHeader<K extends string>(
  tiers: readonly SortTier<K>[],
  key: K,
  numeric: boolean,
): SortTier<K>[] {
  const index = tiers.findIndex((tier) => tier.key === key);
  if (index === 0) {
    return [{ key, desc: !(tiers[0] as SortTier<K>).desc }, ...tiers.slice(1)];
  }
  if (index > 0) {
    return [tiers[index] as SortTier<K>, ...tiers.slice(0, index), ...tiers.slice(index + 1)];
  }
  return [{ key, desc: numeric }, ...tiers].slice(0, MAX_SORT_TIERS);
}

/** Compares two values of one column: numbers by value, text in natural order, e.g. agent-9 before agent-10. */
export function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * VIS, Tables: `rows`, given in the table's default order, ordered by the first tier, rows equal in it by the second,
 * and so on; rows equal in every tier keep the default order.
 */
export function sortRows<R, K extends string>(
  rows: readonly R[],
  tiers: readonly SortTier<K>[],
  value: (row: R, key: K) => number | string,
): R[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const tier of tiers) {
        const order = compareValues(value(a.row, tier.key), value(b.row, tier.key));
        if (order !== 0) {
          return tier.desc ? -order : order;
        }
      }
      return a.index - b.index;
    })
    .map((item) => item.row);
}
