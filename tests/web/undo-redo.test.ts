/** CSCR, Undo and redo. */
import { describe, expect, it } from 'vite-plus/test';
import { undoRedoStep } from '../../src/web/undo-redo.ts';

const target = { saveId: 's', autosaveKind: 'turnEnd', turn: 12, crossesAutopilotEngagement: false } as const;

describe('CSCR: Undo and redo', () => {
  it('takes an Action step while Action navigation is available', () => {
    expect(undoRedoStep('undo', true, target)).toEqual({ form: 'action', tooltip: undefined });
    // Even when Autosave navigation would cross an Autopilot engagement.
    expect(undoRedoStep('undo', true, { ...target, crossesAutopilotEngagement: true })?.form).toBe('action');
  });

  it('takes a Turn step otherwise, naming the Turn and Autosave it loads', () => {
    expect(undoRedoStep('undo', false, target)).toEqual({
      form: 'turn',
      tooltip: 'Back to the end of Turn 12',
    });
    expect(
      undoRedoStep('redo', false, { ...target, autosaveKind: 'furthestProgress', turn: 14 })?.tooltip,
    ).toBe('Forward to the furthest progress, in Turn 14');
    // A step to an Autopilot Autosave that crosses no Autopilot engagement is a Turn step.
    expect(undoRedoStep('undo', false, { ...target, autosaveKind: 'autopilot', turn: 104 })).toEqual({
      form: 'turn',
      tooltip: 'Back to the end of Turn 104, played by Autopilot',
    });
    expect(
      undoRedoStep('redo', false, {
        ...target,
        autosaveKind: 'autopilot',
        turn: 100,
        crossesAutopilotEngagement: true,
      })?.form,
    ).toBe('autopilot');
  });

  it('takes an Autopilot step when Autosave navigation crosses an Autopilot engagement', () => {
    expect(
      undoRedoStep('undo', false, {
        saveId: 's',
        autosaveKind: 'engagement',
        turn: 5,
        crossesAutopilotEngagement: true,
      }),
    ).toEqual({ form: 'autopilot', tooltip: 'Back to Turn 5, before Autopilot was engaged' });
    expect(
      undoRedoStep('redo', false, {
        saveId: 's',
        autosaveKind: 'disengagement',
        turn: 35,
        crossesAutopilotEngagement: true,
      }),
    ).toEqual({ form: 'autopilot', tooltip: 'Forward to where Autopilot disengaged, in Turn 35' });
  });
});
