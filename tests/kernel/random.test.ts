import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { chance, isPermittedSeed, ratio, seedRng, uniformBelow, uniformInt } from '../../src/kernel/index.ts';

describe('Seeded generator', () => {
  it('gives the same values for the same seed and different values for another seed', () => {
    const a = seedRng('seed one');
    const b = seedRng('seed one');
    const c = seedRng('seed two');
    const drawsA = Array.from({ length: 50 }, () => uniformInt(a, 0, 1_000_000));
    const drawsB = Array.from({ length: 50 }, () => uniformInt(b, 0, 1_000_000));
    const drawsC = Array.from({ length: 50 }, () => uniformInt(c, 0, 1_000_000));
    expect(drawsA).toEqual(drawsB);
    expect(drawsA).not.toEqual(drawsC);
  });

  it('distinguishes seeds that differ only in case or spacing', () => {
    expect(seedRng('abc').key).not.toEqual(seedRng('ABC').key);
    expect(seedRng('run 3').key).not.toEqual(seedRng('run  3').key);
  });

  it('keeps a uniform whole-number outcome inside its inclusive range', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -1000, max: 1000 }), fc.nat(2000), (seed, lo, width) => {
        const rng = seedRng(seed);
        const value = uniformInt(rng, lo, lo + width);
        return value >= lo && value <= lo + width;
      }),
    );
  });

  it('NUMBERS: Uniform whole-number outcomes give each value the same Probability', () => {
    const counts = new Array<number>(11).fill(0);
    for (let s = 0; s < 22000; s += 1) {
      const rng = seedRng(`campaign-${s}`);
      counts[uniformInt(rng, 5, 15) - 5]! += 1;
    }
    for (const count of counts) {
      // Expected 2000 each; the tolerance is more than six standard deviations.
      expect(count).toBeGreaterThan(1700);
      expect(count).toBeLessThan(2300);
    }
  });

  it('NUMBERS: Probability comparison takes the value in n / d of Campaigns', () => {
    let hits = 0;
    const total = 29000;
    for (let s = 0; s < total; s += 1) {
      if (chance(seedRng(`p-${s}`), ratio(25, 29))) {
        hits += 1;
      }
    }
    expect(hits).toBeGreaterThan(25000 - 400);
    expect(hits).toBeLessThan(25000 + 400);
    expect(chance(seedRng('x'), ratio(0, 1))).toBe(false);
    expect(chance(seedRng('x'), ratio(1, 1))).toBe(true);
  });

  it('DETERM: Independent outcomes', () => {
    let both = 0;
    const total = 20000;
    for (let s = 0; s < total; s += 1) {
      const rng = seedRng(`i-${s}`);
      const first = chance(rng, ratio(3, 5));
      const second = chance(rng, ratio(3, 5));
      if (first && second) {
        both += 1;
      }
    }
    // Expected 36 percent.
    expect(both / total).toBeGreaterThan(0.34);
    expect(both / total).toBeLessThan(0.38);
  });

  it('handles ranges wider than 32 bits exactly', () => {
    const rng = seedRng('wide');
    const range = 2n ** 70n + 12345n;
    for (let i = 0; i < 100; i += 1) {
      const value = uniformBelow(rng, range);
      expect(value >= 0n && value < range).toBe(true);
    }
  });

  it('rejects an inverted range as an internal invariant violation', () => {
    expect(() => uniformInt(seedRng('x'), 5, 4)).toThrow();
  });
});

describe('DETERM: Campaign seed', () => {
  it('Seed length limits', () => {
    expect(isPermittedSeed('a'.repeat(64))).toBe(true);
    expect(isPermittedSeed('a'.repeat(65))).toBe(false);
    expect(isPermittedSeed('')).toBe(false);
    expect(isPermittedSeed('café')).toBe(false);
    expect(isPermittedSeed('tab\there')).toBe(false);
    expect(isPermittedSeed(' ~')).toBe(true);
    expect(isPermittedSeed(42)).toBe(false);
  });
});
