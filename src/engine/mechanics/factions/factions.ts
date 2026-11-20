/**
 * FACTION (Factions): initial Factions, Escalation, Faction operation occurrence generation, and Elimination. Every
 * function receives one Faction, the GDRs it reads, and the random source; see DEC-003.
 */
import { must } from '../../../kernel/index.ts';
import type { FactionActivityLevelGdr, FactionArchetypeGdr } from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import type { Faction, FactionState } from '../../state/types.ts';

type Levels = (id: string) => FactionActivityLevelGdr;

/** FACTION, Level duration: a uniform whole-number outcome over `lasts_turns` of the level entered. */
function levelDuration(random: Random, factionId: string, level: FactionActivityLevelGdr): number | null {
  if (level.lastsTurns === null) {
    return null;
  }
  return random.uniform(`faction.${factionId}.levelDuration`, level.lastsTurns[0], level.lastsTurns[1]);
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

/** FACTION, Initial Factions. */
export function createFaction(
  id: string,
  archetype: FactionArchetypeGdr,
  levels: Levels,
  random: Random,
): Faction {
  const level = levels(archetype.initialActivityLevel);
  return {
    id,
    archetype: archetype.id,
    constants: {},
    state: {
      activityLevel: level.id,
      turnsUntilNextLevel: levelDuration(random, id, level),
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
      const next = levels(
        must(levels(faction.activityLevel).next, 'next level of a level that has a duration'),
      );
      faction.activityLevel = next.id;
      faction.turnsUntilNextLevel = levelDuration(random, factionId, next);
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

/** FACTION, Elimination: permanent; applying it to a Eliminated Faction changes nothing. */
export function eliminateFaction(faction: FactionState, turn: number): void {
  if (!faction.eliminated) {
    faction.eliminated = true;
    faction.eliminatedTurn = turn;
  }
}
