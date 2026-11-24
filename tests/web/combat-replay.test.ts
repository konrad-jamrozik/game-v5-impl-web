/** CRPLAY: what the Combat replay shows of a Combat report, and how its playback steps through the Combat log. */
import { describe, expect, it } from 'vite-plus/test';
import type { CombatReport } from '../../src/engine/index.ts';
import {
  BATTLEFIELD_CELLS,
  advance,
  buildReplay,
  enemyLook,
  jumpTo,
  newPlayback,
  phaseEnd,
  phaseStart,
  playTo,
  rankInsignia,
  ratingRanks,
  ratingsAt,
  roundEnd,
  settledIndex,
  shownRange,
  stepBack,
  type PlaybackSettings,
  type ReplaySource,
} from '../../src/web/combat-replay.ts';

type Attack = CombatReport['log'][number];
type Participant = CombatReport['participants'][number];

function participant(id: string, side: 'agent' | 'enemy', skill: number, armor = 0): Participant {
  return {
    id,
    side,
    start: {
      skillHundredths: skill * 100,
      currentHealthHundredths: 3000,
      maxHealth: 30,
      exhaustion: 0,
      weaponDamage: 10,
      armor,
      effectiveSkill: skill,
      incapacitated: false,
    },
    final: {
      currentHealthHundredths: 3000,
      currentArmor: armor,
      exhaustion: 0,
      effectiveSkill: skill,
      condition: 'ableToFight',
    },
    damageDealtHundredths: 0,
    damageTakenHundredths: 0,
    combatExperience: side === 'agent' ? 0 : null,
  };
}

function attack(round: number, attacker: string, defender: string, extra: Partial<Attack> = {}): Attack {
  return {
    round,
    attacker,
    defender,
    a: 100,
    d: 100,
    hitChance: 500,
    hit: false,
    damage: null,
    armorRemoved: 0,
    healthRemovedHundredths: 0,
    ammoSpent: null,
    outOfAmmo: null,
    attackerAfter: { currentHealthHundredths: 3000, exhaustion: 1 },
    defenderAfter: { currentHealthHundredths: 3000, exhaustion: 0, currentArmor: 0 },
    defenderDead: false,
    defenderIncapacitated: false,
    attackerIncapacitated: false,
    ...extra,
  };
}

/**
 * Two Agents against two Enemies over two Combat rounds: round 1 has two Agent attacks and two Enemy attacks, round 2
 * one Agent attack that kills enemy-1.
 */
function report(): CombatReport {
  return {
    mission: 'mission-7',
    outcome: 'Won',
    rounds: 2,
    agents: ['agent-1', 'agent-2'],
    enemies: ['enemy-1', 'enemy-2'],
    participants: [
      participant('agent-1', 'agent', 100),
      participant('agent-2', 'agent', 150),
      participant('enemy-1', 'enemy', 40, 20),
      participant('enemy-2', 'enemy', 300),
    ],
    ratings: [
      { round: 0, agents: 500, enemies: 400 },
      { round: 1, agents: 450, enemies: 300 },
      { round: 2, agents: 440, enemies: 0 },
    ],
    log: [
      attack(1, 'agent-1', 'enemy-1', {
        hit: true,
        damage: 25,
        armorRemoved: 20,
        healthRemovedHundredths: 500,
        ammoSpent: 'rounds',
        defenderAfter: { currentHealthHundredths: 2500, exhaustion: 0, currentArmor: 0 },
      }),
      attack(1, 'agent-2', 'enemy-2', { outOfAmmo: 'rounds' }),
      attack(1, 'enemy-1', 'agent-1'),
      attack(1, 'enemy-2', 'agent-2', { attackerIncapacitated: true }),
      attack(2, 'agent-1', 'enemy-1', {
        hit: true,
        damage: 30,
        healthRemovedHundredths: 2500,
        ammoSpent: 'cells',
        defenderAfter: { currentHealthHundredths: 0, exhaustion: 0, currentArmor: 0 },
        defenderDead: true,
      }),
    ],
    ammo: [],
  };
}

const source: ReplaySource = {
  nameOf: (id) => id.toUpperCase(),
  enemyOrder: (id) => (id === 'enemy-1' ? 0 : 4),
  enemyAmmoType: (id) => (id === 'enemy-1' ? 'cells' : null),
  shotOfAmmoType: (ammoType) => (ammoType === 'cells' ? 'beam' : ammoType === 'rounds' ? 'burst' : undefined),
  seed: 'mission-7',
};

