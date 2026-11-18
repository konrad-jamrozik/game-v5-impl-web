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
  it('titles a Track by its file name without the extension, unchanged', () => {
    expect(trackTitle('GEO-6.opus')).toBe('GEO-6');
    expect(trackTitle('../../assets/music/GEO-4.opus')).toBe('GEO-4');
    expect(trackTitle('../../assets/music/GEO-14.mp3')).toBe('GEO-14');
    expect(trackTitle('GEO-6.mp3')).toBe(trackTitle('GEO-6.opus'));
    expect(trackTitle('Silent_Contact.opus')).toBe('Silent_Contact');
  });

  it('holds a copy of the Soundtrack, every Track an Ogg Opus or MP3 file with a distinct title', () => {
    const files = readdirSync(new URL('../../assets/music/', import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => file.endsWith('.opus') || file.endsWith('.mp3'))).toBe(true);
    expect(files.some((file) => file.endsWith('.mp3'))).toBe(true);
    expect(new Set(files.map(trackTitle)).size).toBe(files.length);
  });

  it('leaves out every file that the Excluded tracks section of the music README names, e.g. GEO-3.opus', () => {
    const files = readdirSync(new URL('../../assets/music/', import.meta.url));
    for (const excluded of ['GEO-3.opus', 'GEO-12.opus', 'GEO-13.opus', 'GEO-14.mp3', 'GEO-15.mp3']) {
      expect(files).not.toContain(excluded);
    }
  });
});

describe('MUSIC: Playing order', () => {
  const tracks = ['GEO-5', 'GEO-6', 'GEO-7'];

  it('plays every Track exactly once in each round', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const round = drawRound(tracks, null, fixed((seed % 10) / 10, 0.3, 0.7));
      expect([...round].sort()).toEqual([...tracks].sort());
    }
  });

  it('never starts a round with the last Track of the round before it', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(drawRound(tracks, 'GEO-5', Math.random)[0]).not.toBe('GEO-5');
    }
  });

  it('draws all four permitted orders of the second round', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(drawRound(tracks, 'GEO-5', Math.random).join(','));
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
