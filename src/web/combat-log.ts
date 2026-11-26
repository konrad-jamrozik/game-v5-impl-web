/**
 * TRVIEW, Combat log colours: whose attack each row of the Combat log is and whom its outcome favours. Pure
 * presentation; no gameplay rule.
 */
import type { CombatReport } from '../engine/index.ts';
import { groupDigits, hitChanceText, wholeText } from './format.ts';

type Attack = CombatReport['log'][number];

export interface CombatLogRow {
  /** The row's fill: the Agent attack tint or the Enemy attack tint, by the attacker's side. */
  readonly tint: 'agent' | 'enemy';
  /** The outcome's colour: Positive when an Agent hit, Danger when an Enemy hit, Text muted for a miss. */
  readonly tone: 'good' | 'bad' | 'muted';
  /**
   * The outcome without its decisive word, e.g. "hit for 14, health 0", "hit for 15, 8 absorbed, armor 0, health 23",
   * or "miss".
   */
  readonly outcome: string;
  /** The word that names a participant made dead or Incapacitated, shown in bold; null when there is none. */
  readonly decisive: 'dead' | 'incapacitated' | null;
}

/**
 * TRVIEW, Combat report: the final condition of a participant as its last column words it: "Killed" for a dead Agent,
 * "Dead" for a dead Enemy, "Incapacitated", or nothing for one able to fight. Its tone colours the participant's name
 * and its condition: Danger when it is dead and Warning when it is Incapacitated, on both sides alike.
 */
export function finalCondition(
  side: 'agent' | 'enemy',
  condition: 'ableToFight' | 'incapacitated' | 'dead',
): { readonly text: string; readonly tone: 'tone-bad' | 'tone-warning' | null } {
  switch (condition) {
    case 'dead':
      return { text: side === 'agent' ? 'Killed' : 'Dead', tone: 'tone-bad' };
    case 'incapacitated':
      return { text: 'Incapacitated', tone: 'tone-warning' };
    case 'ableToFight':
      return { text: '', tone: null };
  }
}

/**
 * TRVIEW, Combat report: the Armor of one participant: its effective armor at Combat start and its current armor at
 * Combat end joined by "→", e.g. "3 → 0", and "0" alone for a participant whose effective armor is 0.
 */
export function armorText(who: Pick<CombatReport['participants'][number], 'start' | 'final'>): string {
  return who.start.armor === 0
    ? '0'
    : `${groupDigits(who.start.armor)} → ${groupDigits(who.final.currentArmor)}`;
}

export function combatLogRow(attack: Attack, sideOf: (id: string) => 'agent' | 'enemy'): CombatLogRow {
  const tint = sideOf(attack.attacker);
  if (!attack.hit) {
    return { tint, tone: 'muted', outcome: 'miss', decisive: null };
  }
  // TRVIEW, Combat report: when the defender had current armor before the hit, the armor removed is named as absorbed,
  // with the defender's current armor after it, between the damage outcome and the current health.
  const armorBefore = attack.defenderAfter.currentArmor + attack.armorRemoved;
  const armor =
    armorBefore > 0
      ? `, ${groupDigits(attack.armorRemoved)} absorbed, armor ${groupDigits(attack.defenderAfter.currentArmor)}`
      : '';
  return {
    tint,
    tone: tint === 'agent' ? 'good' : 'bad',
    outcome: `hit for ${groupDigits(attack.damage ?? 0)}${armor}, health ${wholeText(attack.defenderAfter.currentHealthHundredths)}`,
    decisive: attack.defenderDead ? 'dead' : attack.defenderIncapacitated ? 'incapacitated' : null,
  };
}

/**
 * CRPLAY, Attack being played: the result of one attack with how narrowly it hit or missed, its margin, i.e. the
 * difference between its hit chance and its hit roll, shown like a hit chance; and for a hit the defender's current
 * armor and health before and after it, e.g. "miss by 5.2%" or "hit with 9.0% margin, for 8 damage, health 20 → 12".
 * A Combat report written before the Combat log held the hit roll gives the result without a margin.
 */
export function attackResultText(attack: Attack): string {
  const roll = attack.hitRoll;
  if (!attack.hit) {
    return roll === undefined ? 'miss' : `miss by ${hitChanceText(roll - attack.hitChance)}`;
  }
  const margin = roll === undefined ? 'hit' : `hit with ${hitChanceText(attack.hitChance - roll)} margin`;
  const after = attack.defenderAfter;
  const armorBefore = after.currentArmor + attack.armorRemoved;
  const armor =
    armorBefore > 0
      ? `, ${groupDigits(attack.armorRemoved)} absorbed, armor ${groupDigits(armorBefore)} → ${groupDigits(after.currentArmor)}`
      : '';
  const healthBefore = after.currentHealthHundredths + attack.healthRemovedHundredths;
  return `${margin}, for ${groupDigits(attack.damage ?? 0)} damage${armor}, health ${wholeText(healthBefore)} → ${wholeText(after.currentHealthHundredths)}`;
}
