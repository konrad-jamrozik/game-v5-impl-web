/** CSCR, Undo and redo. */
import { describe, expect, it } from 'vitest';
import { undoRedoStep } from '../../src/web/undo-redo.ts';

const target = { saveId: 's', autosaveKind: 'turnEnd', turn: 12 } as const;

describe('CSCR: Undo and redo', () => {
  it('takes an Action step while Action navigation is available', () => {
    expect(undoRedoStep('undo', true, target)).toEqual({ form: 'action', tooltip: undefined });
  });

  it('takes a Turn step otherwise, naming the Turn and Autosave it loads', () => {
    expect(undoRedoStep('undo', false, target)).toEqual({
      form: 'turn',
      tooltip: 'Back to the end of Turn 12',
    });
    expect(
      undoRedoStep('redo', false, { ...target, autosaveKind: 'furthestProgress', turn: 14 })?.tooltip,
    ).toBe('Forward to the furthest progress, in Turn 14');
  });

  it('has no step when neither form is available', () => {
    expect(undoRedoStep('redo', false, null)).toBeNull();
  });
});
