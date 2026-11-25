/**
 * GUI, Enemy labels: the name by which the GUI shows an Enemy, the `name` of its EnemyArchetype in lower case with
 * each space replaced by a hyphen, then a hyphen and its number among the Enemies of that EnemyArchetype at its Mission
 * site, counted from 1 in the Mission site's list of Enemies; and, only beside a figure of the Combat replay, the short
 * Enemy label, by the EnemyArchetype's `abbreviation`. Pure presentation; no gameplay rule.
 */

/** An Enemy of a Mission site's list of Enemies, in that list's order. */
export interface LabelledEnemy {
  readonly id: string;
  readonly archetype: string;
  readonly archetypeAbbreviation: string;
  readonly archetypeName: string;
}

/** The Enemy label of every Enemy of one Mission site, keyed by its Instance ID, e.g. enemy-19 → initiate-1. */
export function enemyLabels(enemies: readonly LabelledEnemy[]): ReadonlyMap<string, string> {
  return labelsBy(enemies, (enemy) => enemy.archetypeName.toLowerCase().replaceAll(' ', '-'));
}

/**
 * GUI, Enemy labels: the short Enemy label of every Enemy of one Mission site, used only beside a figure of the Combat
 * replay, e.g. enemy-19 → init-1.
 */
export function shortEnemyLabels(enemies: readonly LabelledEnemy[]): ReadonlyMap<string, string> {
  return labelsBy(enemies, (enemy) => enemy.archetypeAbbreviation);
}

function labelsBy<E extends LabelledEnemy>(
  enemies: readonly E[],
  stem: (enemy: E) => string,
): Map<string, string> {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const enemy of enemies) {
    const number = (counts.get(enemy.archetype) ?? 0) + 1;
    counts.set(enemy.archetype, number);
    labels.set(enemy.id, `${stem(enemy)}-${number}`);
  }
  return labels;
}
