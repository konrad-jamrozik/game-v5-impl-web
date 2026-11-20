/** Tests, from the former Acceptance examples, of COMBAT. */
import { describe, expect, it } from 'vite-plus/test';
import { effectiveSkill } from '../../src/engine/mechanics/agents/agents.ts';
import {
  combatRating,
  damageBounds,
  fightCombat,
  type Combatant,
} from '../../src/engine/mechanics/combat/combat.ts';
import { injectedRandom, type Random } from '../../src/engine/random.ts';
import type { CombatReport } from '../../src/engine/state/types.ts';
import {
  catalogWith,
  combatAgent,
  combatEnemy,
  expectDefective,
  gdrs,
  type Injected,
  units,
} from '../helpers/game.ts';

/**
 * Fights a Combat and, as the Mission resolution step does, applies its final values to the Combatants it was given,
 * so that a test can read them there.
 */
function fight(agents: Combatant[], enemies: Combatant[], injected: Injected): CombatReport {
  const outputs = fightCombat(
    { agents, enemies, combat: gdrs.combatParameters, agentParameters: gdrs.agentParameters },
    injectedRandom(injected),
  );
  [...agents, ...enemies].forEach((combatant, index) =>
    Object.assign(combatant.state, [...outputs.agents, ...outputs.enemies][index]),
  );
  return { mission: 'm1', ...outputs.report };
}

const participant = (report: CombatReport, id: string) => report.participants.find((p) => p.id === id)!;
const misses = (count: number) => new Array<boolean>(count).fill(false);

