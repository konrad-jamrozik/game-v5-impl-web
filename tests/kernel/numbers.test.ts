/** Tests, from the former Acceptance examples, of NUMBERS. */
import { describe, expect, it } from 'vitest';
import {
  Rational,
  clampProbability,
  percentOf,
  q,
  ratio,
  roundDown,
  roundUp,
  seedRng,
  toProbabilityPair,
  uniformInt,
} from '../../src/kernel/index.ts';

const d = (text: string) => Rational.parseDecimal(text);

describe('NUMBERS: examples', () => {
  it('Round up a fraction', () => {
    expect(roundUp(percentOf(2, 30))).toBe(1);
    expect(roundDown(percentOf(2, 30))).toBe(0);
  });

  it('Round up an exact whole value', () => {
    expect(roundUp(percentOf(2, 50))).toBe(1);
    expect(roundUp(percentOf(2, 100))).toBe(2);
  });

  it('Bounds from a base and a ratio, even base', () => {
    const half = d('0.5');
    expect(roundUp(q(10).mul(q(1).sub(half)))).toBe(5);
    expect(roundDown(q(10).mul(q(1).add(half)))).toBe(15);
  });

  it('Bounds from a base and a ratio, other bases', () => {
    expect(roundUp(q(22).mul(d('0.5')))).toBe(11);
    expect(roundDown(q(22).mul(d('1.5')))).toBe(33);
    expect(roundUp(q(14).mul(d('0.5')))).toBe(7);
    expect(roundDown(q(14).mul(d('1.5')))).toBe(21);
  });

  it('Bounds from a base and a ratio, odd base', () => {
    expect(roundUp(q(15).mul(d('0.5')))).toBe(8);
    expect(roundDown(q(15).mul(d('1.5')))).toBe(22);
  });

  it('Degenerate range', () => {
    const rng = seedRng('degenerate');
    for (let i = 0; i < 20; i += 1) {
      expect(uniformInt(rng, 1, 1)).toBe(1);
    }
  });

  it('Negative rounding', () => {
    expect(roundDown(d('-0.5'))).toBe(-1);
    expect(roundUp(d('-0.5'))).toBe(0);
    expect(roundDown(d('-2.4'))).toBe(-3);
    expect(roundUp(d('-2.4'))).toBe(-2);
  });

  it('Rounding table', () => {
    const rows: [string, number, number][] = [
      ['2.4', 2, 3],
      ['2', 2, 2],
      ['0.6', 0, 1],
      ['0', 0, 0],
      ['-0.5', -1, 0],
      ['-2.4', -3, -2],
      ['7.5', 7, 8],
    ];
    for (const [text, down, up] of rows) {
      expect(roundDown(d(text))).toBe(down);
      expect(roundUp(d(text))).toBe(up);
    }
  });

  it('Exact ratio, same Probability', () => {
    expect(ratio(10000, 11600).eq(ratio(25, 29))).toBe(true);
    expect(toProbabilityPair(ratio(10000, 11600))).toEqual({ n: '25', d: '29' });
  });

  it('Clamping', () => {
    expect(clampProbability(ratio(6, 5)).eq(1)).toBe(true);
    expect(clampProbability(ratio(2, 5)).eq(ratio(2, 5))).toBe(true);
    expect(clampProbability(ratio(-3, 10)).eq(0)).toBe(true);
  });

  it('Rounding point', () => {
    expect(roundDown(q(8).mul(2).div(3))).toBe(5);
    expect(roundDown(ratio(8, 3)) * 2).toBe(4);
  });

  it('Percentage points are added, not multiplied', () => {
    expect(40 + 3).toBe(43);
    expect(percentOf(3, 40).eq(d('1.2'))).toBe(true);
  });

  it('Exact evaluation: no floating-point drift and no size limit', () => {
    expect(d('0.1').add(d('0.2')).eq(d('0.3'))).toBe(true);
    const big = q(10n ** 40n)
      .mul(3)
      .div(7);
    expect(big.floor()).toBe((10n ** 40n * 3n) / 7n);
    expect(() => ratio(1, 0)).toThrow();
  });
});
