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
