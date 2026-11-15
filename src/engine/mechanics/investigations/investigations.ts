/** INVSTG (Investigations): the completion probability and the projected completion probability. */
import { Rational, ratio } from '../../../kernel/index.ts';

/** The skill points that count as one point of Lead difficulty; a constant of the rule, not a GDR value. */
export const SKILL_POINTS_PER_DIFFICULTY = 100;

/** INVSTG, Completion probability: min(1, Investigation progress / (difficulty × 100)). */
export function completionProbability(progress: number, difficulty: number): Rational {
  return Rational.min(1, ratio(progress, difficulty * SKILL_POINTS_PER_DIFFICULTY));
}

/** The Investigation progress at which an Investigation always completes. */
export function progressToCertainCompletion(difficulty: number): number {
  return difficulty * SKILL_POINTS_PER_DIFFICULTY;
}
