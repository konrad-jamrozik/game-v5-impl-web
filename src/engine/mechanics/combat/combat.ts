/**
 * COMBAT: how one Combat is fought. A Combat is a function of its two sides, their current values, the GDR values,
 * and its named random outcomes, and of nothing else; see COMBAT, Combat inputs and outputs.
 *
 * COMBAT, Fighting a Combat, and REUSE, Shared implementation: `fight` is the one implementation of Fighting a Combat,
 * and building the Combat report is an option of it (COMBAT, Fighting a Combat, Recording). `fightCombat` calls it with
 * the option on and `fightCombatSummary` with it off; they differ in nothing else. Exactly three callers have a Combat
 * fought: the Mission resolution step (TURN, `applyAdvanceTurn`), which builds its inputs from the World state and
 * applies its outputs, and `developer.tools.fightCombat(setup)`, both with the Combat report; and
 * `developer.tools.fightCombatBatch(setup, count)`, without it. The two Developer tools (`detached-combat.ts`) build
 * their inputs from their setup, derive their random outcomes from the Detached seed, and return their outputs.
 */
import {
  EngineDefect,
  floorDivSafe,
  fromHundredths,
  must,
  q,
  ratio,
  roundDown,
  roundUp,
  toStored,
  type Rational,
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
  effectiveArmor,
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
  /**
   * The effective armor: the current armor the Combatant starts the Combat with. The current armor itself is a
   * Combat-only property, kept by the Combat and never written back; see COMBAT, Combat-only properties.
   */
  readonly armor: number;
}

export interface Combatant {
  readonly id: string;
  readonly state: CombatantState;
}

/**
 * COMBAT, Combat inputs and outputs, item 3: an Agent's current values as a Combat reads them, with its effective max
 * health, current health, effective weapon damage, and effective armor.
 */
export function agentCombatantState(agent: AgentState, bonus: AgentUpgradeBonus): CombatantState {
  return {
    ...agentCombatantValues(agent, bonus),
    weaponDamage: effectiveWeaponDamage(agent, bonus),
    armor: effectiveArmor(agent, bonus),
  };
}

/**
 * COMBAT, Combat inputs and outputs, item 3: an Enemy's current values in the hundredths form of an Agent; its whole
 * values are written back after the Combat; see DEC-056. Its effective armor is its base armor.
 */
