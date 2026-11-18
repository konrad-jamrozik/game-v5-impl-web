/**
 * GUI, Progress bar, and VIS, Progress bars: the geometry, fill colour share, and caption of the bar that shows an
 * Investigation's progress against its Lead's Required progress while the Actual required progress stays hidden. Pure
 * presentation; no gameplay rule. Every progress value is in hundredths of a progress point, as the engine gives it;
 * the Required progress and its range are in progress points, as LeadView gives them.
 */

/** VIS, Progress bars: the stub of an unscaled bar, as a share of the bar's width. */
export const UNSCALED_STUB_SHARE = 0.12;

/** The caption that says the Investigation may complete, in Accent text. */
export type CompletionCaption = 'may complete next turn' | 'may complete any turn';

export interface ScaledBar {
  readonly kind: 'scaled';
  /** The Required progress and the greatest value of its range, in hundredths. */
  readonly requiredProgress: number;
  readonly rangeMax: number;
  /** Where the tick and the hatched zone start, as a share of the bar. */
  readonly tickShare: number;
  /** The end of the fill, as a share of the bar. */
  readonly fillShare: number;
  /**
   * How far the fill colour has moved from Accent dim (0) to Accent (1): the share of the Required progress reached,
   * at most 1.
   */
  readonly colourShare: number;
  /** The preview segment of the projected progress gain, as shares of the bar; absent when there is no gain. */
  readonly preview: { readonly from: number; readonly to: number } | null;
  /** The projected progress gain, in hundredths; absent for an Investigation that is not Active. */
  readonly projectedGain: number | null;
  readonly caption: CompletionCaption | null;
}

export interface UnscaledBar {
  readonly kind: 'unscaled';
  readonly stubShare: number;
  /** E.g. "assessed at 25% of required". */
  readonly caption: string;
  readonly projectedGain: number | null;
}

export interface CompletedBar {
  readonly kind: 'completed';
  readonly requiredProgress: number;
  readonly rangeMax: number;
  readonly tickShare: number;
  /** The Investigation progress before the last Advance turn and the final Investigation progress, in hundredths. */
  readonly before: number;
  readonly final: number;
  /** The gain of the last Advance turn, in hundredths. */
  readonly gain: number;
  /** The split of the fill at the progress before the last Advance turn, and the completion mark, as shares. */
  readonly beforeShare: number;
  readonly finalShare: number;
  /** The fill colour share of the part before the last Advance turn. */
  readonly colourShare: number;
}

export type ProgressBarModel = ScaledBar | UnscaledBar | CompletedBar;

/** The Lead's Required progress and range in progress points, or unknown when it is not an Assessed Lead. */
export interface RequiredKnowledge {
  readonly requiredProgress: number | 'unknown';
  readonly requiredProgressRange: { readonly min: number; readonly max: number } | 'unknown';
}

function share(value: number, max: number): number {
  return max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
}

/**
 * The bar of an Active Investigation, e.g. in the Situation panel. `projectedGain` is null for an Investigation that
 * is not Active. Progress beyond the greatest value of the range is drawn at the bar's end; see DEC-042.
 */
export function progressBar(
  lead: RequiredKnowledge,
  progress: number,
  projectedGain: number | null,
  assessmentThresholdPct: number,
): ScaledBar | UnscaledBar {
  if (lead.requiredProgress === 'unknown' || lead.requiredProgressRange === 'unknown') {
    return {
      kind: 'unscaled',
      stubShare: UNSCALED_STUB_SHARE,
      caption: `assessed at ${assessmentThresholdPct}% of required`,
      projectedGain,
    };
  }
  const required = lead.requiredProgress * 100;
  const rangeMax = lead.requiredProgressRange.max * 100;
  const gain = projectedGain ?? 0;
  const fillShare = share(progress, rangeMax);
  const previewEnd = share(progress + gain, rangeMax);
  let caption: CompletionCaption | null = null;
  if (progress >= required) {
    caption = 'may complete any turn';
  } else if (projectedGain !== null && progress + projectedGain >= required) {
    caption = 'may complete next turn';
  }
  return {
    kind: 'scaled',
    requiredProgress: required,
    rangeMax,
    tickShare: share(required, rangeMax),
    fillShare,
    colourShare: share(progress, required),
    preview: gain > 0 && previewEnd > fillShare ? { from: fillShare, to: previewEnd } : null,
    projectedGain,
    caption,
  };
}

/**
 * The bar of an Investigation completed in the last Advance turn, in the Turn summary. A Completed Investigation is
 * always Assessed, so its Lead's Required progress and range are known; `gain` is from the Turn report.
 */
export function completedProgressBar(
  requiredProgress: number,
  rangeMax: number,
  finalProgress: number,
  gain: number,
): CompletedBar {
  const required = requiredProgress * 100;
  const max = rangeMax * 100;
  const before = finalProgress - gain;
  return {
    kind: 'completed',
    requiredProgress: required,
    rangeMax: max,
    tickShare: share(required, max),
    before,
    final: finalProgress,
    gain,
    beforeShare: share(before, max),
    finalShare: share(finalProgress, max),
    colourShare: share(before, required),
  };
}

/** Labels under the bar closer than this share of its width would overlap. */
const LABEL_GAP_SHARE = 0.08;

const near = (a: number, b: number) => Math.abs(a - b) < LABEL_GAP_SHARE;

/**
 * VIS, Progress bars: which values of the range are written under the bar. On a Completed Investigation, a value of
 * the range that the final Investigation progress would overlap is left out, and the final Investigation progress
 * keeps its place; the Required progress also gives way to the progress before the last Advance turn, under DEC-042.
 */
export function rangeLabels(model: ScaledBar | CompletedBar): {
  readonly requiredProgress: boolean;
  readonly rangeMax: boolean;
} {
  if (model.kind === 'scaled') {
    return { requiredProgress: true, rangeMax: true };
  }
  return {
    requiredProgress: !near(model.tickShare, model.beforeShare) && !near(model.tickShare, model.finalShare),
    rangeMax: !near(1, model.finalShare),
  };
}

/**
 * VIS, Progress bars: the fill colour, linear from Accent dim at 0 to Accent at the Required progress, as a CSS colour
 * over the Design tokens so that it follows the theme.
 */
export function fillColour(colourShare: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, colourShare)) * 1000) / 10;
  return `color-mix(in srgb, var(--accent) ${percent}%, var(--accent-dim))`;
}