describe('CRPLAY: Rank insignia thresholds', () => {
  it('takes the Rank insignia from base skill rounded down, and none below the first threshold', () => {
    expect(rankInsignia(9999)).toBeNull();
    expect(rankInsignia(10000)).toEqual({ kind: 'chevron', count: 1 });
    expect(rankInsignia(11999)).toEqual({ kind: 'chevron', count: 1 });
    expect(rankInsignia(12000)).toEqual({ kind: 'chevron', count: 2 });
    expect(rankInsignia(14500)).toEqual({ kind: 'chevron', count: 3 });
    expect(rankInsignia(17500)).toEqual({ kind: 'bar', count: 1 });
    expect(rankInsignia(21000)).toEqual({ kind: 'bar', count: 2 });
    expect(rankInsignia(25000)).toEqual({ kind: 'bar', count: 3 });
    expect(rankInsignia(30000)).toEqual({ kind: 'star', count: 1 });
    expect(rankInsignia(45000)).toEqual({ kind: 'star', count: 2 });
    expect(rankInsignia(69999)).toEqual({ kind: 'star', count: 2 });
    expect(rankInsignia(70000)).toEqual({ kind: 'star', count: 3 });
  });
});

describe('CRPLAY: Figures', () => {
  it('gives every three EnemyArchetypes of the EnemyArchetype order a shape, and each of them a colour', () => {
    expect([0, 1, 2].map(enemyLook)).toEqual([
      { shape: 'triangle', colour: 'amber' },
      { shape: 'triangle', colour: 'danger' },
      { shape: 'triangle', colour: 'violet' },
    ]);
    expect(enemyLook(3)).toEqual({ shape: 'square', colour: 'amber' });
    expect(enemyLook(7)).toEqual({ shape: 'pentagon', colour: 'danger' });
    expect(enemyLook(11)).toEqual({ shape: 'hexagon', colour: 'violet' });
  });

  it('names each figure, ranks it, and gives only an Enemy a look', () => {
    const replay = buildReplay(report(), source);
    expect(replay.figures.map((figure) => figure.name)).toEqual(['AGENT-1', 'AGENT-2', 'ENEMY-1', 'ENEMY-2']);
    expect(replay.figures.map((figure) => figure.look)).toEqual([
      null,
      null,
      { shape: 'triangle', colour: 'amber' },
      { shape: 'square', colour: 'danger' },
    ]);
    expect(replay.figures.map((figure) => figure.rank?.kind ?? null)).toEqual([
      'chevron',
      'chevron',
      null,
      'star',
    ]);
  });
});

