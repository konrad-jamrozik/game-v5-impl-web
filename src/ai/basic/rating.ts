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
}

/** The rating bases and the team size exponent of CombatParameters. */
export interface RatingParameters {
  readonly baseWeapon: number;
  readonly baseHealth: number;
  readonly baseArmor: number;
  readonly exponent: number;
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
    exponent: decimal(c['ratingTeamSizeExponent'], 1),
  };
}

/** COMBAT, Combat rating: what one Combatant adds to the sum, its effective skill times its rating factor. */
export function memberWeight(member: RatedMember, p: RatingParameters): number {
  const factor =
    (member.weaponDamage / p.baseWeapon + member.maxHealth / p.baseHealth + member.armor / p.baseArmor) / 2;
  return member.effectiveSkill * factor;
}

/** COMBAT, Combat rating of a side: ⌊n ^ (exponent − 1) × Σ effective skill × rating factor⌋. */
export function sideRating(count: number, weightSum: number, p: RatingParameters): number {
  return count === 0 ? 0 : Math.floor(count ** (p.exponent - 1) * weightSum + 1e-9);
}

export function ratingOf(members: readonly RatedMember[], p: RatingParameters): number {
  return sideRating(
    members.length,
    members.reduce((sum, member) => sum + memberWeight(member, p), 0),
    p,
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
