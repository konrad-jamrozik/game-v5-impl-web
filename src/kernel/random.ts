import { EngineDefect } from './errors.ts';
import type { Rational } from './rational.ts';

/**
 * A counter-based generator of 32-bit whole numbers, written with integer operations only so that it gives the same
 * values on every machine; see DEC-005. Its state is two stored quantities kept in Campaign state: the key, derived
 * once from the Campaign seed, and the count of values drawn so far.
 */
export interface RngState {
  /** Four 32-bit whole numbers derived from the Campaign seed. */
  readonly key: readonly [number, number, number, number];
  /** How many 32-bit values have been drawn. */
  counter: number;
}

function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Derives the generator key from the Campaign seed text. */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return { key: [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0], counter: 0 };
}

/** The 32-bit value at one counter position. It reads no state other than its arguments. */
export function valueAt(key: readonly [number, number, number, number], counter: number): number {
  const lo = counter >>> 0;
  const hi = Math.floor(counter / 0x100000000) >>> 0;
  let a = (key[0] ^ lo) >>> 0;
  let b = (key[1] ^ hi) >>> 0;
  let c = key[2];
  let d = key[3];
  for (let round = 0; round < 4; round += 1) {
    a = fmix32(a + Math.imul(b, 0x9e3779b1) + round);
    b = fmix32((b ^ a) + c);
    c = fmix32((c + d) ^ a);
    d = fmix32(d + b + Math.imul(c, 0x85ebca77));
  }
  return (a ^ b ^ c ^ d) >>> 0;
}

/** Draws the next 32-bit value and advances the counter. */
export function nextU32(state: RngState): number {
  const value = valueAt(state.key, state.counter);
  state.counter += 1;
  return value;
}

/**
 * A whole number from 0 up to, and not including, `range`, each with the same Probability. Rejection sampling makes
 * the distribution exact for every range.
 */
export function uniformBelow(state: RngState, range: bigint): bigint {
  if (range <= 0n) {
    throw new EngineDefect(`Empty range for a uniform outcome: ${range.toString()}`);
  }
  if (range === 1n) {
    return 0n;
  }
  let words = 1;
  let span = 0x100000000n;
  while (span < range) {
    span *= 0x100000000n;
    words += 1;
  }
  const limit = span - (span % range);
  for (;;) {
    let value = 0n;
    for (let i = 0; i < words; i += 1) {
      value = value * 0x100000000n + BigInt(nextU32(state));
    }
    if (value < limit) {
      return value % range;
    }
  }
}

/** A uniform whole-number outcome over the inclusive range lo to hi; see NUMBERS, Uniform whole-number outcomes. */
export function uniformInt(state: RngState, lo: number, hi: number): number {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo) {
    throw new EngineDefect(`Invalid range for a uniform outcome: ${lo} to ${hi}`);
  }
  return lo + Number(uniformBelow(state, BigInt(hi) - BigInt(lo) + 1n));
}

/** Decides exactly whether an outcome with Probability p takes its stated value. */
export function chance(state: RngState, p: Rational): boolean {
  if (p.lt(0) || p.gt(1)) {
    throw new EngineDefect(`Probability outside 0 to 1: ${p.toString()}`);
  }
  if (p.n === 0n) {
    return false;
  }
  if (p.n === p.d) {
    return true;
  }
  return uniformBelow(state, p.d) < p.n;
}
