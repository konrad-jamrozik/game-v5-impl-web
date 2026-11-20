/** MENU, Layout: the order of the rows of a Campaign card. */
import { describe, expect, it } from 'vite-plus/test';
import type { SaveListEntry } from '../../src/engine/index.ts';
import { orderSaveRows } from '../../src/web/save-rows.ts';

type Row = Pick<SaveListEntry, 'saveId' | 'autosaveKind' | 'turn' | 'actions' | 'writtenAt'>;

const at = (minute: number) => `2026-11-19T10:${String(minute).padStart(2, '0')}:00.000Z`;
const row = (
  saveId: string,
  autosaveKind: Row['autosaveKind'],
  turn: number,
  actions: number,
  minute: number,
) => ({
  saveId,
  autosaveKind,
  turn,
  actions,
  writtenAt: at(minute),
});
const order = (rows: readonly Row[]) => orderSaveRows(rows).map((save) => save.saveId);

describe('MENU: the rows of a Campaign card', () => {
  it('are ordered by Turn, then by number of Player actions, then by the time each was last written', () => {
    expect(
      order([
        row('current', 'current', 16, 3, 50),
        row('turn-end-15', 'turnEnd', 15, 7, 40),
        row('manual-12', null, 12, 2, 45),
        row('manual-16-a1', null, 16, 1, 10),
        row('autopilot-15', 'autopilot', 15, 0, 41),
        row('manual-16-a3', null, 16, 3, 51),
      ]),
    ).toEqual(['manual-12', 'autopilot-15', 'turn-end-15', 'manual-16-a1', 'current', 'manual-16-a3']);
  });

  it('put the Current Autosave after every other Autosave equal to it in Turn and actions', () => {
    // E.g. a Disengagement Autosave of that World state written after the Current Autosave.
    expect(
      order([
        row('manual-early', null, 9, 0, 1),
        row('disengagement', 'disengagement', 9, 0, 30),
        row('current', 'current', 9, 0, 20),
        row('manual-late', null, 9, 0, 40),
      ]),
    ).toEqual(['manual-early', 'disengagement', 'current', 'manual-late']);
  });

  it('keep the order total when a Campaign save written on request lies between them in time', () => {
    const rows = [
      row('current', 'current', 9, 0, 10),
      row('manual', null, 9, 0, 20),
      row('disengagement', 'disengagement', 9, 0, 30),
    ];
    expect(order(rows)).toEqual(['manual', 'disengagement', 'current']);
    expect(order([...rows].reverse())).toEqual(['manual', 'disengagement', 'current']);
  });
});