export function enemyCombatantState(enemy: EnemyState): CombatantState {
  return { ...enemyCombatantValues(enemy), weaponDamage: enemy.baseWeaponDamage, armor: enemy.baseArmor };
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

/** COMBAT, Combat summary: how a Combat ended, which fighting it always produces. */
export interface CombatSummary {
  readonly outcome: CombatOutcome;
  /** The number of Agents that are dead when the Combat ends. */
  readonly agentsDead: number;
}

/** COMBAT, Combat inputs and outputs: the outputs of a Combat fought with its Combat report. */
export interface CombatOutputs {
  readonly summary: CombatSummary;
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

/** COMBAT, Combat rating: the base Combat rating of a side, the sum of the effective skill of its Combatants able to fight. */
export function baseCombatRating(
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

/**
 * COMBAT, Combat rating: the rating factor of a Combatant, half the sum of its attack term, effective weapon damage /
 * rating_base_weapon_damage, its health term, effective max health / rating_base_health, and its armor term, effective
 * armor / rating_base_armor, exact and never rounded. It reads the effective armor, never the current armor. Combat GDR
 * validation, rule 5, keeps every divisor at least 1.
 */
export function ratingFactor(combatant: CombatantState, combat: CombatParametersGdr): Rational {
  const attack = q(combatant.weaponDamage).div(combat.ratingBaseWeaponDamage);
  const health = q(combatant.maxHealth).div(combat.ratingBaseHealth);
  const armor = q(combatant.armor).div(combat.ratingBaseArmor);
  return attack.add(health).add(armor).div(2);
}

/** One Combatant able to fight, as the Combat rating of its side reads it. */
export interface RatedCombatant {
  readonly effectiveSkill: number;
  readonly state: CombatantState;
}

/**
 * COMBAT, Combat rating: ⌊n ^ (rating_team_size_exponent − 1) × S⌋, where S = Σ effective skill × rating factor over
 * the n Combatants able to fight, given here. The team size factor is in general irrational, so it is never computed:
 * with rating_team_size_exponent − 1 = p / q in lowest terms, the result is the largest whole R ≥ 0 with
 * R^q ≤ S^q × n^p, decided in whole numbers. A side with none has a Combat rating of 0.
 */
export function rateSide(members: readonly RatedCombatant[], combat: CombatParametersGdr): number {
  if (members.length === 0) {
    return 0;
  }
  const fast = rateSideInWholeNumbers(members, combat);
  if (fast !== null) {
    return fast;
  }
  let sum = q(0);
  for (const member of members) {
    sum = sum.add(q(member.effectiveSkill).mul(ratingFactor(member.state, combat)));
  }
  const exponent = combat.ratingTeamSizeExponent.sub(1);
  if (exponent.n === 0n) {
    return roundDown(sum);
  }
  const p = exponent.n;
  const qq = exponent.d;
  const right = sum.n ** qq * BigInt(members.length) ** p;
  const scale = sum.d ** qq;
  const fits = (r: bigint): boolean => r ** qq * scale <= right;
  // n ^ (p / q) ≤ n, because p / q ≤ 1, so the result lies from 0 to ⌊S⌋ × n + n.
  let lo = 0n;
  let hi = (sum.floor() + 1n) * BigInt(members.length) + 1n;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return toStored(lo);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * `rateSide` in ordinary whole numbers, exactly; null when a value leaves the safe-integer range or the parameters are
 * not whole, so that `rateSide` decides it with Rational and BigInt instead. With L the least common multiple of the
 * three rating bases, S = N / (2 × L), where N = Σ e × (w × L / bw + h × L / bh + a × L / ba) is a whole number. A
 * side of one has n^p = 1, so its rating is ⌊N / 2L⌋; a larger side takes the binary estimate of n^(p/q) × S and
 * corrects it until it is the largest R with (2L × R)^q ≤ N^q × n^p, decided in BigInt.
 */
function rateSideInWholeNumbers(
  members: readonly RatedCombatant[],
  combat: CombatParametersGdr,
): number | null {
  const bases = [combat.ratingBaseWeaponDamage, combat.ratingBaseHealth, combat.ratingBaseArmor];
  if (!bases.every((base) => Number.isSafeInteger(base) && base > 0)) {
    return null;
  }
  const [bw, bh, ba] = bases as [number, number, number];
  const l = [bw, bh, ba].reduce((acc, base) => (acc / gcd(acc, base)) * base, 1);
  let total = 0;
  for (const { effectiveSkill: e, state } of members) {
    const term = e * (state.weaponDamage * (l / bw) + state.maxHealth * (l / bh) + state.armor * (l / ba));
    total += term;
    if (!Number.isSafeInteger(term) || !Number.isSafeInteger(total)) {
      return null;
    }
  }
  const denominator = 2 * l;
  const exponent = combat.ratingTeamSizeExponent.sub(1);
  if (exponent.n === 0n || members.length === 1) {
    return floorDivSafe(total, denominator);
  }
  if (exponent.n < 0n) {
    return null;
  }
  const p = exponent.n;
  const qq = exponent.d;
  const n = BigInt(members.length);
  const right = BigInt(total) ** qq * n ** p;
  const fits = (r: number): boolean => r >= 0 && (BigInt(denominator) * BigInt(r)) ** qq <= right;
  let rating = Math.floor((members.length ** (Number(p) / Number(qq)) * total) / denominator);
  if (!Number.isSafeInteger(rating)) {
    return null;
  }
  while (rating > 0 && !fits(rating)) {
    rating -= 1;
  }
  while (fits(rating + 1)) {
    rating += 1;
  }
  return rating;
}

/** COMBAT, Combat rating of a side: its Combatants able to fight, each weighed by its rating factor, and its size. */
export function combatRating(
  side: readonly CombatantState[],
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): number {
  return rateSide(
    side
      .filter((combatant) => isAbleToFight(combatant, combat, agentParameters))
      .map((state) => ({ effectiveSkill: effectiveSkill(state, agentParameters), state })),
    combat,
  );
}

/** COMBAT, Damage outcome: the inclusive bounds of the damage of a hit by a Combatant with weapon damage w. */
export function damageBounds(weaponDamage: number, combat: CombatParametersGdr): { lo: number; hi: number } {
  return {
    lo: roundUp(q(weaponDamage).mul(q(1).sub(combat.weaponDamageRange))),
    hi: roundDown(q(weaponDamage).mul(q(1).add(combat.weaponDamageRange))),
  };
}

/**
 * COMBAT, Hit outcome: the hit chance of an attack by effective skill A on effective skill D, in thousandths,
 * min(999, max(1, round down(1000 × A² / (A² + D²)))). The hit outcome is a hit with the Probability hit chance / 1000,
 * and the hit chance is what the player is shown, e.g. 996 as "99.6%".
 */
export function hitChance(a: number, d: number): number {
  const aSquared = BigInt(a) * BigInt(a);
  const thousandths = roundDown(ratio(1000n * aSquared, aSquared + BigInt(d) * BigInt(d)));
  return Math.min(999, Math.max(1, thousandths));
}

interface Fighter {
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  readonly state: CombatantState;
  /**
   * The effective skill of `state`, kept current: it is computed again whenever an attack changes `state`, which is
   * the only thing that changes it in a Combat, so it always equals `effectiveSkill(state)`.
   */
  effective: number;
  /** The Combat-only properties; see COMBAT, Combat-only properties. */
  incapacitated: boolean;
  /**
   * Starts at the effective armor and only falls. Effective skill does not read it, so losing it changes neither
   * `effective` nor the Selection weights cached by effective skill.
   */
  currentArmor: number;
  damageDealtHundredths: number;
  damageTakenHundredths: number;
  /** COMBAT, Combat experience: counted for an Agent only. */
  combatExperience: number;
  readonly report: CombatParticipantReport;
}

/**
 * COMBAT, Fighting a Combat: fights one Combat to its end, from its inputs and the random source of its random
 * outcomes, and returns its outputs, with its Combat report. It changes nothing it is given: applying the outputs
 * belongs to the caller, e.g. writing back the final current health and exhaustion, and recording an Agent whose final
 * condition is dead as Killed.
 */
export function fightCombat(input: CombatInputs, random: Random): CombatOutputs {
  return must(fight(input, random, true).outputs, 'the outputs of a Combat fought with its Combat report');
}

/**
 * COMBAT, Fighting a Combat, Recording: fights one Combat exactly as `fightCombat` does, with the Combat report turned
 * off, and returns only its Combat summary.
 */
export function fightCombatSummary(input: CombatInputs, random: Random): CombatSummary {
  return fight(input, random, false).summary;
}

/**
 * The one implementation of Fighting a Combat. With `recordReport` off it builds neither the Combat log, the Combat
 * ratings, nor the participants' reports; every target selection, attack, random outcome, and Combat end check is the
 * same, because none of them reads what is recorded.
 */
function fight(
  input: CombatInputs,
  random: Random,
  recordReport: boolean,
): { summary: CombatSummary; outputs: CombatOutputs | null } {
  const { combat, agentParameters } = input;
  const ids = [...input.agents, ...input.enemies].map((combatant) => combatant.id);
  if (input.agents.length === 0 || new Set(ids).size !== ids.length) {
    throw new EngineDefect('A Combat needs at least one Agent and no Combatant twice');
  }

  const eff = (fighter: Fighter): number => fighter.effective;
  const refresh = (fighter: Fighter): void => {
    fighter.effective = effectiveSkill(fighter.state, agentParameters);
  };
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
      effective,
      incapacitated,
      // Combat start, step 1: every Combatant gains current armor, set to its effective armor.
      currentArmor: combatant.state.armor,
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
          armor: combatant.state.armor,
          effectiveSkill: effective,
          incapacitated,
        },
        final: {
          currentHealthHundredths: combatant.state.currentHealthHundredths,
          currentArmor: combatant.state.armor,
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

  // COMBAT, Combat rating: each Combatant able to fight weighed by its rating factor, which reads its effective values,
  // never its current armor, and the side by its size; Agents and Enemies alike.
  const rating = (side: readonly Fighter[]): number =>
    rateSide(
      side.filter(able).map((fighter) => ({ effectiveSkill: eff(fighter), state: fighter.state })),
      combat,
    );
  const startRating = rating(agents);
  const ratings = recordReport ? [{ round: 0, agents: startRating, enemies: rating(enemies) }] : [];
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

  /**
   * Target selection: the target outcome draws one candidate, i.e. an opponent able to fight, with the Probability of
   * its Selection weight over the sum of the Selection weights of all candidates. The Combat end checks after every
   * attack guarantee at least one candidate. With a single candidate the target is certain, so no value is drawn.
   */
  const selectTarget = (attacker: Fighter, opponents: readonly Fighter[]): Fighter => {
    const candidates = opponents.filter(able);
    const [only] = candidates;
    if (only === undefined) {
      throw new EngineDefect(`${attacker.id} has no opponent able to fight on its Combat turn`);
    }
    if (candidates.length === 1) {
      return only;
    }
    const entries = candidates.map(
      (candidate) => [candidate.id, selectionWeight(attacker, candidate)] as const,
    );
    const chosen = random.weighted(`combat.target.${attacker.id}`, entries);
    const target = candidates.find((candidate) => candidate.id === chosen);
    if (target === undefined) {
      throw new EngineDefect(`The target outcome of ${attacker.id} named no candidate`);
    }
    return target;
  };

  /**
   * COMBAT, Target selection: 1 for every candidate of an attacking Enemy; for an attacking Agent,
   * round up(hit-chance weight × usefulness), where the hit-chance weight is
   * target_base_weight − round down(|100 × target_preferred_hit_chance − hit chance / 10|) and the usefulness is
   * min(w, H) / w, with w the attacker's effective weapon damage and H the candidate's current health plus current
   * armor. Both are evaluated exactly and rounded once each.
   */
  const selectionWeight = (attacker: Fighter, candidate: Fighter): number => {
    if (attacker.side === 'enemy') {
      return 1;
    }
    const w = attacker.state.weaponDamage;
    // An Enemy's current health is a whole number of health points, so H is whole.
    const h = candidate.state.currentHealthHundredths / 100 + candidate.currentArmor;
    // The weight is a function of these four values alone, so each combination is evaluated once per Combat.
    const key = `${eff(attacker)}:${eff(candidate)}:${w}:${h}`;
    const known = weights.get(key);
    if (known !== undefined) {
      return known;
    }
    const chance = hitChance(eff(attacker), eff(candidate));
    const difference = combat.targetPreferredHitChance.mul(100).sub(ratio(chance, 10));
    const distance = difference.lt(0) ? difference.neg() : difference;
    const hitChanceWeight = combat.targetBaseWeight - roundDown(distance);
    const weight = roundUp(ratio(BigInt(hitChanceWeight) * BigInt(Math.min(w, h)), BigInt(w)));
    weights.set(key, weight);
    return weight;
  };
  const weights = new Map<string, number>();

  const attack = (round: number, attacker: Fighter, defender: Fighter): void => {
    const a = eff(attacker);
    const d = eff(defender);
    const chance = hitChance(a, d);
    const hit = random.chance(`combat.hit.${attacker.id}`, ratio(chance, 1000));
    let damage: number | null = null;
    let armorRemoved = 0;
    let healthRemovedHundredths = 0;
    if (hit) {
      const bounds = damageBounds(attacker.state.weaponDamage, combat);
      damage = random.uniform(`combat.damage.${attacker.id}`, bounds.lo, bounds.hi);
      // COMBAT, Effects of an attack, step 3: the defender's current armor absorbs what it can.
      armorRemoved = Math.min(damage, defender.currentArmor);
      defender.currentArmor -= armorRemoved;
      // Step 4: the rest removes current health. E.g., a damage outcome of 10 against an Agent with current health
      // 5.60 and no current armor removes 5.60.
      healthRemovedHundredths = Math.min(
        (damage - armorRemoved) * 100,
        defender.state.currentHealthHundredths,
      );
      defender.state.currentHealthHundredths -= healthRemovedHundredths;
    }
    // COMBAT, Effects of an attack, step 5: no upper clamp applies; AGENT, Exhaustion and Exact exhaustion,
    // statement 2: a whole gain of exhaustion raises Exact exhaustion by the same amount.
    attacker.state.exactExhaustionHundredths = clampExhaustion(
      attacker.state.exactExhaustionHundredths + agentParameters.exhaustionPerAttack * 100,
    );
    defender.state.exactExhaustionHundredths = clampExhaustion(
      defender.state.exactExhaustionHundredths + agentParameters.exhaustionPerDefense * 100,
    );
    refresh(attacker);
    refresh(defender);
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
    if (!recordReport) {
      return;
    }
    log.push({
      round,
      attacker: attacker.id,
      defender: defender.id,
      a,
      d,
      hitChance: chance,
      hit,
      damage,
      armorRemoved,
      healthRemovedHundredths,
      attackerAfter: {
        currentHealthHundredths: attacker.state.currentHealthHundredths,
        exhaustion: exhaustionOf(attacker.state),
      },
      defenderAfter: {
        currentHealthHundredths: defender.state.currentHealthHundredths,
        exhaustion: exhaustionOf(defender.state),
        currentArmor: defender.currentArmor,
      },
      defenderDead: defender.state.currentHealthHundredths === 0,
      defenderIncapacitated,
      attackerIncapacitated,
    });
  };

  const anyAble = (side: readonly Fighter[]): boolean => side.some(able);

  /** COMBAT, Combat end checks 1 and 2, made at Combat start and after every attack. */
  const sideOut = (): CombatOutcome | null => (!anyAble(enemies) ? 'Won' : !anyAble(agents) ? 'Wiped' : null);

  /**
   * One phase: the side's Combatants take their Combat turns in Phase order, i.e. from the highest to the lowest
   * effective skill at the start of the phase, ties in the fixed order (the sort is stable). The Combat ends at once
   * when the checks after an attack hold, even in the middle of the phase.
   */
  const phase = (
    round: number,
    side: readonly Fighter[],
    opponents: readonly Fighter[],
  ): CombatOutcome | null => {
    const order = [...side].sort((x, y) => eff(y) - eff(x));
    for (const fighter of order) {
      if (able(fighter)) {
        attack(round, fighter, selectTarget(fighter, opponents));
        const ended = sideOut();
        if (ended !== null) {
          return ended;
        }
      }
    }
    return null;
  };

  // Combat start, step 3.
  let outcome: CombatOutcome | null = sideOut();
  let rounds = 0;

  const bound = (agents.length + enemies.length) * Math.max(1, agentParameters.exhaustionIncapacitation) + 1;
  while (outcome === null) {
    rounds += 1;
    if (rounds > bound) {
      throw new EngineDefect('A Combat did not end within its bound of Combat rounds');
    }
    outcome = phase(rounds, agents, enemies) ?? phase(rounds, enemies, agents);
    // The Combat round ends here, also when the Combat ended within it; then the Retreated check.
    const agentsRating = rating(agents);
    const enemiesRating = rating(enemies);
    if (recordReport) {
      ratings.push({ round: rounds, agents: agentsRating, enemies: enemiesRating });
    }
    if (
      outcome === null &&
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
        currentArmor: fighter.currentArmor,
        exhaustion: exhaustionOf(fighter.state),
        effectiveSkill: eff(fighter),
        condition,
      },
      damageDealtHundredths: fighter.damageDealtHundredths,
      damageTakenHundredths: fighter.damageTakenHundredths,
      combatExperience: fighter.side === 'agent' ? fighter.combatExperience : null,
    };
  };

  const summary: CombatSummary = {
    outcome,
    agentsDead: agents.filter((fighter) => fighter.state.currentHealthHundredths === 0).length,
  };
  if (!recordReport) {
    return { summary, outputs: null };
  }
  const outputs: CombatOutputs = {
    summary,
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
  return { summary, outputs };
}
