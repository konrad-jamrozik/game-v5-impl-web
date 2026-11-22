/**
 * MVIEW, Deployment: the share that the checked Agents' Combat rating is of the Enemies' one, as a whole percentage
 * rounded down, coloured by how the team measures up.
 */

/** The colour class of each band, under VIS, Colours. */
export type ShareTone = 'tone-bad' | 'tone-accent' | 'tone-warning' | 'tone-good' | 'tone-good-bright';

export interface CombatShare {
  readonly percent: number;
  readonly tone: ShareTone;
}

/**
 * MVIEW, Deployment: Danger below 95%, Accent text from 95% to 99%, Warning from 100% to 104%, Positive from 105% to
 * 109%, and Positive bright from 110%; null while the Enemies' Combat rating is 0, when the share is left out.
 */
export function combatShare(team: number, enemies: number): CombatShare | null {
  if (enemies <= 0) {
    return null;
  }
  // Both are whole numbers, so the whole percentage rounded down is exact in integer arithmetic.
  const percent = Math.floor((team * 100) / enemies);
  const tone: ShareTone =
    percent < 95
      ? 'tone-bad'
      : percent < 100
        ? 'tone-accent'
        : percent < 105
          ? 'tone-warning'
          : percent < 110
            ? 'tone-good'
            : 'tone-good-bright';
  return { percent, tone };
}
