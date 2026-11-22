/** TRVIEW, Combat log colours: the tints and outcome colours of the Combat log. */
import { describe, expect, it } from 'vite-plus/test';
import type { CombatReport } from '../../src/engine/index.ts';
import { armorText, combatLogRow } from '../../src/web/combat-log.ts';

type Attack = CombatReport['log'][number];

function attack(attacker: string, hit: boolean, extra: Partial<Attack> = {}): Attack {
  return {
    round: 1,
    attacker,
    defender: attacker === 'agent-1' ? 'enemy-1' : 'agent-1',
    a: 100,
    d: 40,
    hitChance: 862,
    hit,
    damage: hit ? 14 : null,
    armorRemoved: 0,
    healthRemovedHundredths: hit ? 1400 : 0,
    attackerAfter: { currentHealthHundredths: 3000, exhaustion: 1 },
    defenderAfter: { currentHealthHundredths: 600, exhaustion: 0, currentArmor: 0 },
    defenderDead: false,
    defenderIncapacitated: false,
    attackerIncapacitated: false,
    ...extra,
  };
}

const sideOf = (id: string) => (id.startsWith('agent') ? 'agent' : 'enemy') as 'agent' | 'enemy';

describe('TRVIEW: Combat log colours', () => {
  it('tints a row by its attacker and colours a hit by whom it favours', () => {
    expect(combatLogRow(attack('agent-1', true), sideOf)).toEqual({
      tint: 'agent',
      tone: 'good',
      outcome: 'hit for 14, health 6',
      decisive: null,
    });
    expect(combatLogRow(attack('enemy-1', true), sideOf)).toMatchObject({ tint: 'enemy', tone: 'bad' });
  });

  it('shows a miss in Text muted, whichever side made it', () => {
    expect(combatLogRow(attack('agent-1', false), sideOf)).toEqual({
      tint: 'agent',
      tone: 'muted',
      outcome: 'miss',
      decisive: null,
    });
    expect(combatLogRow(attack('enemy-1', false), sideOf)).toMatchObject({ tint: 'enemy', tone: 'muted' });
  });

  it('names a participant made dead or Incapacitated with its own decisive word', () => {
    const dead = attack('agent-1', true, {
      defenderDead: true,
      defenderAfter: { currentHealthHundredths: 0, exhaustion: 0, currentArmor: 0 },
    });
    expect(combatLogRow(dead, sideOf)).toMatchObject({ outcome: 'hit for 14, health 0', decisive: 'dead' });
    expect(combatLogRow(attack('agent-1', true, { defenderIncapacitated: true }), sideOf)).toMatchObject({
      decisive: 'incapacitated',
    });
  });

  it('names the armor absorbed and the armor left when the defender had current armor', () => {
    const through = attack('enemy-1', true, {
      damage: 15,
      armorRemoved: 8,
      healthRemovedHundredths: 700,
      defenderAfter: { currentHealthHundredths: 2300, exhaustion: 1, currentArmor: 0 },
    });
    expect(combatLogRow(through, sideOf).outcome).toBe('hit for 15, 8 absorbed, armor 0, health 23');
    const absorbed = attack('enemy-1', true, {
      damage: 7,
      armorRemoved: 7,
      healthRemovedHundredths: 0,
      defenderAfter: { currentHealthHundredths: 3000, exhaustion: 1, currentArmor: 18 },
    });
    expect(combatLogRow(absorbed, sideOf).outcome).toBe('hit for 7, 7 absorbed, armor 18, health 30');
  });

  it('shows each participant armor at start and at end, and 0 alone without armor', () => {
    expect(
      armorText({ start: { armor: 3 }, final: { currentArmor: 0 } } as Parameters<typeof armorText>[0]),
    ).toBe('3 → 0');
    expect(
      armorText({ start: { armor: 0 }, final: { currentArmor: 0 } } as Parameters<typeof armorText>[0]),
    ).toBe('0');
  });
});
