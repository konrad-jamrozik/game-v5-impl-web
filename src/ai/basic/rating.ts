/**
 * COMBAT, Combat rating, as the Basic Autopilot AI evaluates it for Agents as they would be, e.g. rested or in the kit
 * its Equipping plan gives them, which no Player API query previews.
 */
import type { AgentView, GameDataView } from '../../engine/player-api.ts';

/** One Combatant's values that its Combat rating reads. */
export interface RatedMember {
  readonly effectiveSkill: number;
  readonly weaponDamage: number;
  readonly maxHealth: number;
  readonly armor: number;
  /** Its exhaustion, which the exhaustion factor reads; absent for a fully rested member. */
  readonly exhaustion?: number;
}

/** The rating bases, the exhaustion factor's values, and the team size exponent of CombatParameters. */
export interface RatingParameters {
  readonly baseWeapon: number;
  readonly baseHealth: number;
  readonly baseArmor: number;
  readonly exhaustionFree: number;
  readonly exhaustionSpan: number;
  readonly exponent: number;
  /** COMBAT, Combat rating: `rating_agent_skill_gini_penalty`, for the skill evenness factor of an Agents' side. */
  readonly giniPenalty: number;
}

/** A decimal text of GameDataView, e.g. "0.85", as a number. */
export const decimal = (text: string | undefined, fallback: number): number => {
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
};

export function ratingParameters(data: GameDataView): RatingParameters {
  const c = data.combatParameters;
  return {
    baseWeapon: decimal(c['ratingBaseWeaponDamage'], 1),
    baseHealth: decimal(c['ratingBaseHealth'], 1),
    baseArmor: decimal(c['ratingBaseArmor'], 1),
    exhaustionFree: decimal(c['ratingExhaustionFreePoints'], Infinity),
    exhaustionSpan: Math.max(1, decimal(c['ratingExhaustionSpan'], 1)),
    exponent: decimal(c['ratingTeamSizeExponent'], 1),
    giniPenalty: decimal(c['ratingAgentSkillGiniPenalty'], 0),
  };
}

/**
 * COMBAT, Combat rating: what one Combatant adds to the sum, its effective skill times its rating factor and its
 * exhaustion factor.
 */
export function memberWeight(member: RatedMember, p: RatingParameters): number {
  const factor =
    (member.weaponDamage / p.baseWeapon + member.maxHealth / p.baseHealth + member.armor / p.baseArmor) / 2;
  const above = Math.max(0, (member.exhaustion ?? 0) - p.exhaustionFree);
  const exhaustionFactor = Math.max(0, p.exhaustionSpan - above) / p.exhaustionSpan;
  return member.effectiveSkill * factor * exhaustionFactor;
}

/**
 * COMBAT, Combat rating: the skill evenness factor of an Agents' side of the given effective skills, 1 − the Gini
 * penalty × Σ over every ordered pair |e(c) − e(d)| / (2 × n × Σ e(c)); 1 for fewer than two or a total of 0.
 */
export function skillEvenness(skills: readonly number[], p: RatingParameters): number {
  if (skills.length < 2 || p.giniPenalty <= 0) {
    return 1;
  }
  const total = skills.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return 1;
  }
  let differences = 0;
  for (const a of skills) {
    for (const b of skills) {
      differences += Math.abs(a - b);
    }
  }
  return 1 - (p.giniPenalty * differences) / (2 * skills.length * total);
}

/**
 * COMBAT, Combat rating of an Agents' side: ⌊n ^ (exponent − 1) × skill evenness factor × Σ effective skill × rating
 * factor⌋, the skill evenness factor read from `skills`, the members' effective skill.
 */
export function sideRating(
  count: number,
  weightSum: number,
  p: RatingParameters,
  skills: readonly number[],
): number {
  return count === 0
    ? 0
    : Math.floor(count ** (p.exponent - 1) * skillEvenness(skills, p) * weightSum + 1e-9);
}

export function ratingOf(members: readonly RatedMember[], p: RatingParameters): number {
  return sideRating(
    members.length,
    members.reduce((sum, member) => sum + memberWeight(member, p), 0),
    p,
    members.map((member) => member.effectiveSkill),
  );
}

/**
 * BASICAI, Glossary, Rested rating: the Agent fully rested and unhurt, its effective skill read as its base skill
 * rounded down, wearing the Weapon and Armor of the given damage and armor.
 */
export function restedMember(agent: AgentView, weaponDamage: number, armor: number): RatedMember {
  return {
    effectiveSkill: Math.floor(agent.skillHundredths / 100),
    weaponDamage,
    maxHealth: agent.effectiveMaxHealth,
    armor,
  };
}
