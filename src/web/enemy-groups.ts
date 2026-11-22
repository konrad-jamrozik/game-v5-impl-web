/**
 * MVIEW, Selected Mission site: a Mission site's Enemies counted by EnemyArchetype, one line each, in ascending order
 * of one Enemy's Combat rating, and those of equal Combat rating in the EnemyArchetype order of GUI, EnemyArchetype
 * order: the authored order of the EnemyArchetype GDR file.
 */

export interface EnemyGroup {
  readonly archetype: string;
  readonly count: number;
  /** The Combat rating of one Enemy of the group; Enemies of one EnemyArchetype have equal values until a Combat. */
  readonly combatRating: number;
  /** The line as the Player reads it, e.g. "17 Initiates · 80 CR each" or "1 Commander · 300 CR". */
  readonly text: string;
}

/**
 * Groups `enemies` by EnemyArchetype. `archetypeOrder` lists the EnemyArchetype IDs in their GDR file order; an
 * EnemyArchetype missing from it comes after those in it.
 */
export function enemyGroups(
  enemies: readonly {
    readonly archetype: string;
    readonly archetypeName: string;
    readonly combatRating: number;
  }[],
  archetypeOrder: readonly string[],
): EnemyGroup[] {
  const groups = new Map<string, { name: string; count: number; combatRating: number }>();
  for (const enemy of enemies) {
    const group = groups.get(enemy.archetype);
    if (group === undefined) {
      groups.set(enemy.archetype, { name: enemy.archetypeName, count: 1, combatRating: enemy.combatRating });
    } else {
      group.count += 1;
    }
  }
  const rank = (archetype: string) => {
    const at = archetypeOrder.indexOf(archetype);
    return at < 0 ? archetypeOrder.length : at;
  };
  return [...groups.entries()]
    .sort(([a, x], [b, y]) => x.combatRating - y.combatRating || rank(a) - rank(b))
    .map(([archetype, group]) => ({
      archetype,
      count: group.count,
      combatRating: group.combatRating,
      text:
        group.count === 1
          ? `1 ${group.name} · ${group.combatRating} CR`
          : `${group.count} ${group.name}s · ${group.combatRating} CR each`,
    }));
}
