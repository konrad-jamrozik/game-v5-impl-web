/**
 * GUI, Progress circle and Completion estimate: how far an Active Investigation has come, in one glyph, and roughly
 * when it will complete. Both are worked out from Player-visible information only and are not Derived values of the
 * engine; no gameplay rule is implemented here.
 */
import type { InvestigationView } from '../engine/index.ts';
import type { RequiredKnowledge } from './progress-bar.ts';

export type ProgressCircleModel =
  | { readonly kind: 'share'; readonly share: number }
  | { readonly kind: 'full' }
  | { readonly kind: 'unknown' };

export interface CompletionEstimate {
  readonly text: string;
  /** VIS, Panels and cards: an estimate whose earliest Advance turn is the next one is in Accent text. */
  readonly tone: 'next' | 'plain' | 'muted';
}

const UNKNOWN_LEAD: RequiredKnowledge = { requiredProgress: 'unknown', requiredProgressRange: 'unknown' };

/** GUI, Progress circle: progress is in hundredths of a progress point, the Required progress in progress points. */
export function progressCircle(
  lead: RequiredKnowledge | null | undefined,
  progress: number,
): ProgressCircleModel {
  const required = (lead ?? UNKNOWN_LEAD).requiredProgress;
  if (required === 'unknown') {
    return { kind: 'unknown' };
  }
  const target = required * 100;
  if (target <= 0 || progress >= target) {
    return { kind: 'full' };
  }
  return { kind: 'share', share: Math.max(0, progress / target) };
}

/**
 * GUI, Completion estimate, with p the Investigation progress, g the projected progress gain, and R to M the Required
 * progress range, all in hundredths of a progress point: "ETA a–b T" with a = max(1, ⌈(R − p) / g⌉) and
 * b = ⌈(M − p) / g⌉, "ETA a T" when a equals b, "ETA ≤ b T" once p has reached R, "stalled" while g is 0, and
 * "ETA ?" while R and M are hidden.
 */
export function completionEstimate(
  lead: RequiredKnowledge | null | undefined,
  investigation: Pick<InvestigationView, 'progress' | 'projectedProgressGain'>,
): CompletionEstimate {
  const gain = investigation.projectedProgressGain ?? 0;
  if (gain <= 0) {
    return { text: 'stalled', tone: 'muted' };
  }
  const known = lead ?? UNKNOWN_LEAD;
  if (known.requiredProgress === 'unknown' || known.requiredProgressRange === 'unknown') {
    return { text: 'ETA ?', tone: 'muted' };
  }
  const p = investigation.progress;
  const required = known.requiredProgress * 100;
  const greatest = known.requiredProgressRange.max * 100;
  const latest = Math.max(1, Math.ceil((greatest - p) / gain));
  if (p >= required) {
    return { text: `ETA ≤ ${latest} T`, tone: 'next' };
  }
  const earliest = Math.max(1, Math.ceil((required - p) / gain));
  const last = Math.max(earliest, latest);
  return {
    text: earliest === last ? `ETA ${earliest} T` : `ETA ${earliest}–${last} T`,
    tone: earliest === 1 ? 'next' : 'plain',
  };
}
