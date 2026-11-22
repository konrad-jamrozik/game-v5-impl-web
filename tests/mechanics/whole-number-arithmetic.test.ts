/**
 * Tests of NUMBERS, Exact evaluation, for the whole-number forms of effective skill and the Combat rating of a side:
 * each must equal the exact Rational evaluation of its formula, which these tests carry out independently, for any
 * values, including ones whose products leave the safe-integer range and so fall back to Rational.
 */
import { describe, expect, it } from 'vite-plus/test';
import { floorDivSafe, fromHundredths, q, roundDown, roundUp } from '../../src/kernel/index.ts';
import { effectiveSkill, exhaustionOf, penaltyFactor } from '../../src/engine/mechanics/agents/agents.ts';
import { rateSide, ratingFactor, type CombatantState } from '../../src/engine/mechanics/combat/combat.ts';
import { gdrs } from '../helpers/game.ts';

/** A fixed sequence of pseudo-random whole numbers, so that every run checks the same values. */
function numbers(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % (max + 1);
  };
}

const exactEffectiveSkill = (c: CombatantState) =>
  roundDown(
    fromHundredths(c.skillHundredths)
      .mul(fromHundredths(c.currentHealthHundredths))
      .mul(penaltyFactor(roundUp(fromHundredths(c.exactExhaustionHundredths)), gdrs.agentParameters))
      .div(c.maxHealth * 100),
  );

/** COMBAT, Combat rating, by its definition: the largest whole R ≥ 0 with R^q ≤ S^q × n^p, searched upward. */
function exactRating(side: readonly CombatantState[]): number {
  const sum = side.reduce(
    (acc, c) => acc.add(q(exactEffectiveSkill(c)).mul(ratingFactor(c, gdrs.combatParameters))),
    q(0),
  );
  const exponent = gdrs.combatParameters.ratingTeamSizeExponent.sub(1);
  const fits = (r: bigint) =>
    r ** exponent.d * sum.d ** exponent.d <= sum.n ** exponent.d * BigInt(side.length) ** exponent.n;
  let r = 0n;
  while (fits(r + 1n)) {
    r += 1n;
  }
  return Number(r);
}

function combatant(next: (max: number) => number, scale = 1): CombatantState {
  return {
    skillHundredths: next(20_000 * scale),
    currentHealthHundredths: next(6_000 * scale),
    maxHealth: 1 + next(60 * scale),
    exactExhaustionHundredths: next(4_000),
    weaponDamage: next(40),
    armor: next(40),
  } as CombatantState;
}

describe('NUMBERS: whole-number forms of effective skill and the Combat rating', () => {
  it('round down a quotient exactly, and give way to Rational outside the safe-integer range', () => {
    expect(floorDivSafe(7, 2)).toBe(3);
    expect(floorDivSafe(-7, 2)).toBe(-4);
    expect(floorDivSafe(7, -2)).toBe(-4);
    expect(floorDivSafe(2 ** 52 + 1, 3)).toBe(Number((2n ** 52n + 1n) / 3n));
    expect(floorDivSafe(2 ** 53, 3)).toBeNull();
    expect(exhaustionOf({ exactExhaustionHundredths: 101 })).toBe(2);
    expect(exhaustionOf({ exactExhaustionHundredths: 100 })).toBe(1);
    expect(exhaustionOf({ exactExhaustionHundredths: 0 })).toBe(0);
  });

  it('give the effective skill of the exact formula', () => {
    const next = numbers(7);
    for (let i = 0; i < 2000; i += 1) {
      const c = combatant(next, i % 10 === 0 ? 10_000_000 : 1);
      expect(effectiveSkill(c, gdrs.agentParameters)).toBe(exactEffectiveSkill(c));
    }
  });

  it('give the Combat rating of the exact formula for sides of 1 to 12 Combatants', () => {
    const next = numbers(11);
    for (let i = 0; i < 300; i += 1) {
      const side = Array.from({ length: 1 + (i % 12) }, () => combatant(next));
      const members = side.map((state) => ({
        effectiveSkill: effectiveSkill(state, gdrs.agentParameters),
        state,
      }));
      expect(rateSide(members, gdrs.combatParameters)).toBe(exactRating(side));
    }
  });
});