describe('CRPLAY: Battlefield layout', () => {
  it('stands the Agents on the left and the Enemies on the right, each side from top to bottom in its order', () => {
    const { figures } = buildReplay(report(), source);
    const agents = figures.filter((figure) => figure.side === 'agent');
    const enemies = figures.filter((figure) => figure.side === 'enemy');
    expect(Math.max(...agents.map((figure) => figure.x))).toBeLessThan(BATTLEFIELD_CELLS / 2);
    expect(Math.min(...enemies.map((figure) => figure.x))).toBeGreaterThanOrEqual(BATTLEFIELD_CELLS / 2);
    for (const side of [agents, enemies]) {
      expect(side.map((figure) => figure.y)).toEqual(
        [...side.map((figure) => figure.y)].sort((a, b) => a - b),
      );
    }
    for (const figure of figures) {
      expect(figure.y).toBeGreaterThanOrEqual(0);
      expect(figure.y).toBeLessThan(BATTLEFIELD_CELLS);
    }
  });

  it('shows the same Combat in the same cells every time, and no two figures in one cell', () => {
    const crowd: CombatReport = {
      ...report(),
      agents: Array.from({ length: 14 }, (_, k) => `agent-${k}`),
      enemies: Array.from({ length: 40 }, (_, k) => `enemy-${k}`),
      participants: [
        ...Array.from({ length: 14 }, (_, k) => participant(`agent-${k}`, 'agent', 100)),
        ...Array.from({ length: 40 }, (_, k) => participant(`enemy-${k}`, 'enemy', 40)),
      ],
      log: [],
    };
    const first = buildReplay(crowd, source).figures.map((figure) => `${figure.x},${figure.y}`);
    const second = buildReplay(crowd, source).figures.map((figure) => `${figure.x},${figure.y}`);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('ranks the Combat ratings of a side from 0 to 1, equal ones sharing the middle of their places', () => {
    expect(ratingRanks([30, 10, 20])).toEqual([1, 0, 0.5]);
    expect(ratingRanks([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    expect(ratingRanks([7])).toEqual([0.5]);
    expect(ratingRanks([1, 9, 9])).toEqual([0, 0.75, 0.75]);
  });

  it('stands the Combatants of a lower Combat rating nearer the other side, and the elite behind them', () => {
    const rated = (id: string, side: 'agent' | 'enemy', combatRating: number): Participant => {
      const who = participant(id, side, 100);
      return { ...who, start: { ...who.start, combatRating } };
    };
    // Every second Combatant of each side is weak, so that strength does not follow the order of the side.
    const ratingOf = (k: number) => (k % 2 === 0 ? 50 : 900);
    const mixed: CombatReport = {
      ...report(),
      agents: Array.from({ length: 12 }, (_, k) => `agent-${k}`),
      enemies: Array.from({ length: 12 }, (_, k) => `enemy-${k}`),
      participants: [
        ...Array.from({ length: 12 }, (_, k) => rated(`agent-${k}`, 'agent', ratingOf(k))),
        ...Array.from({ length: 12 }, (_, k) => rated(`enemy-${k}`, 'enemy', ratingOf(k))),
      ],
      log: [],
    };
    const { figures } = buildReplay(mixed, source);
    const columns = (side: 'agent' | 'enemy', weak: boolean) =>
      figures
        .filter((figure, index) => figure.side === side && (index % 2 === 0) === weak)
        .map((figure) => figure.x);
    const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    // The Agents face right, so their front line is their highest column; the Enemies face left. Chance moves a
    // figure a little, so the weak and the elite may meet in one column, and never pass each other.
    expect(Math.min(...columns('agent', true))).toBeGreaterThanOrEqual(Math.max(...columns('agent', false)));
    expect(mean(columns('agent', true))).toBeGreaterThan(mean(columns('agent', false)) + 1);
    expect(Math.max(...columns('enemy', true))).toBeLessThanOrEqual(Math.min(...columns('enemy', false)));
    expect(mean(columns('enemy', true))).toBeLessThan(mean(columns('enemy', false)) - 1);
  });

  it('gives a side with more Combatants than its columns hold further columns, one figure to a cell', () => {
    const horde: CombatReport = {
      ...report(),
      agents: ['agent-0'],
      enemies: Array.from({ length: 220 }, (_, k) => `enemy-${k}`),
      participants: [
        participant('agent-0', 'agent', 100),
        ...Array.from({ length: 220 }, (_, k) => participant(`enemy-${k}`, 'enemy', 40 + (k % 9) * 50)),
      ],
      log: [],
    };
    const cells = buildReplay(horde, source).figures.map((figure) => `${figure.x},${figure.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe('CRPLAY: Shots', () => {
  it("follows the AmmoType of the round an Agent spent, and of an Enemy's Weapon", () => {
    const { attacks } = buildReplay(report(), source);
    // agent-1 spent a round of `rounds`, then one of `cells`; enemy-1's Weapon fires `cells`.
    expect(attacks.map((item) => item.shot)).toEqual(['burst', 'blade', 'beam', 'blade', 'beam']);
  });

  it('makes an attack with a Weapon that has no ammo_type a blade', () => {
    const { attacks } = buildReplay(report(), source);
    // agent-2 had run out of Ammo and fought with the Fallback Weapon; enemy-2's Weapon has no ammo_type.
    expect(attacks[1]?.shot).toBe('blade');
    expect(attacks[3]?.shot).toBe('blade');
  });

  it("follows the AmmoType of an Agent's Weapon when the source names it, e.g. for a Detached Combat", () => {
    const { attacks } = buildReplay(report(), {
      ...source,
      agentAmmoType: (id) => (id === 'agent-2' ? 'cells' : null),
    });
    expect(attacks.map((item) => item.shot)).toEqual(['blade', 'beam', 'beam', 'blade', 'blade']);
  });
});

describe('CRPLAY: the values a figure shows', () => {
  it('holds the values of every Combatant at Combat start and after each attack', () => {
    const replay = buildReplay(report(), source);
    expect(replay.frames).toHaveLength(6);
    expect(replay.frames[0]?.[2]).toEqual({
      healthHundredths: 3000,
      armor: 20,
      exhaustion: 0,
      condition: 'ableToFight',
    });
    // The first hit takes all of enemy-1's armor and 5 of its health.
    expect(replay.frames[1]?.[2]).toMatchObject({ healthHundredths: 2500, armor: 0 });
    expect(replay.frames[1]?.[0]).toMatchObject({ exhaustion: 1 });
    expect(replay.frames[4]?.[3]?.condition).toBe('incapacitated');
    expect(replay.frames[5]?.[2]).toMatchObject({ healthHundredths: 0, condition: 'dead' });
  });

  it('reads the Combat ratings as of the last Combat round completed', () => {
    const combat = report();
    const replay = buildReplay(combat, source);
    expect(ratingsAt(combat, replay, 0)).toEqual({ agents: 500, enemies: 400 });
    expect(ratingsAt(combat, replay, 3)).toEqual({ agents: 500, enemies: 400 });
    expect(ratingsAt(combat, replay, 4)).toEqual({ agents: 450, enemies: 300 });
    expect(ratingsAt(combat, replay, 5)).toEqual({ agents: 440, enemies: 0 });
  });
});

describe('CRPLAY: Playback', () => {
  const settings: PlaybackSettings = { speedMs: 1000, delayMs: 250, overlap: false, instant: false };

  it('finds the phases and the Combat rounds in the Combat log', () => {
    const replay = buildReplay(report(), source);
    expect(phaseEnd(replay, 0)).toBe(2);
    expect(phaseEnd(replay, 2)).toBe(4);
    expect(roundEnd(replay, 1)).toBe(4);
    expect(roundEnd(replay, 4)).toBe(5);
    expect(phaseStart(replay, 3)).toBe(2);
    expect(phaseStart(replay, 4)).toBe(4);
  });

  it('plays one attack after another, each for the Speed', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    playTo(playback, replay, replay.attacks.length, false);
    advance(playback, replay, 16, settings);
    expect(playback.index).toBe(1);
    expect(playback.active).toHaveLength(1);
    advance(playback, replay, 500, settings);
    expect(playback.index).toBe(1);
    expect(settledIndex(playback)).toBe(0);
    advance(playback, replay, 500, settings);
    // The first attack has finished and the second has started in its place.
    expect(playback.index).toBe(2);
    expect(playback.active).toHaveLength(1);
    expect(settledIndex(playback)).toBe(1);
  });

  it('stops at the target and when every step has finished', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    playTo(playback, replay, 1, true);
    advance(playback, replay, 16, settings);
    expect(playback.playing).toBe(true);
    advance(playback, replay, 1000, settings);
    expect(playback.playing).toBe(false);
    expect(playback.index).toBe(1);
    expect(shownRange(playback, replay, false)).toEqual([0, 1]);
  });

  it('with Overlap on, starts the next attack a Delay after the last one started, across phases', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    const overlapping = { ...settings, overlap: true };
    playTo(playback, replay, replay.attacks.length, false);
    advance(playback, replay, 10, overlapping);
    advance(playback, replay, 250, overlapping);
    advance(playback, replay, 250, overlapping);
    // Three attacks play at once, the third of them in the Enemies' phase.
    expect(playback.index).toBe(3);
    expect(playback.active).toHaveLength(3);
    expect(settledIndex(playback)).toBe(0);
  });

  it('with a Delay longer than the Speed, waits out the Delay after an attack has finished', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    const slow = { speedMs: 100, delayMs: 1000, overlap: true, instant: false };
    playTo(playback, replay, replay.attacks.length, false);
    advance(playback, replay, 10, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    expect(playback.index).toBe(1);
    expect(playback.active).toHaveLength(0);
    expect(playback.playing).toBe(true);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    advance(playback, replay, 100, slow);
    expect(playback.index).toBe(2);
  });

  it('with Instant on, plays a whole phase as one step', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    const instant = { ...settings, instant: true };
    playTo(playback, replay, phaseEnd(replay, 0), true);
    advance(playback, replay, 16, instant);
    expect(playback.active).toEqual([{ a: 0, b: 2, t: 0 }]);
    expect(shownRange(playback, replay, true)).toEqual([0, 2]);
    advance(playback, replay, 1000, instant);
    expect(playback.playing).toBe(false);
    expect(shownRange(playback, replay, true)).toEqual([0, 2]);
  });

  it('goes back to before the last attack, or with Instant on the last phase, and drops steps still playing', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    jumpTo(playback, replay, 4);
    stepBack(playback, replay, false);
    expect(playback.index).toBe(3);
    jumpTo(playback, replay, 4);
    stepBack(playback, replay, true);
    expect(playback.index).toBe(2);
    playTo(playback, replay, replay.attacks.length, true);
    advance(playback, replay, 16, settings);
    expect(playback.index).toBe(3);
    stepBack(playback, replay, false);
    expect(playback.index).toBe(2);
    expect(playback.active).toHaveLength(0);
    expect(playback.playing).toBe(false);
  });

  it('keeps a jump within the Combat log', () => {
    const replay = buildReplay(report(), source);
    const playback = newPlayback();
    jumpTo(playback, replay, 99);
    expect(playback.index).toBe(5);
    jumpTo(playback, replay, -3);
    expect(playback.index).toBe(0);
    expect(shownRange(playback, replay, false)).toEqual([0, 0]);
  });
});
