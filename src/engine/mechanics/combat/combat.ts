/**
 * COMBAT: how one Combat is fought. A Combat is a function of its two sides, their current values, the GDR values,
 * and its named random outcomes, and of nothing else; see COMBAT, Combat inputs and outputs.
 *
 * COMBAT, Fighting a Combat, and REUSE, Shared implementation: `fightCombat` is the one implementation of Fighting a
 * Combat. Exactly two callers have a Combat fought with it: the Mission resolution step (TURN, `applyAdvanceTurn`), which
 * builds its inputs from the World state and applies its outputs, and `developer.tools.fightCombat(setup)`
 * (`detached-combat.ts`), which builds its inputs from its setup, derives its random outcomes from the Detached seed,
 * and returns its outputs.
 */
import {
  EngineDefect,
  fromHundredths,
  q,
  ratio,
  roundDown,
  roundUp,
  toStored,
} from '../../../kernel/index.ts';
import type { AgentParametersGdr, CombatParametersGdr } from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import type {
  AgentState,
  AttackRecord,
  CombatOutcome,
  CombatParticipantReport,
  CombatReport,
  CombatantCondition,
  EnemyState,
} from '../../state/types.ts';
import {
  agentCombatantValues,
  clampExhaustion,
  effectiveSkill,
  effectiveWeaponDamage,
  enemyCombatantValues,
  exhaustionOf,
  type AgentUpgradeBonus,
} from '../agents/agents.ts';

/**
 * The values of a Combatant that a Combat reads and changes, in the form of an Agent: base skill, current
 * health, and Exact exhaustion in hundredths, under NUMBERS, Decimal quantities, with the effective values. An Agent's
 * current health and Exact exhaustion are written back to its health lost and Exact exhaustion after the Combat; an
 * Enemy's whole values are multiplied by 100 before the Combat and divided back after it, which is exact because
 * every change a Combat makes is a whole number of points; see DEC-056.
 */
export interface CombatantState {
  readonly skillHundredths: number;
  currentHealthHundredths: number;
  /** The effective max health. */
  readonly maxHealth: number;
  exactExhaustionHundredths: number;
  /** The effective weapon damage. */
  readonly weaponDamage: number;
}

export interface Combatant {
  readonly id: string;
  readonly state: CombatantState;
}

/**
 * COMBAT, Combat inputs and outputs, item 3: an Agent's current values as a Combat reads them, with its effective max
 * health, current health, and effective weapon damage.
 */
export function agentCombatantState(agent: AgentState, bonus: AgentUpgradeBonus): CombatantState {
  return { ...agentCombatantValues(agent, bonus), weaponDamage: effectiveWeaponDamage(agent, bonus) };
}

/**
 * COMBAT, Combat inputs and outputs, item 3: an Enemy's current values in the hundredths form of an Agent; its whole
 * values are written back after the Combat; see DEC-056.
 */
export function enemyCombatantState(enemy: EnemyState): CombatantState {
  return { ...enemyCombatantValues(enemy), weaponDamage: enemy.baseWeaponDamage };
}

/** COMBAT, Combat inputs and outputs: every input of a Combat other than its random outcomes. */
export interface CombatInputs {
  /** The Agents' side, in its fixed order. */
  readonly agents: readonly Combatant[];
  /** The Enemies' side, in its fixed order. */
  readonly enemies: readonly Combatant[];
  readonly combat: CombatParametersGdr;
  readonly agentParameters: AgentParametersGdr;
}

/**
 * COMBAT, Combat report: every fact of the Combat report but the Mission, which influences nothing in the Combat and
 * which the Mission resolution step supplies.
 */
export type FoughtCombatReport = Omit<CombatReport, 'mission'>;

/** COMBAT, Combat inputs and outputs: the outputs of a Combat. */
export interface CombatOutputs {
  readonly report: FoughtCombatReport;
  /** The final values of the Agents' side, in its fixed order: the changed current health and Exact exhaustion. */
  readonly agents: readonly CombatantState[];
  /** The final values of the Enemies' side, in its fixed order. */
  readonly enemies: readonly CombatantState[];
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
    combatant.currentHealthHundredths > 0 &&
    (exhaustionOf(combatant) >= agentParameters.exhaustionIncapacitation ||
      q(effectiveSkill(combatant, agentParameters)).lte(
        combat.incapacitationSkillFraction.mul(fromHundredths(combatant.skillHundredths)),
      ))
  );
}

/** Able to fight outside a Combat: alive and not meeting the incapacitation condition. */
export function isAbleToFight(
  combatant: CombatantState,
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): boolean {
  return (
    combatant.currentHealthHundredths > 0 && !meetsIncapacitationCondition(combatant, combat, agentParameters)
  );
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
  damageDealtHundredths: number;
  damageTakenHundredths: number;
  /** COMBAT, Combat experience: counted for an Agent only. */
  combatExperience: number;
  readonly report: CombatParticipantReport;
}

/**
 * COMBAT, Fighting a Combat: fights one Combat to its end, from its inputs and the random source of its random
 * outcomes, and returns its outputs. It changes nothing it is given: applying the outputs belongs to the caller, e.g.
 * writing back the final current health and exhaustion, and recording an Agent whose final condition is dead as Killed.
 */
