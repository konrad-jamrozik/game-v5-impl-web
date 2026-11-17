/**
 * COMBAT: how one Combat is fought. A Combat is a function of its two sides, their current values, the GDR values,
 * and its named random outcomes, and of nothing else; see COMBAT, Combat inputs and outputs.
 */
import { EngineDefect, q, ratio, roundDown, roundUp, toStored } from '../../../kernel/index.ts';
import type { AgentParametersGdr, CombatParametersGdr } from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import type {
  AttackRecord,
  CombatOutcome,
  CombatParticipantReport,
  CombatReport,
  CombatantCondition,
} from '../../state/types.ts';
import { clampExhaustion, effectiveSkill } from '../agents/agents.ts';

/** The values of a Combatant that a Combat reads and changes. */
export interface CombatantState {
  readonly skill: number;
  currentHealth: number;
  readonly baseHealth: number;
  exhaustion: number;
  readonly weaponDamage: number;
}

export interface Combatant {
  readonly id: string;
  readonly state: CombatantState;
}

/**
 * COMBAT, Incapacitation condition: alive and either effective skill ≤ incapacitation_skill_fraction × skill (the
 * skill clause) or exhaustion ≥ exhaustion_incapacitation (the exhaustion clause).
 */
export function meetsIncapacitationCondition(
  combatant: CombatantState,
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): boolean {
  return (
    combatant.currentHealth > 0 &&
    (combatant.exhaustion >= agentParameters.exhaustionIncapacitation ||
      q(effectiveSkill(combatant, agentParameters)).lte(
        combat.incapacitationSkillFraction.mul(combatant.skill),
      ))
  );
}

/** Able to fight outside a Combat: alive and not meeting the incapacitation condition. */
export function isAbleToFight(
  combatant: CombatantState,
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): boolean {
  return combatant.currentHealth > 0 && !meetsIncapacitationCondition(combatant, combat, agentParameters);
}

/** COMBAT, Combat rating of a side: the sum of the effective skill of its Combatants able to fight. */
export function combatRating(
  side: readonly CombatantState[],
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): number {
  let total = 0;
  for (const combatant of side) {
    if (isAbleToFight(combatant, combat, agentParameters)) {
      total += effectiveSkill(combatant, agentParameters);
    }
  }
  return total;
}

/** COMBAT, Damage outcome: the inclusive bounds of the damage of a hit by a Combatant with weapon damage w. */
export function damageBounds(weaponDamage: number, combat: CombatParametersGdr): { lo: number; hi: number } {
  return {
    lo: roundUp(q(weaponDamage).mul(q(1).sub(combat.weaponDamageRange))),
    hi: roundDown(q(weaponDamage).mul(q(1).add(combat.weaponDamageRange))),
  };
}

interface Fighter {
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  readonly state: CombatantState;
  /** The Combat-only property; see COMBAT, Combat-only properties. */
  incapacitated: boolean;
  damageDealt: number;
  damageTaken: number;
  readonly report: CombatParticipantReport;
}

/**
 * Fights one Combat to its end. It changes the current health and exhaustion of the Combatants it is given and
 * returns the Combat report; an Agent whose final condition is dead is Killed, which the caller records.
 */
