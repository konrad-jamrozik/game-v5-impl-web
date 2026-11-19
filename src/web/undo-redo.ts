/**
 * CSCR, Undo and redo: one Undo and one Redo button, each taking an Action step while Action navigation is available
 * and otherwise a step through Autosave navigation: an Autopilot step when it crosses an Autopilot engagement, and a
 * Turn step when it crosses none. Pure presentation; the engine decides what is available and what a step crosses.
 */
import type { AutosaveTarget } from '../engine/index.ts';

export type UndoRedoForm = 'action' | 'turn' | 'autopilot';

export interface UndoRedoStep {
  readonly form: UndoRedoForm;
  /** A Turn or Autopilot step's tooltip names the Turn and Autosave it loads, as getAutosaveStatus reports them. */
  readonly tooltip: string | undefined;
}

/** CSCR, Undo and redo: the label of each button for each step it can take. */
export const STEP_LABELS: Readonly<Record<'undo' | 'redo', Readonly<Record<UndoRedoForm, string>>>> = {
  undo: { action: 'Undo Action', turn: 'Undo Turn', autopilot: 'Undo Autopilot' },
  redo: { action: 'Redo Action', turn: 'Redo Turn', autopilot: 'Redo Autopilot' },
};

/**
 * VIS, Buttons: a neutral button while it takes an Action step, a weighty button while it takes a Turn step, and an
 * Autopilot button while it takes an Autopilot step. A button with no step keeps its Action label and kind.
 */
export function stepButtonKind(step: UndoRedoStep | null): 'plain' | 'weighty' | 'autopilot' {
  return step === null || step.form === 'action' ? 'plain' : step.form === 'turn' ? 'weighty' : 'autopilot';
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
    engagement: `Turn ${target.turn}, before Autopilot was engaged`,
    disengagement: `where Autopilot disengaged, in Turn ${target.turn}`,
    furthestProgress: `the furthest progress, in Turn ${target.turn}`,
  };
  return {
    form: target.crossesAutopilotEngagement ? 'autopilot' : 'turn',
    tooltip: `${direction} ${where[target.autosaveKind]}`,
  };
}