export function fightCombat(input: CombatInputs, random: Random): CombatOutputs {
  const { combat, agentParameters } = input;
  const ids = [...input.agents, ...input.enemies].map((combatant) => combatant.id);
  if (input.agents.length === 0 || new Set(ids).size !== ids.length) {
    throw new EngineDefect('A Combat needs at least one Agent and no Combatant twice');
  }

  const eff = (fighter: Fighter): number => effectiveSkill(fighter.state, agentParameters);
  const able = (fighter: Fighter): boolean =>
    fighter.state.currentHealthHundredths > 0 && !fighter.incapacitated;

  // Combat start, step 1 and 2. Each Combatant fights on its own copy of its values, so the inputs stay unchanged.
  const enter = (combatant: Combatant, side: 'agent' | 'enemy'): Fighter => {
    const incapacitated = meetsIncapacitationCondition(combatant.state, combat, agentParameters);
    const effective = effectiveSkill(combatant.state, agentParameters);
    return {
      id: combatant.id,
      side,
      state: { ...combatant.state },
      incapacitated,
      damageDealtHundredths: 0,
      damageTakenHundredths: 0,
      combatExperience: 0,
      report: {
        id: combatant.id,
        side,
        start: {
          skillHundredths: combatant.state.skillHundredths,
          currentHealthHundredths: combatant.state.currentHealthHundredths,
          maxHealth: combatant.state.maxHealth,
          exhaustion: exhaustionOf(combatant.state),
          weaponDamage: combatant.state.weaponDamage,
          effectiveSkill: effective,
          incapacitated,
        },
        final: {
          currentHealthHundredths: combatant.state.currentHealthHundredths,
          exhaustion: exhaustionOf(combatant.state),
          effectiveSkill: effective,
          condition: 'ableToFight',
        },
        damageDealtHundredths: 0,
        damageTakenHundredths: 0,
        combatExperience: side === 'agent' ? 0 : null,
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
    if (fighter.state.currentHealthHundredths === 0) {
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
    let healthRemovedHundredths = 0;
    if (hit) {
      const bounds = damageBounds(attacker.state.weaponDamage, combat);
      damage = random.uniform(`combat.damage.${attacker.id}`, bounds.lo, bounds.hi);
      // E.g., a damage outcome of 10 against an Agent with current health 5.60 removes 5.60.
      healthRemovedHundredths = Math.min(damage * 100, defender.state.currentHealthHundredths);
      defender.state.currentHealthHundredths -= healthRemovedHundredths;
    }
    // COMBAT, Effects of an attack, step 4: no upper clamp applies; AGENT, Exhaustion and Exact exhaustion,
    // statement 2: a whole gain of exhaustion raises Exact exhaustion by the same amount.
    attacker.state.exactExhaustionHundredths = clampExhaustion(
      attacker.state.exactExhaustionHundredths + agentParameters.exhaustionPerAttack * 100,
    );
    defender.state.exactExhaustionHundredths = clampExhaustion(
      defender.state.exactExhaustionHundredths + agentParameters.exhaustionPerDefense * 100,
    );
    attacker.damageDealtHundredths += healthRemovedHundredths;
    defender.damageTakenHundredths += healthRemovedHundredths;
    // COMBAT, Combat experience: every attack counts for an Agent attacker or defender, whatever it removed.
    if (attacker.side === 'agent') {
      attacker.combatExperience += hit
        ? agentParameters.experiencePerAttackHit
        : agentParameters.experiencePerAttackMiss;
    }
    if (defender.side === 'agent') {
      defender.combatExperience += hit
        ? agentParameters.experiencePerDefenseHit
        : agentParameters.experiencePerDefenseMiss;
    }
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
      healthRemovedHundredths,
      attackerAfter: {
        currentHealthHundredths: attacker.state.currentHealthHundredths,
        exhaustion: exhaustionOf(attacker.state),
      },
      defenderAfter: {
        currentHealthHundredths: defender.state.currentHealthHundredths,
        exhaustion: exhaustionOf(defender.state),
      },
      defenderDead: defender.state.currentHealthHundredths === 0,
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
      fighter.state.currentHealthHundredths === 0
        ? 'dead'
        : fighter.incapacitated
          ? 'incapacitated'
          : 'ableToFight';
    return {
      ...fighter.report,
      final: {
        currentHealthHundredths: fighter.state.currentHealthHundredths,
        exhaustion: exhaustionOf(fighter.state),
        effectiveSkill: eff(fighter),
        condition,
      },
      damageDealtHundredths: fighter.damageDealtHundredths,
      damageTakenHundredths: fighter.damageTakenHundredths,
      combatExperience: fighter.side === 'agent' ? fighter.combatExperience : null,
    };
  };

  return {
    report: {
      outcome,
      rounds,
      agents: agents.map((fighter) => fighter.id),
      enemies: enemies.map((fighter) => fighter.id),
      participants: [...agents, ...enemies].map(finish),
      ratings,
      log,
    },
    agents: agents.map((fighter) => ({ ...fighter.state })),
    enemies: enemies.map((fighter) => ({ ...fighter.state })),
  };
}
