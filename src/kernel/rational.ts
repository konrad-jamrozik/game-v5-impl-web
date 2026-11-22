import { EngineDefect } from './errors.ts';

/**
 * Exact rational arithmetic on bigint, as NUMBERS, Exact evaluation requires. A Rational is always held in lowest
 * terms with a positive divisor, so two equal values have equal parts.
 */
export type RationalLike = Rational | bigint | number;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export class Rational {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  /** The exact ratio n / d. A zero divisor has no value and is an internal invariant violation. */
  static from(n: bigint | number, d: bigint | number): Rational {
    let num = toBigInt(n);
    let den = toBigInt(d);
    if (den === 0n) {
      throw new EngineDefect('Division by zero');
    }
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    return g === 1n ? new Rational(num, den) : new Rational(num / g, den / g);
  }

  static of(value: RationalLike): Rational {
    return value instanceof Rational ? value : new Rational(toBigInt(value), 1n);
  }

  /** Reads a decimal number exactly as it is written, e.g. "0.5" is 1 / 2; never through a binary float. */
  static parseDecimal(text: string): Rational {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
    if (!match) {
      throw new EngineDefect(`Not a decimal number: ${text}`);
    }
    const [, sign, whole, fraction = ''] = match;
    const digits = BigInt(`${whole ?? '0'}${fraction}`);
    const scale = 10n ** BigInt(fraction.length);
    return Rational.from(sign === '-' ? -digits : digits, scale);
  }

  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);

  add(other: RationalLike): Rational {
    const o = Rational.of(other);
    return Rational.from(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(other: RationalLike): Rational {
    const o = Rational.of(other);
    return Rational.from(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(other: RationalLike): Rational {
    const o = Rational.of(other);
    return Rational.from(this.n * o.n, this.d * o.d);
  }

  div(other: RationalLike): Rational {
    const o = Rational.of(other);
    return Rational.from(this.n * o.d, this.d * o.n);
  }

  neg(): Rational {
    return new Rational(-this.n, this.d);
  }

  /** Negative, zero, or positive as this is less than, equal to, or greater than other. */
  cmp(other: RationalLike): number {
    const o = Rational.of(other);
    const left = this.n * o.d;
    const right = o.n * this.d;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  eq(other: RationalLike): boolean {
    return this.cmp(other) === 0;
  }
  lt(other: RationalLike): boolean {
    return this.cmp(other) < 0;
  }
  lte(other: RationalLike): boolean {
    return this.cmp(other) <= 0;
  }
  gt(other: RationalLike): boolean {
    return this.cmp(other) > 0;
  }
  gte(other: RationalLike): boolean {
    return this.cmp(other) >= 0;
  }

  isWhole(): boolean {
    return this.d === 1n;
  }

  /** Round down: the greatest whole number less than or equal to this. */
  floor(): bigint {
    const q = this.n / this.d;
    return this.n % this.d !== 0n && this.n < 0n ? q - 1n : q;
  }

  /** Round up: the least whole number greater than or equal to this. */
  ceil(): bigint {
    const q = this.n / this.d;
    return this.n % this.d !== 0n && this.n > 0n ? q + 1n : q;
  }

  static min(a: RationalLike, b: RationalLike): Rational {
    const x = Rational.of(a);
    return x.lte(b) ? x : Rational.of(b);
  }

  static max(a: RationalLike, b: RationalLike): Rational {
    const x = Rational.of(a);
    return x.gte(b) ? x : Rational.of(b);
  }

  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n.toString()}/${this.d.toString()}`;
  }
}

function toBigInt(value: bigint | number): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (!Number.isSafeInteger(value)) {
    throw new EngineDefect(`Not a whole number within the exact range: ${String(value)}`);
  }
  return BigInt(value);
}

/** Shorthand for Rational.of. */
export function q(value: RationalLike): Rational {
  return Rational.of(value);
}

/** Shorthand for the exact ratio n / d. */
export function ratio(n: bigint | number, d: bigint | number): Rational {
  return Rational.from(n, d);
}

/**
 * Turns an exact whole result into a stored quantity. A stored quantity outside the safe-integer range is reported
 * as an engine defect; see DEC-004.
 */
export function toStored(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new EngineDefect(`Stored quantity out of the supported range: ${value.toString()}`);
  }
  return Number(value);
}

/**
 * round down( n / d ) for whole numbers, exactly, without BigInt; null when a value it needs is outside the
 * safe-integer range, so that the caller falls back to exact Rational arithmetic. The binary quotient is only a guess:
 * it is corrected by whole-number products, which are exact while they stay in the safe-integer range.
 */
export function floorDivSafe(n: number, d: number): number | null {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) {
    return null;
  }
  const sign = d < 0 ? -1 : 1;
  const num = n * sign;
  const den = d * sign;
  let quotient = Math.floor(num / den);
  if (!Number.isSafeInteger(quotient) || !Number.isSafeInteger(Math.abs(quotient) * den + den)) {
    return null;
  }
  while (quotient * den > num) {
    quotient -= 1;
  }
  while ((quotient + 1) * den <= num) {
    quotient += 1;
  }
  return quotient;
}

/** round down( x ), as a stored quantity. */
export function roundDown(value: RationalLike): number {
  return toStored(Rational.of(value).floor());
}

/** round up( x ), as a stored quantity. */
export function roundUp(value: RationalLike): number {
  return toStored(Rational.of(value).ceil());
}

/**
 * NUMBERS, Decimal quantities: a Decimal quantity is held as its whole number of hundredths, e.g. 1.33 as 133. These
 * helpers move between that stored form and the exact value, never through a binary float.
 */
export function fromHundredths(hundredths: number): Rational {
  return Rational.from(hundredths, 100);
}

/** round down to hundredths( x ), as a Decimal quantity held in hundredths. */
export function roundDownToHundredths(value: RationalLike): number {
  return roundDown(Rational.of(value).mul(100));
}

/** round up to hundredths( x ), as a Decimal quantity held in hundredths. */
export function roundUpToHundredths(value: RationalLike): number {
  return roundUp(Rational.of(value).mul(100));
}

/** p percent of x, i.e. (p × x) / 100, evaluated exactly and not rounded. */
export function percentOf(p: RationalLike, x: RationalLike): Rational {
  return Rational.of(p).mul(x).div(100);
}

/** An exact Probability n / d, reported as a pair of whole numbers and never as a rounded decimal. */
export interface ProbabilityPair {
  readonly n: string;
  readonly d: string;
}

export function toProbabilityPair(value: Rational): ProbabilityPair {
  return { n: value.n.toString(), d: value.d.toString() };
}

/** Clamps a ratio to the Probability range 0 to 1, exactly. */
export function clampProbability(value: Rational): Rational {
  if (value.lt(0)) {
    return Rational.ZERO;
  }
  if (value.gt(1)) {
    return Rational.ONE;
  }
  return value;
}