describe('COMBAT: examples', () => {
  it('Enemy creation', () => {
    const rows: [string, number, number, number][] = [
      ['initiate', 40, 20, 8],
      ['soldier', 120, 30, 14],
      ['operative', 60, 25, 10],
      ['handler', 80, 25, 10],
      ['lieutenant', 140, 30, 16],
      ['elite', 250, 40, 20],
      ['commander', 300, 40, 22],
      ['high_commander', 500, 50, 28],
      ['cult_leader', 800, 80, 32],
    ];
    for (const [archetype, skill, health, damage] of rows) {
      const enemy = combatEnemy('e', archetype).state;
      // A Combat holds an Enemy's whole values in hundredths, as an Agent holds its own; see DEC-056.
      expect(enemy).toEqual({
        skillHundredths: skill * 100,
        currentHealthHundredths: health * 100,
        maxHealth: health,
        exactExhaustionHundredths: 0,
        weaponDamage: damage,
        // BOOT, Combat GDRs: every EnemyArchetype wears `no_armor`.
        armor: 0,
      });
      expect(effectiveSkill(enemy, gdrs.agentParameters)).toBe(skill);
    }
  });

  it('Damage bounds for each Weapon', () => {
    expect(damageBounds(10, gdrs.combatParameters)).toEqual({ lo: 5, hi: 15 });
    expect(damageBounds(14, gdrs.combatParameters)).toEqual({ lo: 7, hi: 21 });
    expect(damageBounds(22, gdrs.combatParameters)).toEqual({ lo: 11, hi: 33 });
    expect(damageBounds(11, gdrs.combatParameters)).toEqual({ lo: 6, hi: 16 });
    // An injected damage outcome outside the range is invalid.
    expect(() =>
      fight([combatAgent('a1')], [combatEnemy('e1', 'initiate')], {
        'combat.hit.a1': [true],
        'combat.damage.a1': [16],
      }),
    ).toThrow();
  });

  it('Hit probabilities', () => {
    const rows: [number, number, number, number][] = [
      [100, 40, 10000, 11600],
      [40, 100, 1600, 11600],
      [100, 120, 10000, 24400],
      [300, 100, 90000, 100000],
      [100, 100, 10000, 20000],
      [1, 1, 1, 2],
    ];
    for (const [a, d, n, total] of rows) {
      const report = fight(
        [combatAgent('a1', { skill: a })],
        [
          {
            id: 'e1',
            state: {
              skillHundredths: d * 100,
              currentHealthHundredths: 3000,
              maxHealth: 30,
              exactExhaustionHundredths: 0,
              weaponDamage: 10,
              armor: 0,
            },
          },
        ],
        { 'combat.hit.a1': misses(200), 'combat.hit.e1': misses(200) },
      );
      expect(report.log[0]).toMatchObject({ a, d, hitProbability: { n, d: total } });
    }
  });

  it('Target selection: Selection weights of an Agent and of an Enemy', () => {
    // Effective skill 39 is above 13, but exhaustion 100 meets the exhaustion clause, so a4 is never a candidate.
    const a4 = combatAgent('a4', { skill: 130, exhaustion: 100 });
    expect(effectiveSkill(a4.state, gdrs.agentParameters)).toBe(39);
    const draws: [string, (readonly [string, number])[]][] = [];
    const base = injectedRandom({
      'combat.target.a1': ['e2'],
      'combat.hit.a1': [false],
      'combat.target.a2': ['e3'],
      'combat.hit.a2': [false],
      'combat.target.e1': ['a2'],
      'combat.hit.e1': [false],
      'combat.target.e2': ['a1'],
      'combat.hit.e2': [false],
      'combat.target.e3': ['a1'],
      'combat.hit.e3': [false],
    });
    const random: Random = {
      ...base,
      weighted(outcome, entries) {
        if (draws.length === 5) {
          // Stop the Combat after the five target selections of Combat round 1.
          throw new Error('round 1 done');
        }
        draws.push([outcome, [...entries]]);
        return base.weighted(outcome, entries);
      },
    };
    // Enemies of effective skill 40, 50, and 100: an Agent of effective skill 100 hits them with 86.2%, 80%, and 50%.
    expect(() =>
      fightCombat(
        {
          agents: [combatAgent('a1'), combatAgent('a2'), a4],
          enemies: [combatEnemy('e1', 'initiate'), combatAgent('e2', { skill: 50 }), combatAgent('e3')],
          combat: gdrs.combatParameters,
          agentParameters: gdrs.agentParameters,
        },
        random,
      ),
    ).toThrow('round 1 done');
    // The Enemies' phase runs from e3 (100) through e2 (50) to e1 (40).
    expect(draws.map(([outcome]) => outcome)).toEqual([
      'combat.target.a1',
      'combat.target.a2',
      'combat.target.e3',
      'combat.target.e2',
      'combat.target.e1',
    ]);
    expect(draws[0]).toEqual([
      'combat.target.a1',
      [
        ['e1', 94],
        ['e2', 100],
        ['e3', 70],
      ],
    ]);
    // An Enemy weighs every Agent able to fight alike, whatever its effective skill or health.
    const enemyDraws = draws.filter(([outcome]) => outcome.startsWith('combat.target.e'));
    expect(enemyDraws[0]![1]).toEqual([
      ['a1', 1],
      ['a2', 1],
    ]);
  });

  it('Selection weights at the examples of the specification', () => {
    // An Agent of effective skill 200 against an Enemy of 100 hits with exactly 80%: weight 100; against 50, 94.1%:
    // 100 − 14 = 86; against 400, 20%: 100 − 60 = 40.
    const draws: (readonly [string, number])[][] = [];
    const base = injectedRandom({});
    const fightOnce = (): void => {
      fightCombat(
        {
          agents: [combatAgent('a1', { skill: 200 })],
          enemies: [combatAgent('e1'), combatAgent('e2', { skill: 50 }), combatAgent('e3', { skill: 400 })],
          combat: gdrs.combatParameters,
          agentParameters: gdrs.agentParameters,
        },
        {
          ...base,
          weighted(outcome, entries) {
            draws.push([...entries]);
            // Stop the Combat at its first target selection.
            throw new Error(outcome);
          },
        },
      );
    };
    expect(fightOnce).toThrow('combat.target.a1');
    expect(draws[0]).toEqual([
      ['e1', 100],
      ['e2', 86],
      ['e3', 40],
    ]);
  });

  it('Selection weights are determined anew at every target selection, within one phase too', () => {
    // a1's hit lowers e1 from 100 to 50, so for a2, attacking next in the same phase, e1 weighs 100 instead of 70.
    const draws: (readonly [string, number])[][] = [];
    const base = injectedRandom({ 'combat.hit.a1': [true], 'combat.damage.a1': [15] });
    const fightOnce = (): void => {
      fightCombat(
        {
          agents: [combatAgent('a1'), combatAgent('a2')],
          enemies: [combatAgent('e1'), combatEnemy('e2', 'initiate')],
          combat: gdrs.combatParameters,
          agentParameters: gdrs.agentParameters,
        },
        {
          ...base,
          weighted(_outcome, entries) {
            draws.push([...entries]);
            if (draws.length === 2) {
              throw new Error('second target selection');
            }
            return 'e1';
          },
        },
      );
    };
    expect(fightOnce).toThrow('second target selection');
    expect(draws).toEqual([
      [
        ['e1', 70],
        ['e2', 94],
      ],
      [
        ['e1', 100],
        ['e2', 94],
      ],
    ]);
  });

  it('Phase order: from the highest to the lowest effective skill, ties in the fixed order', () => {
    // a2 (120) acts first, then a1 and a3 (90 each) in the fixed order; a3's hit kills the soldier.
    const report = fight(
      [
        combatAgent('a1', { skill: 90 }),
        combatAgent('a2', { skill: 120 }),
        combatAgent('a3', { skill: 90, weaponDamage: 30 }),
      ],
      [combatEnemy('e1', 'soldier')],
      {
        'combat.hit.a1': [false],
        'combat.hit.a2': [false],
        'combat.hit.a3': [true],
        'combat.damage.a3': [30],
      },
    );
    expect(report.log.map((attack) => attack.attacker)).toEqual(['a2', 'a1', 'a3']);
    expect(report.agents).toEqual(['a1', 'a2', 'a3']);
    expect([report.outcome, report.rounds]).toEqual(['Prevailed', 1]);
  });

  it('A Combat ends at once when a side has no Combatant able to fight', () => {
    // a1 kills the only Enemy: the Combat is Prevailed after one attack, a2 takes no Combat turn and no Enemies'
    // phase follows.
    const a2 = combatAgent('a2');
    const report = fight([combatAgent('a1', { weaponDamage: 20 }), a2], [combatEnemy('e1', 'initiate')], {
      'combat.hit.a1': [true],
      'combat.damage.a1': [20],
    });
    expect([report.outcome, report.rounds, report.log.length]).toEqual(['Prevailed', 1, 1]);
    expect(report.ratings).toEqual([
      { round: 0, agents: 200, enemies: 40 },
      { round: 1, agents: 200, enemies: 0 },
    ]);
    expect(participant(report, 'a2').final.exhaustion).toBe(0);
  });

  it('Complete Combat: two Agents against two initiates', () => {
    const report = fight(
      [combatAgent('a1'), combatAgent('a2')],
      [combatEnemy('e1', 'initiate'), combatEnemy('e2', 'initiate')],
      {
        'combat.target.a1': ['e1', 'e1'],
        'combat.hit.a1': [true, true],
        'combat.damage.a1': [12, 9],
        'combat.target.a2': ['e2', 'e2'],
        'combat.hit.a2': [true, false, true],
        'combat.damage.a2': [15, 5],
        'combat.target.e1': ['a1'],
        'combat.hit.e1': [false],
        'combat.target.e2': ['a1', 'a2'],
        'combat.hit.e2': [true, false],
        'combat.damage.e2': [7],
      },
    );
    expect(report.outcome).toBe('Prevailed');
    expect(report.rounds).toBe(3);
    expect(report.agents).toEqual(['a1', 'a2']);
    expect(report.enemies).toEqual(['e1', 'e2']);
    // From Combat round 2, a2 (100) acts before the wounded a1 (76); a2's hit in Combat round 3 ends the Combat at
    // once, so a1 does not attack in it.
    expect(
      report.log.map((x) => [
        x.round,
        x.attacker,
        x.defender,
        x.a,
        x.d,
        x.hitProbability.n,
        x.hitProbability.d,
      ]),
    ).toEqual([
      [1, 'a1', 'e1', 100, 40, 10000, 11600],
      [1, 'a2', 'e2', 100, 40, 10000, 11600],
      [1, 'e1', 'a1', 16, 100, 256, 10256],
      [1, 'e2', 'a1', 10, 100, 100, 10100],
      [2, 'a2', 'e2', 100, 10, 10000, 10100],
      [2, 'a1', 'e1', 76, 16, 5776, 6032],
      [2, 'e2', 'a2', 10, 100, 100, 10100],
      [3, 'a2', 'e2', 100, 10, 10000, 10100],
    ]);
    expect(report.log.map((x) => x.healthRemovedHundredths)).toEqual([1200, 1500, 0, 700, 0, 800, 0, 500]);
    expect(report.log.map((x) => x.damage)).toEqual([12, 15, null, 7, null, 9, null, 5]);
    expect(report.log[5]).toMatchObject({
      defenderDead: true,
      defenderAfter: { currentHealthHundredths: 0, exhaustion: 3 },
    });
    expect(report.ratings).toEqual([
      { round: 0, agents: 200, enemies: 80 },
      { round: 1, agents: 176, enemies: 26 },
      { round: 2, agents: 176, enemies: 10 },
      { round: 3, agents: 176, enemies: 0 },
    ]);
    expect(participant(report, 'a1').final).toEqual({
      currentHealthHundredths: 2300,
      currentArmor: 0,
      exhaustion: 4,
      effectiveSkill: 76,
      condition: 'ableToFight',
    });
    expect(participant(report, 'a2').final).toMatchObject({
      currentHealthHundredths: 3000,
      exhaustion: 4,
      effectiveSkill: 100,
    });
    expect(participant(report, 'e1').final).toMatchObject({
      currentHealthHundredths: 0,
      exhaustion: 3,
      condition: 'dead',
    });
    expect(participant(report, 'e2').final).toMatchObject({
      currentHealthHundredths: 0,
      exhaustion: 5,
      condition: 'dead',
    });
    expect(report.participants.map((p) => p.damageDealtHundredths)).toEqual([2000, 2000, 0, 700]);
    expect(report.participants.map((p) => p.damageTakenHundredths)).toEqual([700, 0, 2000, 2000]);
    // Combat skill gain: a1 4 + 4 + 2 + 1 = 11 from its two hits, the miss and the hit it took; a2 4 + 2 + 4 + 2 = 12
    // from its two hits, its miss, and the miss it took. An Enemy has none, and a Combat changes no base skill.
    expect(report.participants.map((p) => p.combatExperience)).toEqual([11, 12, null, null]);
    expect(report.participants.map((p) => p.start.skillHundredths)).toEqual([10000, 10000, 4000, 4000]);
  });

  it('Combat skill gain counts every attack, and a Killed Agent keeps its own in the report', () => {
    // a1 misses twice and is missed once, then is hit and made dead: 2 + 2 + 2 + 1 = 7.
    const a1 = combatAgent('a1', { currentHealth: 5 });
    const report = fight([a1], [combatEnemy('e1', 'soldier')], {
      'combat.hit.a1': [false, false],
      'combat.hit.e1': [false, true],
      'combat.damage.e1': [14],
    });
    expect(report.outcome).toBe('Wiped');
    expect(report.log).toHaveLength(4);
    expect(participant(report, 'a1')).toMatchObject({ combatExperience: 7, final: { condition: 'dead' } });
    expect(a1.state.skillHundredths).toBe(10000);
  });

  it('Retreated', () => {
    const a1 = combatAgent('a1');
    const report = fight([a1], [combatEnemy('e1', 'soldier')], {
      'combat.hit.a1': [false],
      'combat.hit.e1': [true],
      'combat.damage.e1': [21],
    });
    expect(report.outcome).toBe('Retreated');
    expect(report.rounds).toBe(1);
    expect(units(a1.state)).toMatchObject({ currentHealth: 9, exhaustion: 2 });
    expect(participant(report, 'a1').final).toMatchObject({ effectiveSkill: 30, condition: 'ableToFight' });
    expect(report.log[1]!.hitProbability).toEqual({ n: 14400, d: 24400 });
  });

  it('Wiped, with the Retreated check also holding', () => {
    const report = fight([combatAgent('a1', { currentHealth: 6 })], [combatEnemy('e1', 'commander')], {
      'combat.hit.a1': [false],
      'combat.hit.e1': [true],
      'combat.damage.e1': [11],
    });
    expect(report.ratings[0]).toMatchObject({ agents: 20 });
    expect(report.log[1]).toMatchObject({ a: 300, d: 20, healthRemovedHundredths: 600, defenderDead: true });
    expect(report.outcome).toBe('Wiped');
    expect(participant(report, 'a1').final.condition).toBe('dead');
  });

  it('Incapacitated during a Combat', () => {
    const a1 = combatAgent('a1', { exhaustion: 99 });
    const report = fight([a1, combatAgent('a2')], [combatEnemy('e1', 'initiate')], {
      'combat.hit.a1': [false],
      'combat.hit.a2': [true, true],
      'combat.damage.a2': [10, 13],
      'combat.hit.e1': [false],
    });
    expect(report.ratings[0]!.agents).toBe(131);
    // a2 (100) acts before a1 (31); a1 then attacks the wounded initiate and its own attack Incapacitates it.
    expect(report.log[0]).toMatchObject({ attacker: 'a2', defender: 'e1', healthRemovedHundredths: 1000 });
    expect(report.log[1]).toMatchObject({
      attacker: 'a1',
      a: 31,
      d: 20,
      hitProbability: { n: 961, d: 1361 },
      attackerIncapacitated: true,
    });
    expect(report.log[2]).toMatchObject({ attacker: 'e1', defender: 'a2' });
    expect(report.ratings[1]!.agents).toBe(100);
    expect(report.outcome).toBe('Prevailed');
    expect(report.rounds).toBe(2);
    expect(participant(report, 'a1').final).toMatchObject({
      currentHealthHundredths: 3000,
      exhaustion: 100,
      effectiveSkill: 30,
      condition: 'incapacitated',
    });
    expect(units(a1.state)).toMatchObject({ currentHealth: 30, exhaustion: 100 });
    expect(Object.keys(a1.state)).not.toContain('incapacitated');
  });

  it('Prevailed when neither side can fight on', () => {
    const report = fight([combatAgent('a1', { exhaustion: 97 })], [combatEnemy('e1', 'initiate')], {
      'combat.hit.a1': [true, true],
      'combat.damage.a1': [15, 5],
      'combat.hit.e1': [false],
    });
    expect(report.log.map((x) => [x.a, x.d])).toEqual([
      [33, 40],
      [10, 32],
      [31, 10],
    ]);
    expect(report.outcome).toBe('Prevailed');
    expect(report.rounds).toBe(2);
    expect(participant(report, 'a1').final.condition).toBe('incapacitated');
  });

  it('Combats that end at their start', () => {
    const empty = fight([combatAgent('a1')], [], {});
    expect([empty.outcome, empty.rounds, empty.log.length]).toEqual(['Prevailed', 0, 0]);
    const zeroSkill = {
      id: 'e1',
      state: {
        skillHundredths: 0,
        currentHealthHundredths: 2000,
        maxHealth: 20,
        exactExhaustionHundredths: 0,
        weaponDamage: 10,
        armor: 0,
      },
    };
    const incapacitatedEnemy = fight([combatAgent('a1')], [zeroSkill], {});
    expect([incapacitatedEnemy.outcome, incapacitatedEnemy.rounds]).toEqual(['Prevailed', 0]);
    const tired = combatAgent('a1', { exhaustion: 100 });
    const wiped = fight([tired], [combatEnemy('e1', 'initiate')], {});
    expect([wiped.outcome, wiped.rounds]).toEqual(['Wiped', 0]);
    expect(tired.state).toMatchObject({ currentHealthHundredths: 3000, exactExhaustionHundredths: 10000 });
    // Effective skill 30 is above the skill clause's 10: the exhaustion clause alone incapacitates it.
    expect(effectiveSkill(tired.state, gdrs.agentParameters)).toBe(30);
    const veryTired = combatAgent('a1', { exhaustion: 130 });
    const wipedAgain = fight([veryTired], [combatEnemy('e1', 'initiate')], {});
    expect([wipedAgain.outcome, wipedAgain.rounds]).toEqual(['Wiped', 0]);
    expect(units(veryTired.state)).toMatchObject({ currentHealth: 30, exhaustion: 130 });
    const continues = fight(
      [combatAgent('a1', { exhaustion: 105 }), combatAgent('a2')],
      [combatEnemy('e1', 'initiate')],
      { 'combat.hit.a2': [true, true], 'combat.damage.a2': [15, 15], 'combat.hit.e1': [false, false] },
    );
    expect(continues.ratings[0]!.agents).toBe(100);
    expect(continues.rounds).toBeGreaterThan(0);
    expect(() => fight([], [combatEnemy('e1', 'initiate')], {})).toThrow();
    expect(() => fight([combatAgent('a1'), combatAgent('a1')], [], {})).toThrow();
  });

  it('Every attack misses', () => {
    const initiate = fight([combatAgent('a1')], [combatEnemy('e1', 'initiate')], {
      'combat.hit.a1': misses(200),
      'combat.hit.e1': misses(200),
    });
    expect(initiate.outcome).toBe('Prevailed');
    expect(initiate.rounds).toBe(50);
    expect(initiate.log).toHaveLength(100);
    expect(participant(initiate, 'e1').final).toMatchObject({
      exhaustion: 100,
      effectiveSkill: 12,
      condition: 'incapacitated',
    });
    expect(participant(initiate, 'a1').final).toMatchObject({
      exhaustion: 100,
      effectiveSkill: 30,
      condition: 'incapacitated',
    });
    expect(initiate.ratings[41]).toEqual({ round: 41, agents: 48, enemies: 19 });

    const soldier = fight([combatAgent('a1')], [combatEnemy('e1', 'soldier')], {
      'combat.hit.a1': misses(200),
      'combat.hit.e1': misses(200),
    });
    expect(soldier.outcome).toBe('Retreated');
    expect(soldier.rounds).toBe(41);
    expect(soldier.ratings[40]).toMatchObject({ agents: 50 });
    expect(soldier.ratings[41]).toEqual({ round: 41, agents: 48, enemies: 57 });
  });

  it('Effects of an attack: current armor absorbs hits before current health, and only within its Combat', () => {
    // The example of the specification: current health 30 and current armor 25, hit for 7, 10, 15, and 4. A
    // `weapon_damage_range` of 1 lets a weapon damage of 10 roll each of them.
    const catalog = catalogWith((raw) => (raw.get('combat_parameters')['weapon_damage_range'] = 1));
    const enemy: Combatant = {
      id: 'e1',
      state: {
        skillHundredths: 10000,
        currentHealthHundredths: 10000,
        maxHealth: 100,
        exactExhaustionHundredths: 0,
        weaponDamage: 10,
        armor: 0,
      },
    };
    const inputs = {
      agents: [combatAgent('a1', { armor: 25 })],
      enemies: [enemy],
      combat: catalog.combatParameters,
      agentParameters: catalog.agentParameters,
    };
    const injected: Injected = {
      'combat.hit.a1': misses(200),
      'combat.hit.e1': [true, true, true, true, ...misses(200)],
      'combat.damage.e1': [7, 10, 15, 4],
    };
    const outputs = fightCombat(inputs, injectedRandom(injected));
    const hits = outputs.report.log.filter((item) => item.attacker === 'e1' && item.hit);
    expect(
      hits.map((item) => [
        item.damage,
        item.armorRemoved,
        item.healthRemovedHundredths / 100,
        item.defenderAfter.currentHealthHundredths / 100,
        item.defenderAfter.currentArmor,
      ]),
    ).toEqual([
      [7, 7, 0, 30, 18],
      [10, 10, 0, 30, 8],
      [15, 8, 7, 23, 0],
      [4, 0, 4, 19, 0],
    ]);
    // A hit its current armor absorbs whole changes the defender's effective skill only through exhaustion.
    expect(hits.slice(0, 3).map((item) => item.d)).toEqual([100, 100, 100]);
    const a1 = outputs.report.participants.find((item) => item.id === 'a1')!;
    expect(a1.start).toMatchObject({ armor: 25, currentHealthHundredths: 3000 });
    expect(a1.final.currentArmor).toBe(0);
    // Damage taken counts no armor removed.
    expect(a1.damageTakenHundredths).toBe(1100);
    // The current armor is a Combat-only property: the final values a Combat returns keep the effective armor.
    expect(outputs.agents[0]!.armor).toBe(25);
    expect(inputs.agents[0]!.state.armor).toBe(25);
  });

  it('No armor: every hit removes current health as if armor did not exist', () => {
    const report = fight([combatAgent('a1')], [combatEnemy('e1', 'initiate')], {
      'combat.hit.a1': misses(200),
      'combat.hit.e1': [true, ...misses(200)],
      'combat.damage.e1': [8],
    });
    const hit = report.log.find((item) => item.attacker === 'e1')!;
    expect([hit.armorRemoved, hit.healthRemovedHundredths, hit.defenderAfter.currentArmor]).toEqual([
      0, 800, 0,
    ]);
    expect(participant(report, 'e1').start.armor).toBe(0);
  });

  it('Combat ratings of Mission sites', () => {
    const rating = (enemies: [string, number][]) =>
      combatRating(
        enemies.flatMap(([archetype, count]) =>
          Array.from({ length: count }, (_, i) => combatEnemy(`e${i}`, archetype).state),
        ),
        gdrs.combatParameters,
        gdrs.agentParameters,
      );
    expect(rating([['initiate', 3]])).toBe(120);
    expect(rating([['initiate', 5]])).toBe(200);
    expect(
      rating([
        ['initiate', 4],
        ['soldier', 2],
      ]),
    ).toBe(400);
    expect(
      rating([
        ['initiate', 8],
        ['soldier', 1],
      ]),
    ).toBe(440);
    expect(
      rating([
        ['initiate', 6],
        ['soldier', 3],
        ['commander', 1],
      ]),
    ).toBe(900);
    const four = [combatAgent('a1'), combatAgent('a2'), combatAgent('a3'), combatAgent('a4')];
    expect(
      combatRating(
        four.map((a) => a.state),
        gdrs.combatParameters,
        gdrs.agentParameters,
      ),
    ).toBe(400);
    four[3] = combatAgent('a4', { exhaustion: 100 });
    expect(
      combatRating(
        four.map((a) => a.state),
        gdrs.combatParameters,
        gdrs.agentParameters,
      ),
    ).toBe(300);
  });

  it('GDR validation', () => {
    expectDefective((raw) => {
      raw.get('agent_parameters')['exhaustion_per_attack'] = 0;
      raw.get('agent_parameters')['exhaustion_per_defense'] = 0;
    });
    expectDefective((raw) => (raw.get('sidearm')['base_weapon_damage'] = 0));
    // COMBAT, Combat GDR validation, rules 2, 3, and 8, for Armor.
    expectDefective((raw) => (raw.get('no_armor')['base_armor'] = -1));
    expectDefective((raw) => (raw.get('no_armor')['base_armor'] = 0.5));
    expectDefective((raw) => (raw.get('initiate')['armor'] = 'plate'));
    expectDefective((raw) => delete raw.get('initiate')['armor']);
    expectDefective((raw) => (raw.get('field_agent')['armor'] = 'plate'));
    expectDefective((raw) => (raw.get('service_armor')['weight'] = 1));
    expectDefective((raw) => (raw.get('combat_parameters')['weapon_damage_range'] = { $decimal: '1.5' }));
    expectDefective((raw) => (raw.get('sidearm')['range'] = 3));
    expectDefective((raw) => (raw.get('cult_leader')['weapon'] = 'laser'));
    expectDefective((raw) =>
      raw.add('combat/combat_parameters.yaml', { ...raw.get('combat_parameters'), id: 'second' }),
    );
    // No rule ties the penalty factor to the incapacitation threshold any more.
    const valid = catalogWith(
      (raw) => (raw.get('combat_parameters')['incapacitation_skill_fraction'] = { $decimal: '0.05' }),
    );
    expect(valid.combatParameters.incapacitationSkillFraction.toString()).toBe('1/20');
    const noPenalty = catalogWith(
      (raw) => (raw.get('agent_parameters')['skill_penalty_pct_per_exhaustion'] = 0),
    );
    expect(noPenalty.agentParameters.skillPenaltyPctPerExhaustion).toBe(0);
    const tired = combatAgent('a1', { exhaustion: 100 });
    const { report } = fightCombat(
      {
        agents: [tired],
        enemies: [combatEnemy('e1', 'initiate')],
        combat: noPenalty.combatParameters,
        agentParameters: noPenalty.agentParameters,
      },
      injectedRandom({}),
    );
    expect(effectiveSkill(tired.state, noPenalty.agentParameters)).toBe(100);
    expect(report.outcome).toBe('Wiped');
  });
});
