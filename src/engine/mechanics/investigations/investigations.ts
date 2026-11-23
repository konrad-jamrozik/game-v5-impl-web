/**
 * INVSTG (Investigations): the Required progress range, Progress gain with team efficiency, Assessment, the
 * Completion check, and Progress loss. Investigation progress is counted in hundredths of a progress point.
 */
import type { InvestigationParametersGdr } from '../../../gdr/index.ts';
import type { Investigation } from '../../state/types.ts';

/** Hundredths of a progress point in one progress point. */
export const HUNDREDTHS_PER_PROGRESS_POINT = 100;

/** INVSTG, Required progress range and outcome: every whole number from R to round down(R × max_pct / 100). */
export function requiredProgressRange(
  requiredProgress: number,
  parameters: InvestigationParametersGdr,
): { readonly min: number; readonly max: number } {
  return {
    min: requiredProgress,
    // INVSTG, Required progress range and outcome: the greatest value is rounded up.
    max: Math.ceil((requiredProgress * parameters.requiredProgressMaxPct) / 100),
  };
}

/** The name of the Required progress outcome of the next Investigation of a Lead; see DEC-018. */
export function requiredProgressOutcome(lead: string): string {
  return `investigation.requiredProgress.${lead}`;
}

/**
 * INVSTG, Progress gain: the greatest whole number k such that k^q × n^(q − p) ≤ S^q, where p / q is
 * `team_efficiency_exponent` in lowest terms; 0 when n is 0. It equals round down(S × n^e / n) exactly, in
 * hundredths of a progress point.
 */
export function progressGain(
  workingMembers: number,
  skillSum: number,
  parameters: InvestigationParametersGdr,
): number {
  if (workingMembers === 0 || skillSum === 0) {
    return 0;
  }
  const p = parameters.teamEfficiencyExponent.n;
  const q = parameters.teamEfficiencyExponent.d;
  const factor = BigInt(workingMembers) ** (q - p);
  const bound = BigInt(skillSum) ** q;
  const fits = (k: number): boolean => BigInt(k) ** q * factor <= bound;
  // The gain lies from 0 to S, because n^(q − p) is at least 1.
  let low = 0;
  let high = skillSum;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** INVSTG, Assessment: the Investigation progress, in hundredths, at which an Investigation becomes Assessed. */
export function assessmentThreshold(
  requiredProgress: number,
  parameters: InvestigationParametersGdr,
): number {
  return parameters.assessmentThresholdPct * requiredProgress;
}

/** INVSTG, Completion check: Investigation progress ≥ Actual required progress × 100. */
export function reachesActualRequiredProgress(progress: number, actualRequiredProgress: number): boolean {
  return progress >= actualRequiredProgress * HUNDREDTHS_PER_PROGRESS_POINT;
}

/**
 * INVSTG, Progress loss: round down(progress before × S_after / S_before), with the product formed before the
 * division; unchanged when S_before is 0.
 */
export function progressAfterLoss(progressBefore: number, skillBefore: number, skillAfter: number): number {
  if (skillBefore === 0) {
    return progressBefore;
  }
  return Number((BigInt(progressBefore) * BigInt(skillAfter)) / BigInt(skillBefore));
}

/** INVSTG, Assessment: a Lead is an Assessed Lead when at least one Investigation of it is Assessed. */
export function isAssessedLead(
  lead: string,
  investigations: Readonly<Record<string, Investigation>>,
): boolean {
  return Object.values(investigations).some(
    (investigation) => investigation.constants.lead === lead && investigation.state.assessed,
  );
}
