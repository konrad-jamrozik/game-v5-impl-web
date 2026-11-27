/**
 * FACTION (Factions): initial Factions, Escalation, Faction operation occurrence generation, and Elimination. Every
 * function receives one Faction, the GDRs it reads, and the random source.
 */
import { must } from '../../../kernel/index.ts';
import type {
  FactionActivityLevelGdr,
  FactionArchetypeGdr,
  FactionOperationLevelGdr,
} from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import type { Faction, FactionState, MissionSite } from '../../state/types.ts';

type Levels = (id: string) => FactionActivityLevelGdr;

/**
 * FACTION, Level duration: a uniform whole-number outcome over `lasts_turns` of the level entered, or, on entering the
 * first level, whose `lasts_turns` is `per_faction`, over the FactionArchetype's `initial_lasts_turns`. Faction GDR
 * validation keeps every move out of the first level, so only creation passes `perFaction`. The value may be 0, which
 * makes the Faction skip the level.
 */
function levelDuration(
  random: Random,
  factionId: string,
  level: FactionActivityLevelGdr,
  perFaction: readonly [number, number] | null = null,
): number | null {
  if (level.lastsTurns === null) {
    return null;
  }
  const range =
    level.lastsTurns === 'per_faction'
      ? must(perFaction, 'initial_lasts_turns of a Faction starting at a per_faction level')
      : level.lastsTurns;
  return random.uniform(`faction.${factionId}.levelDuration`, range[0], range[1]);
}

/**
 * FACTION, Operation interval: a uniform whole-number outcome over `operation_every_turns`. No outcome exists for a
 * level without operations, whose `operation_every_turns` is `null`.
 */
function operationInterval(random: Random, factionId: string, level: FactionActivityLevelGdr): number | null {
  if (level.operationEveryTurns === null) {
    return null;
  }
  return random.uniform(
    `faction.${factionId}.operationInterval`,
    level.operationEveryTurns[0],
    level.operationEveryTurns[1],
  );
}

/**
 * FACTION, Escalation and Initial Factions: enters `level` with a Level duration outcome and, while that outcome is 0,
 * skips the level and enters its `next`, each with an outcome of its own. Returns the level the Faction stops at and
 * its last outcome, which is at least 1, or `null` for a final level. The loop ends because FACTION,
 * FactionActivityLevel makes every `next` chain reach a final level.
 */
function enterLevel(
  random: Random,
  factionId: string,
  first: FactionActivityLevelGdr,
  levels: Levels,
  perFaction: readonly [number, number] | null = null,
): { level: FactionActivityLevelGdr; duration: number | null } {
  let level = first;
  let duration = levelDuration(random, factionId, level, perFaction);
  while (duration === 0) {
    level = levels(must(level.next, 'next level of a level that has a duration'));
    duration = levelDuration(random, factionId, level);
  }
  return { level, duration };
}

/**
 * FACTION, Initial Factions: every Faction enters the first level, over its FactionArchetype's `initial_lasts_turns`,
 * and skips on while its Level duration outcome is 0.
 */
export function createFaction(
  id: string,
  archetype: FactionArchetypeGdr,
  firstLevel: FactionActivityLevelGdr,
  levels: Levels,
  random: Random,
): Faction {
  const { level, duration } = enterLevel(random, id, firstLevel, levels, archetype.initialLastsTurns);
  return {
    id,
    archetype: archetype.id,
    constants: {},
    state: {
      activityLevel: level.id,
      turnsUntilNextLevel: duration,
      turnsUntilNextOperation: operationInterval(random, id, level),
      eliminated: false,
      eliminatedTurn: null,
    },
  };
}

/** The facts of one Faction operation occurrence; see FACTION, Faction operation occurrence generation. */
export interface FactionOperationOccurrence {
  readonly initiatingFaction: string;
  /** The `level` of its FactionOperationLevel. */
  readonly operationLevel: number;
  readonly turn: number;
}

/**
 * FACTION, Faction activity: Escalation and then Faction operation occurrence generation for one Faction whose
 * Eliminated is no. Changes the Faction's State and returns the occurrence, if one happens.
 *
 * A move to a level without operations makes Turns until the next operation absent; a move from such a level to one
 * with operations, i.e. the Faction waking, draws it, and a Faction that wakes in this step does not count it down in
 * the same step. A move between two levels that both have operations leaves it unchanged.
 */
export function applyFactionActivity(
  factionId: string,
  faction: FactionState,
  turn: number,
  levels: Levels,
  random: Random,
): FactionOperationOccurrence | null {
  if (faction.eliminated) {
    return null;
  }
  let woke = false;
  if (faction.turnsUntilNextLevel !== null) {
    faction.turnsUntilNextLevel -= 1;
    if (faction.turnsUntilNextLevel === 0) {
      // One move enters one level, or several when it skips levels whose Level duration outcome is 0.
      const { level: next, duration } = enterLevel(
        random,
        factionId,
        levels(must(levels(faction.activityLevel).next, 'next level of a level that has a duration')),
        levels,
      );
      faction.activityLevel = next.id;
      faction.turnsUntilNextLevel = duration;
      if (next.operationEveryTurns === null) {
        faction.turnsUntilNextOperation = null;
      } else if (faction.turnsUntilNextOperation === null) {
        faction.turnsUntilNextOperation = operationInterval(random, factionId, next);
        woke = true;
      }
    }
  }
  if (faction.turnsUntilNextOperation === null || woke) {
    return null;
  }
  faction.turnsUntilNextOperation -= 1;
  if (faction.turnsUntilNextOperation !== 0) {
    return null;
  }
  const level = levels(faction.activityLevel);
  const operationLevel = Number(
    random.weighted(
      `faction.${factionId}.operationLevel`,
      level.operationLevelWeights.map(([key, weight]) => [String(key), weight]),
    ),
  );
  faction.turnsUntilNextOperation = must(
    operationInterval(random, factionId, level),
    'Operation interval of a level with operations',
  );
  return { initiatingFaction: factionId, operationLevel, turn };
}

/**
 * FACTION, Operation level spacing: the FactionOperationLevel an occurrence of `rolled` in `turn` has. While the level
 * has a `min_turns_between` M and a kept Response Mission site of an earlier occurrence of it, of any Faction, was
 * created in a turn after `turn` − M, the occurrence moves to the next lower level; the lowest level never moves.
 */
export function spacedOperationLevel(
  rolled: FactionOperationLevelGdr,
  turn: number,
  levels: readonly FactionOperationLevelGdr[],
  missionSites: Readonly<Record<string, MissionSite>>,
): FactionOperationLevelGdr {
  let level = rolled;
  for (;;) {
    const spacing = level.minTurnsBetween;
    if (spacing === null) {
      return level;
    }
    const id = level.id;
    const recent = Object.values(missionSites).some(
      (site) =>
        site.constants.origin.kind === 'FactionOperation' &&
        site.constants.origin.operationLevel === id &&
        site.constants.turnCreated > turn - spacing,
    );
    if (!recent) {
      return level;
    }
    const lower = levels.filter((item) => item.level < level.level).sort((a, b) => b.level - a.level)[0];
    if (lower === undefined) {
      return level;
    }
    level = lower;
  }
}

/** FACTION, Elimination: permanent; applying it to a Eliminated Faction changes nothing. */
export function eliminateFaction(faction: FactionState, turn: number): void {
  if (!faction.eliminated) {
    faction.eliminated = true;
    faction.eliminatedTurn = turn;
  }
}
