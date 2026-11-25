/** CRPLAY, Shots; SOUNDS, Combat replay Sounds: the moments of each shot, and what is heard as the playing passes them. */
import { describe, expect, it } from 'vite-plus/test';
import { buildGdrCatalog } from '../../src/gdr/catalog.ts';
import { RAW_GDR_FILES } from '../../src/gdr/generated/raw-gdrs.ts';
import { shotFamily, type ShotKind } from '../../src/web/combat-replay.ts';
import {
  T_HIT,
  attackerOffset,
  heardBetween,
  missShownAt,
  outlineGlow,
  shotMoments,
  type ShotGeometry,
} from '../../src/web/combat-replay-shots.ts';
import { REPLAY_SOUNDS, REPLAY_SOUND_LIMIT, replaySoundRate } from '../../src/web/sounds.ts';

const SHOTS: readonly ShotKind[] = [
  'blade',
  'light_pistol',
  'heavy_pistol',
  'rifle',
  'sighted_rifle',
  'machine_gun',
  'laser_pistol',
  'laser_rifle',
  'focused_laser_rifle',
];

const geometry: ShotGeometry = {
  from: [100, 100],
  to: [400, 100],
  aim: [400, 100],
  r: 10,
  cell: 28,
  far: 1000,
  sign: 1,
};

