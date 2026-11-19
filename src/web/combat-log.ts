/**
 * TRVIEW, Combat log colours: whose attack each row of the Combat log is and whom its outcome favours. Pure
 * presentation; no gameplay rule.
 */
import type { CombatReport } from '../engine/index.ts';
import { wholeText } from './format.ts';

type Attack = CombatReport['log'][number];

export interface CombatLogRow {
  /** The row's fill: the Agent attack tint or the Enemy attack tint, by the attacker's side. */
  readonly tint: 'agent' | 'enemy';
  /** The outcome's colour: Positive when an Agent hit, Danger when an Enemy hit, Text muted for a miss. */
  readonly tone: 'good' | 'bad' | 'muted';
  /** The outcome without its decisive word, e.g. "hit for 14, health 0" or "miss". */
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

export function combatLogRow(attack: Attack, sideOf: (id: string) => 'agent' | 'enemy'): CombatLogRow {
  const tint = sideOf(attack.attacker);
  if (!attack.hit) {
    return { tint, tone: 'muted', outcome: 'miss', decisive: null };
  }
  return {
    tint,
    tone: tint === 'agent' ? 'good' : 'bad',
    outcome: `hit for ${attack.damage ?? 0}, health ${wholeText(attack.defenderAfter.currentHealthHundredths)}`,
    decisive: attack.defenderDead ? 'dead' : attack.defenderIncapacitated ? 'incapacitated' : null,
  };
}
