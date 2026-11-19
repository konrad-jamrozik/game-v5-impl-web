/** TRVIEW, Combat log colours, and VIS, Colours: the tints and outcome colours of the Combat log. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import type { CombatReport } from '../../src/engine/index.ts';
import { combatLogRow } from '../../src/web/combat-log.ts';

type Attack = CombatReport['log'][number];

function attack(attacker: string, hit: boolean, extra: Partial<Attack> = {}): Attack {
  return {
    round: 1,
    attacker,
    defender: attacker === 'agent-1' ? 'enemy-1' : 'agent-1',
    a: 100,
    d: 40,
    hitProbability: { n: 10000, d: 11600 },
    hit,
    damage: hit ? 14 : null,
    healthRemovedHundredths: hit ? 1400 : 0,
    attackerAfter: { currentHealthHundredths: 3000, exhaustion: 1 },
    defenderAfter: { currentHealthHundredths: 600, exhaustion: 0 },
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
      defenderAfter: { currentHealthHundredths: 0, exhaustion: 0 },
    });
    expect(combatLogRow(dead, sideOf)).toMatchObject({ outcome: 'hit for 14, health 0', decisive: 'dead' });
    expect(combatLogRow(attack('agent-1', true, { defenderIncapacitated: true }), sideOf)).toMatchObject({
      decisive: 'incapacitated',
    });
  });

  it('defines the Agent attack tint and the Enemy attack tint at 7% opacity', () => {
    const css = readFileSync(new URL('../../src/web/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('--agent-attack-tint: rgb(183 199 122 / 7%);');
    expect(css).toContain('--enemy-attack-tint: rgb(255 127 120 / 7%);');
  });
});
