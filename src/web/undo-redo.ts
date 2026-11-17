/**
 * CSCR, Undo and redo: one Undo and one Redo button, each taking an Action step while Action navigation is available
 * and otherwise a Turn step through Autosave navigation. Pure presentation; the engine decides what is available.
 */
import type { AutosaveTarget } from '../engine/index.ts';

export interface UndoRedoStep {
  readonly form: 'action' | 'turn';
  /** A Turn step's tooltip names the Turn and Autosave it loads, as getAutosaveStatus reports them. */
  readonly tooltip: string | undefined;
}

/** The step one undo or redo button takes now, or null when it has none. */
export function undoRedoStep(
  which: 'undo' | 'redo',
  actionAvailable: boolean,
  target: AutosaveTarget | null,
): UndoRedoStep | null {
  if (actionAvailable) {
    return { form: 'action', tooltip: undefined };
  }
  if (target === null) {
    return null;
  }
  const direction = which === 'undo' ? 'Back to' : 'Forward to';
  const where: Record<AutosaveTarget['autosaveKind'], string> = {
    turnEnd: `the end of Turn ${target.turn}`,
    engagement: `where Autopilot was engaged, in Turn ${target.turn}`,
    disengagement: `where Autopilot disengaged, in Turn ${target.turn}`,
    furthestProgress: `the furthest progress, in Turn ${target.turn}`,
  };
  return { form: 'turn', tooltip: `${direction} ${where[target.autosaveKind]}` };
}
