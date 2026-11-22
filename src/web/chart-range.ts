/**
 * VIS, Charts: the "Last 100 Turns" checkbox of every chart. Each chart keeps its own, unchecked when a Session starts
 * and as the Player last left it for the rest of the Session, so it lives here, outside any Campaign and any place.
 */
import { useSyncExternalStore } from 'react';

/** VIS, Charts: how many of the last Turns a chart shows while its checkbox is checked. */
export const LAST_TURNS = 100;

const checked = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the chart named `chart` shows only its last 100 Turns, and the setter of that. */
export function useLastTurns(chart: string): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => checked.has(chart),
    () => false,
  );
  const set = (value: boolean) => {
    if (value) {
      checked.add(chart);
    } else {
      checked.delete(chart);
    }
    for (const listener of listeners) {
      listener();
    }
  };
  return [on, set];
}

/**
 * VIS, Charts: the Turns a chart shows, the last 100 of `turns` while `on`, otherwise all of them; the turn numbers
 * need not be consecutive, e.g. the ended Turns of Money flow.
 */
export function lastTurnsFrom(turns: readonly number[], on: boolean): number {
  if (!on || turns.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.max(...turns) - LAST_TURNS + 1;
}
