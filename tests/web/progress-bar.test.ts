/** GUI, Progress bar, and VIS, Progress bars: geometry, fill colour share, and captions. */
import { describe, expect, it } from 'vitest';
import {
  UNSCALED_STUB_SHARE,
  completedProgressBar,
  fillColour,
  progressBar,
  rangeLabels,
  type ScaledBar,
} from '../../src/web/progress-bar.ts';

const assessed = { requiredProgress: 10, requiredProgressRange: { min: 10, max: 15 } } as const;
const unknown = { requiredProgress: 'unknown', requiredProgressRange: 'unknown' } as const;

describe('GUI: Progress bar', () => {
  it('spans 0 to the greatest value of the range of an Assessed Lead, with the tick at the Required progress', () => {
    const bar = progressBar(assessed, 500, 100, 25) as ScaledBar;
    expect(bar).toMatchObject({ kind: 'scaled', requiredProgress: 1000, rangeMax: 1500 });
    expect(bar.tickShare).toBeCloseTo(10 / 15);
    expect(bar.fillShare).toBeCloseTo(5 / 15);
    expect(bar.preview!.from).toBeCloseTo(5 / 15);
    expect(bar.preview!.to).toBeCloseTo(6 / 15);
    expect(bar.caption).toBeNull();
  });

  it('warms the fill by the share of the Required progress reached, and stays Accent beyond it', () => {
    expect(progressBar(assessed, 0, 0, 25)).toMatchObject({ colourShare: 0 });
    expect(progressBar(assessed, 500, 0, 25)).toMatchObject({ colourShare: 0.5 });
    expect(progressBar(assessed, 1200, 0, 25)).toMatchObject({ colourShare: 1 });
    expect(fillColour(0.5)).toBe('color-mix(in srgb, var(--accent) 50%, var(--accent-dim))');
  });

  it('says "may complete next turn" when the progress and the projected gain reach the Required progress', () => {
    expect(progressBar(assessed, 900, 99, 25)).toMatchObject({ caption: null });
    expect(progressBar(assessed, 900, 100, 25)).toMatchObject({ caption: 'may complete next turn' });
  });

  it('says "may complete any turn" once the progress has reached the Required progress', () => {
    expect(progressBar(assessed, 1000, 0, 25)).toMatchObject({ caption: 'may complete any turn' });
  });

  it('draws progress beyond the range at the end of the bar', () => {
    const bar = progressBar(assessed, 1700, 100, 25) as ScaledBar;
    expect(bar.fillShare).toBe(1);
    expect(bar.preview).toBeNull();
  });

  it('has no scale for a Lead that is not an Assessed Lead: a fixed stub and the assessment threshold', () => {
    expect(progressBar(unknown, 174, 174, 25)).toEqual({
      kind: 'unscaled',
      stubShare: UNSCALED_STUB_SHARE,
      caption: 'assessed at 25% of required',
      projectedGain: 174,
    });
    expect(UNSCALED_STUB_SHARE).toBe(0.12);
  });

  it('splits the fill of a Completed Investigation at the progress before the last Advance turn', () => {
    // E.g. Required progress 6, range 6 to 9, completed at 7.02 with a last gain of 1.74.
    const bar = completedProgressBar(6, 9, 702, 174);
    expect(bar).toMatchObject({ kind: 'completed', before: 528, final: 702, gain: 174, colourShare: 0.88 });
    expect(bar.beforeShare).toBeCloseTo(528 / 900);
    expect(bar.finalShare).toBeCloseTo(702 / 900);
    expect(bar.tickShare).toBeCloseTo(6 / 9);
  });

  it('VIS, Progress bars: leaves out the value of the range that the final progress would overlap', () => {
    // GUI, Progress bar: on a bar from 0 to 15, a final Investigation progress of 16.50 has its mark at the bar's end,
    // so the greatest value of the range gives way to its label.
    const pastEnd = completedProgressBar(10, 15, 1650, 400);
    expect(pastEnd.finalShare).toBe(1);
    expect(rangeLabels(pastEnd)).toEqual({ requiredProgress: true, rangeMax: false });
    // A final progress equal to the Required progress overlaps the tick's label instead.
    const atTick = completedProgressBar(10, 15, 1000, 400);
    expect(rangeLabels(atTick)).toEqual({ requiredProgress: false, rangeMax: true });
    // Far from both, both values of the range are written.
    expect(rangeLabels(completedProgressBar(10, 15, 1250, 100))).toEqual({
      requiredProgress: true,
      rangeMax: true,
    });
    expect(rangeLabels(progressBar(assessed, 1400, 300, 25) as ScaledBar)).toEqual({
      requiredProgress: true,
      rangeMax: true,
    });
  });
});
