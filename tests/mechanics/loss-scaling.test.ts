/** Tests of MISSION, Loss scaling: Loss severity and the scaled Consequences of a Lost Response Mission. */
import { describe, expect, it } from 'vite-plus/test';
import {
  lossSeverity,
  scaleLossConsequences,
  type ConsequenceAmounts,
} from '../../src/engine/mechanics/missions/missions.ts';
import { ratio, Rational } from '../../src/kernel/index.ts';

const LEVEL_4_LOSS: ConsequenceAmounts = {
  money: 0,
  fundingChange: -50,
  panicIncreaseHundredths: 1000,
  panicReductionHundredths: 0,
  eliminateTargetFaction: false,
  defeat: false,
};

describe('MISSION, Loss severity', () => {
  it('counts the Health-adjusted base skill of the Enemies able to fight, ignoring exhaustion', () => {
    // The specification's example: 600 dead, 200 Incapacitated, and 200 able to fight at 60% health.
    const severity = lossSeverity([
      { baseSkill: 600, currentHealthHundredths: 0, effectiveMaxHealth: 30, ableToFight: false },
      { baseSkill: 200, currentHealthHundredths: 3000, effectiveMaxHealth: 30, ableToFight: false },
      { baseSkill: 200, currentHealthHundredths: 1800, effectiveMaxHealth: 30, ableToFight: true },
    ]);
    expect(severity.eq(ratio(12, 100))).toBe(true);
  });

  it('is 1 when every Enemy ends able to fight at full health', () => {
    const severity = lossSeverity([
      { baseSkill: 50, currentHealthHundredths: 2000, effectiveMaxHealth: 20, ableToFight: true },
      { baseSkill: 70, currentHealthHundredths: 4000, effectiveMaxHealth: 40, ableToFight: true },
    ]);
    expect(severity.eq(Rational.ONE)).toBe(true);
  });
});

describe('MISSION, Loss scaling', () => {
  it('rounds the funding change down and the Panic increase up to tenths', () => {
    expect(scaleLossConsequences(LEVEL_4_LOSS, ratio(35, 100))).toMatchObject({
      fundingChange: -18,
      panicIncreaseHundredths: 350,
    });
    expect(scaleLossConsequences(LEVEL_4_LOSS, ratio(12, 100))).toMatchObject({
      fundingChange: -6,
      panicIncreaseHundredths: 120,
    });
    // 10 × 0.123 = 1.23 rounds up to 1.3.
    expect(scaleLossConsequences(LEVEL_4_LOSS, ratio(123, 1000)).panicIncreaseHundredths).toBe(130);
  });

  it('leaves a defeat Effect unscaled and full Consequences unchanged at a Loss severity of 1', () => {
    expect(scaleLossConsequences({ ...LEVEL_4_LOSS, defeat: true }, ratio(1, 10)).defeat).toBe(true);
    expect(scaleLossConsequences(LEVEL_4_LOSS, Rational.ONE)).toEqual(LEVEL_4_LOSS);
  });
});
