import {
  EngineDefect,
  Rational,
  chance,
  seedRng,
  uniformBelow,
  uniformInt,
  type RngState,
} from '../kernel/index.ts';

/**
 * The source of every random outcome of game behavior. Each outcome is named as its rule names it, so that a test
 * or a random outcome override can fix it; see DEV, Random outcome overrides.
 */
export interface Random {
  /** A uniform whole-number outcome over the inclusive range lo to hi. */
  uniform(outcome: string, lo: number, hi: number): number;
  /** Whether an outcome with Probability p takes its stated value. */
  chance(outcome: string, p: Rational): boolean;
  /** A weighted choice: the Probability of each key is its weight over the sum of all weights. */
  weighted(outcome: string, entries: readonly (readonly [string, number])[]): string;
  /**
   * How narrowly the outcome just decided by `chance` with the Probability `n / steps` fell: a whole number from 0 to
   * `steps - 1` that is less than `n` exactly when the outcome took its stated value, each number that allows with
   * the same Probability. It is no random outcome: it draws nothing from the stream of random outcomes, so asking for
   * it changes no other outcome, and no override fixes it. A source may leave it out.
   */
  roll?(outcome: string, n: number, steps: number, taken: boolean): number;
  /**
   * COMBAT, Combat setup seed, A Mission's Combat: the random outcomes of one Combat, from a Detached seed of its own,
   * with the same pending random outcome overrides. A source may leave it out, e.g. one a test fixes; the Combat then
   * draws from this source.
   */
  fork?(seed: string): Random;
}

/** The generator of the rolls: that of the random outcomes at its current count, under another key. */
function rollRng(rng: RngState): RngState {
  const [a, b, c, d] = rng.key;
  return { key: [(a ^ 0x9e3779b9) >>> 0, b, c, d], counter: rng.counter };
}

/** A pending random outcome override: the named outcome takes this value when it is next decided. */
export interface RandomOverride {
  readonly outcome: string;
  readonly value: number | boolean | string;
}

/**
 * Random outcomes derived from the Campaign seed through the generator state in Campaign state, with pending
 * overrides applied first. An override is consumed by the outcome it fixes; an override whose value is not one of
 * the possible values of the outcome is discarded and the outcome is drawn as usual.
 */
export function seededRandom(rng: RngState, overrides: RandomOverride[]): Random {
  const take = (outcome: string): RandomOverride | null => {
    const index = overrides.findIndex((item) => item.outcome === outcome);
    if (index < 0) {
      return null;
    }
    const [found] = overrides.splice(index, 1);
    return found ?? null;
  };
  return {
    uniform(outcome, lo, hi) {
      if (hi < lo) {
        throw new EngineDefect(`Invalid range for ${outcome}: ${lo} to ${hi}`);
      }
      const override = take(outcome);
      if (
        override !== null &&
        typeof override.value === 'number' &&
        Number.isSafeInteger(override.value) &&
        override.value >= lo &&
        override.value <= hi
      ) {
        return override.value;
      }
      return uniformInt(rng, lo, hi);
    },
    chance(outcome, p) {
      const override = take(outcome);
      if (override !== null && typeof override.value === 'boolean') {
        const impossible = (override.value && p.n === 0n) || (!override.value && p.n === p.d);
        if (!impossible) {
          return override.value;
        }
      }
      return chance(rng, p);
    },
    fork(seed) {
      return seededRandom(seedRng(seed), overrides);
    },
    roll(_outcome, n, steps, taken) {
      const allowed = taken ? n : steps - n;
      if (allowed <= 0) {
        throw new EngineDefect(`No roll allows the outcome: ${n} of ${steps}`);
      }
      return (taken ? 0 : n) + Number(uniformBelow(rollRng(rng), BigInt(allowed)));
    },
    weighted(outcome, entries) {
      let total = 0n;
      for (const [, weight] of entries) {
        if (!Number.isSafeInteger(weight) || weight < 0) {
          throw new EngineDefect(`Invalid weight for ${outcome}`);
        }
        total += BigInt(weight);
      }
      if (total <= 0n) {
        throw new EngineDefect(`No weight for ${outcome}`);
      }
      const override = take(outcome);
      if (override !== null) {
        const wanted = String(override.value);
        if (entries.some(([key, weight]) => key === wanted && weight > 0)) {
          return wanted;
        }
      }
      let pick = uniformBelow(rng, total);
      for (const [key, weight] of entries) {
        if (pick < BigInt(weight)) {
          return key;
        }
        pick -= BigInt(weight);
      }
      throw new EngineDefect(`Weighted choice failed for ${outcome}`);
    },
  };
}

/**
 * Random outcomes fixed by a test: each named outcome takes the next injected value for that name. An outcome with
 * no injected value falls back to the given source, or is a defect when there is none.
 */
export function injectedRandom(
  injected: Readonly<Record<string, readonly (number | boolean | string)[]>>,
  fallback: Random | null = null,
): Random & { readonly used: string[] } {
  const queues = new Map(Object.entries(injected).map(([key, values]) => [key, [...values]]));
  const used: string[] = [];
  const next = (outcome: string): number | boolean | string | undefined => {
    used.push(outcome);
    return queues.get(outcome)?.shift();
  };
  const missing = (outcome: string): never => {
    throw new EngineDefect(`No injected value for the random outcome ${outcome}`);
  };
  return {
    used,
    uniform(outcome, lo, hi) {
      const value = next(outcome);
      if (typeof value === 'number') {
        if (value < lo || value > hi) {
          throw new EngineDefect(`Injected ${outcome} = ${value} is outside ${lo} to ${hi}`);
        }
        return value;
      }
      return fallback ? fallback.uniform(outcome, lo, hi) : missing(outcome);
    },
    chance(outcome, p) {
      const value = next(outcome);
      if (typeof value === 'boolean') {
        return value;
      }
      return fallback ? fallback.chance(outcome, p) : missing(outcome);
    },
    weighted(outcome, entries) {
      const value = next(outcome);
      if (value !== undefined) {
        return String(value);
      }
      return fallback ? fallback.weighted(outcome, entries) : missing(outcome);
    },
  };
}

export { Rational };
