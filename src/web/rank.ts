/**
 * GUI, Ranks: the Rank of an Agent, taken from its base skill rounded down, so that it does not change as the Agent is
 * worn down. Pure presentation: the Ranks are Display content, read by no rule.
 */

/** GUI, Ranks: the Rank insignia, the mark of a Rank. */
export interface RankInsignia {
  readonly kind: 'chevron' | 'bar' | 'star';
  readonly count: 1 | 2 | 3;
}

/** GUI, Ranks: a Rank GDR, as the game data reports it. */
export interface RankThreshold {
  readonly name: string;
  readonly abbreviation: string;
  readonly minBaseSkill: number;
  readonly mark: RankInsignia['kind'] | null;
  readonly count: RankInsignia['count'] | null;
}

/** GUI, Ranks: a Rank as the GUI shows it, its `name` and its Rank insignia, or null for a Rank without one. */
export interface Rank {
  readonly name: string;
  readonly abbreviation: string;
  readonly insignia: RankInsignia | null;
}

/**
 * GUI, Ranks: the Rank of an Agent with this base skill, rounded down: that of the Rank with the highest
 * `min_base_skill` it reaches, or null when it reaches none, and the GUI then shows nothing in its place.
 */
export function rankOf(baseSkillHundredths: number, ranks: readonly RankThreshold[]): Rank | null {
  const skill = Math.floor(baseSkillHundredths / 100);
  const reached = ranks
    .filter((rank) => skill >= rank.minBaseSkill)
    .sort((a, b) => b.minBaseSkill - a.minBaseSkill)[0];
  if (reached === undefined) {
    return null;
  }
  const insignia =
    reached.mark === null || reached.count === null ? null : { kind: reached.mark, count: reached.count };
  return { name: reached.name, abbreviation: reached.abbreviation, insignia };
}

/** CRPLAY, Rank on the Battlefield: the Rank insignia of the Rank this base skill earns, or null for none. */
export function rankInsignia(
  baseSkillHundredths: number,
  ranks: readonly RankThreshold[],
): RankInsignia | null {
  return rankOf(baseSkillHundredths, ranks)?.insignia ?? null;
}
