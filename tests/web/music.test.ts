/** MUSIC: Track titles, the playing order in rounds, the fades, and the gain. */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawRound, gain, stepToggleFade, trackFade, trackTitle } from '../../src/web/music.ts';

/** A random source that returns the given numbers in turn. */
function fixed(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('MUSIC: Soundtrack', () => {
  it('titles a Track by its file name without the extension, with underscores as spaces', () => {
    expect(trackTitle('Silent_Contact.opus')).toBe('Silent Contact');
    expect(trackTitle('../../assets/music/Black_Orbit_Watch.opus')).toBe('Black Orbit Watch');
    expect(trackTitle('../../assets/music/v03AI UFO 1.mp3')).toBe('v03AI UFO 1');
    expect(trackTitle('Silent Contact.mp3')).toBe(trackTitle('Silent_Contact.opus'));
  });

  it('holds a copy of the Soundtrack, every Track an Ogg Opus or MP3 file with a distinct title', () => {
    const files = readdirSync(new URL('../../assets/music/', import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => file.endsWith('.opus') || file.endsWith('.mp3'))).toBe(true);
    expect(files.some((file) => file.endsWith('.mp3'))).toBe(true);
    expect(new Set(files.map(trackTitle)).size).toBe(files.length);
  });
});

describe('MUSIC: Playing order', () => {
  const tracks = ['Depth Signal', 'Silent Contact', 'Unseen Sector'];

  it('plays every Track exactly once in each round', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const round = drawRound(tracks, null, fixed((seed % 10) / 10, 0.3, 0.7));
      expect([...round].sort()).toEqual([...tracks].sort());
    }
  });

  it('never starts a round with the last Track of the round before it', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(drawRound(tracks, 'Depth Signal', Math.random)[0]).not.toBe('Depth Signal');
    }
  });

  it('draws all four permitted orders of the second round', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(drawRound(tracks, 'Depth Signal', Math.random).join(','));
    }
    expect(seen.size).toBe(4);
  });

  it('repeats a single Track, and plays nothing from an empty Soundtrack', () => {
    expect(drawRound(['Only'], 'Only', Math.random)).toEqual(['Only']);
    expect(drawRound([], null, Math.random)).toEqual([]);
  });
});

describe('MUSIC: Fades and Loudness', () => {
  it('fades in over the first 3 seconds and out over the last 3 seconds', () => {
    expect(trackFade(0, 120)).toBe(0);
    expect(trackFade(1.5, 120)).toBe(0.5);
    expect(trackFade(60, 120)).toBe(1);
    expect(trackFade(118.5, 120)).toBe(0.5);
    expect(trackFade(120, 120)).toBe(0);
  });

  it('fades a Track shorter than 6 seconds over its halves', () => {
    expect(trackFade(1, 4)).toBe(0.5);
    expect(trackFade(2, 4)).toBe(1);
    expect(trackFade(3, 4)).toBe(0.5);
  });

  it('turns music off from the current fade factor at the rate of a full fade per second', () => {
    expect(stepToggleFade(1, 0, 0.5)).toBe(0.5);
    expect(stepToggleFade(0.5, 0, 0.5)).toBe(0);
    expect(stepToggleFade(0, 1, 1)).toBe(1);
  });

  it('computes gain = f × (v / 100)²', () => {
    expect(gain(1, 50)).toBe(0.25);
    expect(gain(0.5, 50)).toBe(0.125);
    expect(gain(1, 100)).toBe(1);
    expect(gain(1, 0)).toBe(0);
  });
});