export function fightCombat(input: {
  missionId: string;
  agents: readonly Combatant[];
  enemies: readonly Combatant[];
  combat: CombatParametersGdr;
  agentParameters: AgentParametersGdr;
  random: Random;
}): CombatReport {
  const { combat, agentParameters, random } = input;
  const ids = [...input.agents, ...input.enemies].map((combatant) => combatant.id);
  if (input.agents.length === 0 || new Set(ids).size !== ids.length) {
    throw new EngineDefect('A Combat needs at least one Agent and no Combatant twice');
  }

  const eff = (fighter: Fighter): number => effectiveSkill(fighter.state, agentParameters);
  const able = (fighter: Fighter): boolean => fighter.state.currentHealth > 0 && !fighter.incapacitated;

  // Combat start, step 1 and 2.
  const enter = (combatant: Combatant, side: 'agent' | 'enemy'): Fighter => {
    const incapacitated = meetsIncapacitationCondition(combatant.state, combat, agentParameters);
    const effective = effectiveSkill(combatant.state, agentParameters);
    return {
      id: combatant.id,
      side,
      state: combatant.state,
      incapacitated,
      damageDealt: 0,
      damageTaken: 0,
      report: {
        id: combatant.id,
        side,
        start: {
          skill: combatant.state.skill,
          currentHealth: combatant.state.currentHealth,
          baseHealth: combatant.state.baseHealth,
          exhaustion: combatant.state.exhaustion,
          weaponDamage: combatant.state.weaponDamage,
          effectiveSkill: effective,
          incapacitated,
        },
        final: {
          currentHealth: combatant.state.currentHealth,
          exhaustion: combatant.state.exhaustion,
          effectiveSkill: effective,
          condition: 'ableToFight',
        },
        damageDealt: 0,
        damageTaken: 0,
      },
    };
  };
  const agents = input.agents.map((combatant) => enter(combatant, 'agent'));
  const enemies = input.enemies.map((combatant) => enter(combatant, 'enemy'));

  const rating = (side: readonly Fighter[]): number =>
    side.reduce((sum, fighter) => (able(fighter) ? sum + eff(fighter) : sum), 0);
  const ratings = [{ round: 0, agents: rating(agents), enemies: rating(enemies) }];
  const startRating = rating(agents);
  const log: AttackRecord[] = [];

  /** Killed and Incapacitated: returns whether the evaluation made the Combatant Incapacitated. */
  const evaluate = (fighter: Fighter): boolean => {
    if (fighter.state.currentHealth === 0) {
      fighter.incapacitated = false;
      return false;
    }
    if (!fighter.incapacitated && meetsIncapacitationCondition(fighter.state, combat, agentParameters)) {
      fighter.incapacitated = true;
      return true;
    }
    return false;
  };

  /** Target selection: the opponent able to fight with the highest effective skill; ties go to the earliest. */
  const selectTarget = (opponents: readonly Fighter[]): Fighter | null => {
    let target: Fighter | null = null;
    let best = -1;
    for (const opponent of opponents) {
      if (able(opponent)) {
        const value = eff(opponent);
        if (value > best) {
          target = opponent;
          best = value;
        }
      }
    }
    return target;
  };

  const attack = (round: number, attacker: Fighter, defender: Fighter): void => {
    const a = eff(attacker);
    const d = eff(defender);
    const aSquared = BigInt(a) * BigInt(a);
    const sum = aSquared + BigInt(d) * BigInt(d);
    const hit = random.chance(`combat.hit.${attacker.id}`, ratio(aSquared, sum));
    let damage: number | null = null;
    let healthRemoved = 0;
    if (hit) {
      const bounds = damageBounds(attacker.state.weaponDamage, combat);
      damage = random.uniform(`combat.damage.${attacker.id}`, bounds.lo, bounds.hi);
      healthRemoved = Math.min(damage, defender.state.currentHealth);
      defender.state.currentHealth -= healthRemoved;
    }
    // COMBAT, Effects of an attack, step 4: no upper clamp applies.
    attacker.state.exhaustion = clampExhaustion(
      attacker.state.exhaustion + agentParameters.exhaustionPerAttack,
    );
    defender.state.exhaustion = clampExhaustion(
      defender.state.exhaustion + agentParameters.exhaustionPerDefense,
    );
    attacker.damageDealt += healthRemoved;
    defender.damageTaken += healthRemoved;
    const defenderIncapacitated = evaluate(defender);
    const attackerIncapacitated = evaluate(attacker);
    log.push({
      round,
      attacker: attacker.id,
      defender: defender.id,
      a,
      d,
      hitProbability: { n: toStored(aSquared), d: toStored(sum) },
      hit,
      damage,
      healthRemoved,
      attackerAfter: { currentHealth: attacker.state.currentHealth, exhaustion: attacker.state.exhaustion },
      defenderAfter: { currentHealth: defender.state.currentHealth, exhaustion: defender.state.exhaustion },
      defenderDead: defender.state.currentHealth === 0,
      defenderIncapacitated,
      attackerIncapacitated,
    });
  };

  const anyAble = (side: readonly Fighter[]): boolean => side.some(able);

  // Combat start, step 3.
  let outcome: CombatOutcome | null = null;
  let rounds = 0;
  if (!anyAble(enemies)) {
    outcome = 'Prevailed';
  } else if (!anyAble(agents)) {
    outcome = 'Wiped';
  }

  const bound = (agents.length + enemies.length) * Math.max(1, agentParameters.exhaustionIncapacitation) + 1;
  while (outcome === null) {
    rounds += 1;
    if (rounds > bound) {
      throw new EngineDefect('A Combat did not end within its bound of Combat rounds');
    }
    for (const agent of agents) {
      if (able(agent)) {
        const target = selectTarget(enemies);
        if (target !== null) {
          attack(rounds, agent, target);
        }
      }
    }
    for (const enemy of enemies) {
      if (able(enemy)) {
        const target = selectTarget(agents);
        if (target !== null) {
          attack(rounds, enemy, target);
        }
      }
    }
    // End-of-Combat-round checks, in order.
    const agentsRating = rating(agents);
    const enemiesRating = rating(enemies);
    ratings.push({ round: rounds, agents: agentsRating, enemies: enemiesRating });
    if (!anyAble(enemies)) {
      outcome = 'Prevailed';
    } else if (!anyAble(agents)) {
      outcome = 'Wiped';
    } else if (
      q(agentsRating).lt(combat.retreatBelowAgentRatingFraction.mul(startRating)) &&
      q(enemiesRating).gte(combat.retreatAtEnemyToAgentRating.mul(agentsRating))
    ) {
      outcome = 'Retreated';
    }
  }

  const finish = (fighter: Fighter): CombatParticipantReport => {
    const condition: CombatantCondition =
      fighter.state.currentHealth === 0 ? 'dead' : fighter.incapacitated ? 'incapacitated' : 'ableToFight';
    return {
      ...fighter.report,
      final: {
        currentHealth: fighter.state.currentHealth,
        exhaustion: fighter.state.exhaustion,
        effectiveSkill: eff(fighter),
        condition,
      },
      damageDealt: fighter.damageDealt,
      damageTaken: fighter.damageTaken,
    };
  };

  return {
    mission: input.missionId,
    outcome,
    rounds,
    agents: agents.map((fighter) => fighter.id),
    enemies: enemies.map((fighter) => fighter.id),
    participants: [...agents, ...enemies].map(finish),
    ratings,
    log,
  };
}