describe('CRPLAY: Shots', () => {
  it('knows the three kinds of shot', () => {
    expect(SHOTS.map(shotFamily)).toEqual([
      'blade',
      'kinetic',
      'kinetic',
      'kinetic',
      'kinetic',
      'kinetic',
      'energy',
      'energy',
      'energy',
    ]);
  });

  it('gives every Weapon of the Game build a shot the Combat replay draws', () => {
    for (const weapon of buildGdrCatalog(RAW_GDR_FILES).weapons.values()) {
      expect(SHOTS).toContain(weapon.shot);
    }
  });

  it('lets a kinetic round cross in at most a tenth of the attack', () => {
    for (const shot of SHOTS.filter((item) => shotFamily(item) === 'kinetic')) {
      const fired = shotMoments(shot, true).filter((moment) => moment.sound.startsWith('shot-'));
      const landed = shotMoments(shot, true).find((moment) => moment.sound === 'hit-kinetic');
      expect((landed?.at ?? 1) - (fired[0]?.at ?? 0)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it('moves the attacker of a blade to the defender and back, and kicks a rifle back when it fires', () => {
    const none = [expect.closeTo(0, 9), expect.closeTo(0, 9)];
    expect(attackerOffset(geometry, 'blade', 0, false)).toEqual(none);
    expect(attackerOffset(geometry, 'blade', T_HIT, false)[0]).toBeGreaterThan(200);
    expect(attackerOffset(geometry, 'blade', 1, false)[0]).toBeCloseTo(0, 5);
    expect(attackerOffset(geometry, 'rifle', 0.5, false)[0]).toBeLessThan(0);
    expect(attackerOffset(geometry, 'rifle', 0.3, false)).toEqual(none);
    // Under reduced motion nothing recoils.
    expect(attackerOffset(geometry, 'rifle', 0.5, true)).toEqual(none);
    expect(attackerOffset(geometry, 'light_pistol', 0.5, false)).toEqual(none);
  });

  it('outlines the defender only for a hit of the strongest energy shot, while it fades', () => {
    expect(outlineGlow('focused_laser_rifle', T_HIT + 0.05)).toBeGreaterThan(0);
    expect(outlineGlow('focused_laser_rifle', 0.3)).toBe(0);
    expect(outlineGlow('focused_laser_rifle', 1)).toBeCloseTo(0, 9);
    expect(outlineGlow('laser_rifle', T_HIT + 0.05)).toBe(0);
  });
});

describe('SOUNDS: Combat replay Sounds', () => {
  it('plays the shot Sound each time the Weapon fires: once per round of a machine gun, else once', () => {
    for (const shot of SHOTS) {
      const fired = shotMoments(shot, true).filter((moment) => moment.sound.startsWith('shot-'));
      expect(fired).toHaveLength(shot === 'machine_gun' ? 5 : 1);
      expect(fired[0]?.sound).toBe(`shot-${shot.replaceAll('_', '-')}`);
    }
  });

  it('plays one hit Sound of the kind of the shot as the shot lands', () => {
    const hitOf = (shot: ShotKind) =>
      shotMoments(shot, true)
        .filter((moment) => !moment.sound.startsWith('shot-'))
        .map((moment) => moment.sound);
    expect(hitOf('blade')).toEqual(['hit-blade']);
    expect(hitOf('machine_gun')).toEqual(['hit-kinetic']);
    expect(hitOf('laser_pistol')).toEqual(['hit-energy']);
  });

  it('plays miss-kinetic once for a kinetic shot that misses, and no further Sound for a blade or an energy shot', () => {
    const missOf = (shot: ShotKind) =>
      shotMoments(shot, false)
        .filter((moment) => !moment.sound.startsWith('shot-'))
        .map((moment) => moment.sound);
    expect(missOf('machine_gun')).toEqual(['miss-kinetic']);
    expect(missOf('rifle')).toEqual(['miss-kinetic']);
    expect(missOf('blade')).toEqual([]);
    expect(missOf('focused_laser_rifle')).toEqual([]);
    expect(missShownAt('rifle')).toBeCloseTo(T_HIT, 9);
  });

  it('names only Sounds of the Sound set, each at a moment of the attack', () => {
    for (const shot of SHOTS) {
      for (const hit of [true, false]) {
        for (const moment of shotMoments(shot, hit)) {
          expect(REPLAY_SOUNDS.has(moment.sound)).toBe(true);
          expect(moment.at).toBeGreaterThan(0);
          expect(moment.at).toBeLessThan(1);
        }
      }
    }
  });

  it('is heard as the playing passes a moment, and not again after it', () => {
    const replay = { attacks: [{ shot: 'rifle' as const, hit: true }] };
    const step = { a: 0, b: 1 };
    expect(heardBetween(replay, [{ ...step, from: 0, to: 0.4 }])).toEqual([]);
    expect(heardBetween(replay, [{ ...step, from: 0.4, to: 0.5 }])).toEqual([
      { sound: 'shot-rifle', attack: 0 },
    ]);
    expect(heardBetween(replay, [{ ...step, from: 0.5, to: 0.6 }])).toEqual([
      { sound: 'hit-kinetic', attack: 0 },
    ]);
    expect(heardBetween(replay, [{ ...step, from: 0.6, to: 1.2 }])).toEqual([]);
  });

  it('plays only one of the Sounds of one Sound name that start at the same time', () => {
    const replay = {
      attacks: [
        { shot: 'rifle' as const, hit: true },
        { shot: 'rifle' as const, hit: false },
        { shot: 'laser_rifle' as const, hit: true },
      ],
    };
    // With Instant on, a whole phase is one step, so its attacks reach each moment together.
    const heard = heardBetween(replay, [{ a: 0, b: 3, from: 0.4, to: 0.6 }]).map((item) => item.sound);
    expect(heard.toSorted()).toEqual([
      'hit-energy',
      'hit-kinetic',
      'miss-kinetic',
      'shot-laser-rifle',
      'shot-rifle',
    ]);
  });

  it('plays the Sounds of an attack up to 6% lower or higher, always the same for the same attack', () => {
    const rates = Array.from({ length: 200 }, (_, attack) => replaySoundRate(attack));
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.94);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.06);
    expect(new Set(rates.map((rate) => rate.toFixed(3))).size).toBeGreaterThan(20);
    expect(replaySoundRate(7)).toBe(replaySoundRate(7));
    expect(REPLAY_SOUND_LIMIT).toBe(6);
  });
});
