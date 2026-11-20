/**
 * MENU, Layout: the order of the rows of a Campaign card. Pure presentation over what `session.saves.list()`
 * reports.
 */
import type { SaveListEntry } from '../engine/index.ts';

type Row = Pick<SaveListEntry, 'saveId' | 'autosaveKind' | 'turn' | 'actions' | 'writtenAt'>;

/**
 * Orders the Campaign saves of one Campaign by Turn, earliest first, then by number of Player actions, fewest first,
 * then by the time each was last written, earliest first, except that the Current Autosave comes after every other
 * Autosave equal to it in Turn and actions. To keep the order total, the Current Autosave is placed as if it were
 * written no earlier than the latest of those Autosaves; see DEC-077.
 */
export function orderSaveRows<T extends Row>(saves: readonly T[]): T[] {
  const place = (save: T) => `${save.turn}:${save.actions}`;
  /** Of each place, the latest time an Autosave other than the Current Autosave was written. */
  const latestAutosave = new Map<string, string>();
  for (const save of saves) {
    if (save.autosaveKind !== null && save.autosaveKind !== 'current') {
      const latest = latestAutosave.get(place(save));
      if (latest === undefined || save.writtenAt > latest) {
        latestAutosave.set(place(save), save.writtenAt);
      }
    }
  }
  const time = (save: T): string => {
    const latest = save.autosaveKind === 'current' ? latestAutosave.get(place(save)) : undefined;
    return latest !== undefined && latest > save.writtenAt ? latest : save.writtenAt;
  };
  // At an equal time an Autosave comes first, then the Current Autosave, then a Campaign save written on request.
  const rank = (save: T): number =>
    save.autosaveKind === null ? 2 : save.autosaveKind === 'current' ? 1 : 0;
  return [...saves].sort(
    (a, b) =>
      a.turn - b.turn ||
      a.actions - b.actions ||
      compareText(time(a), time(b)) ||
      rank(a) - rank(b) ||
      compareText(a.saveId, b.saveId),
  );
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
