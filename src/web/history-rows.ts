/** HVIEW, Turn by Turn table: the rows of the History View, one per ended Turn and one for the current Turn. */
import type { ActionRecordItem, HistoryEntry } from '../engine/index.ts';
import type { Snapshot } from './store.ts';

/** One row of the Turn by Turn table: an ended Turn from its History entry, or the current Turn. */
export interface HistoryRow {
  readonly turn: number;
  /** HVIEW: the current Turn's row, from the Open History entry, marked "now". */
  readonly now: boolean;
  readonly moneyStart: number;
  readonly moneyEnd: number;
  readonly income: number;
  readonly upkeep: number;
  readonly panic: number;
  readonly agents: number;
  readonly actions: readonly ActionRecordItem[];
  /** The History entry of an ended Turn, whose Events the row shows; none for the current Turn. */
  readonly entry: HistoryEntry | null;
}

/** HVIEW, Turn by Turn table: newest first, with the current Turn's row on top unless the Campaign has ended. */
export function historyRows(snapshot: Pick<Snapshot, 'history' | 'state'>): HistoryRow[] {
  const history = snapshot.history;
  const state = snapshot.state;
  if (history === null || state === null) {
    return [];
  }
  const rows: HistoryRow[] = history.entries.map((entry) => ({
    turn: entry.turn,
    now: false,
    moneyStart: entry.turnStart.money,
    moneyEnd: entry.turnEnd.money,
    income: entry.report.income,
    upkeep: entry.report.upkeep,
    panic: entry.report.panicAfter,
    agents: entry.turnEnd.servingAgents,
    actions: entry.actions,
    entry,
  }));
  // Once the Campaign has a Campaign ending no Player action can follow, so the current Turn has no row.
  if (state.ending === null) {
    const open = history.openEntry;
    rows.push({
      turn: open.turn,
      now: true,
      moneyStart: open.turnStart.money,
      moneyEnd: open.turnEnd.money,
      // ECON, Projected income and upkeep: what the Advance turn ending the Turn would add and charge exactly.
      income: state.agency.projectedIncome,
      upkeep: state.agency.projectedUpkeep,
      // What that Advance turn would change of Panic depends on events not yet resolved.
      panic: state.panic,
      agents: open.turnEnd.servingAgents,
      actions: open.actions,
      entry: null,
    });
  }
  return rows.reverse();
}
