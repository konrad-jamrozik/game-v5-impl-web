/**
 * Tests, from the former Acceptance examples, of NUMBERS, Decimal quantities, and of the rules that hold an Agent's base skill, current
 * health, and Exact exhaustion as Decimal quantities: AGENT, ECON, and GUI, Decimal quantities shown.
 */
import { describe, expect, it } from 'vite-plus/test';
import { effectiveSkill, exhaustionOf, isFitForWork } from '../../src/engine/mechanics/agents/agents.ts';
import {
  fromHundredths,
  percentOf,
  ratio,
  roundDownToHundredths,
  roundUp,
  roundUpToHundredths,
} from '../../src/kernel/index.ts';
import { decimalText, progressGain, progressPoints, wholeText } from '../../src/web/format.ts';
import {
  advance,
  agent,
  agentIds,
  catalogWith,
  expectDefective,
  gdrs,
  newCampaign,
  setAssignment,
} from '../helpers/game.ts';

const p = gdrs.agentParameters;

/** An Agent's values in units, held in hundredths. */
function values(skill: number, currentHealth: number, exhaustion: number) {
  return {
    skillHundredths: Math.round(skill * 100),
    currentHealthHundredths: Math.round(currentHealth * 100),
    maxHealth: 30,
    exactExhaustionHundredths: Math.round(exhaustion * 100),
  };
}

describe('NUMBERS: Decimal quantities', () => {
  it('Rounding to hundredths', () => {
    const xs = [ratio(2, 3), fromHundredths(13299).div(100), ratio(6, 10), 2, ratio(-5, 1000)];
    expect(xs.map(roundDownToHundredths)).toEqual([66, 132, 60, 200, -1]);
    expect(xs.map(roundUpToHundredths)).toEqual([67, 133, 60, 200, 0]);
    // 2.2 percent of 31 is 0.682: 0.69 rounded up and 0.68 rounded down; 2 percent of 30 is exactly 0.60.
    expect(roundUpToHundredths(percentOf(fromHundredths(220), 31))).toBe(69);
    expect(roundDownToHundredths(percentOf(fromHundredths(220), 31))).toBe(68);
    expect(roundUpToHundredths(percentOf(2, 30))).toBe(60);
  });

  it('Exact sums and the shown rate equals the applied rate', () => {
    let total = 0;
    for (let i = 0; i < 49; i += 1) {
      total += 60;
    }
    expect(fromHundredths(total).lt(30)).toBe(true);
    expect(fromHundredths(total + 60).eq(30)).toBe(true);
    expect(10 + 20).toBe(30);
    // A rate of round up to hundredths(2 / 3) = 0.67, added in three Turns, adds 2.01.
    expect(roundUpToHundredths(ratio(2, 3)) * 3).toBe(201);
    // A Decimal quantity of 3.40 read through round up( … ) is 4, and one of 3.00 is 3.
    expect([roundUp(fromHundredths(340)), roundUp(fromHundredths(300))]).toEqual([4, 3]);
  });
});

describe('AGENT: Decimal quantities', () => {
  it('Effective skill with decimal places', () => {
    expect(effectiveSkill(values(102.75, 28.67, 0), p)).toBe(98);
    // Exact exhaustion 30.40 is exhaustion 31: penalty factor 99.
    expect(effectiveSkill(values(102.75, 30, 30.4), p)).toBe(101);
    expect(effectiveSkill(values(102.75, 30, 0), p)).toBe(102);
    expect(effectiveSkill(values(100, 29.99, 0), p)).toBe(99);
  });

  it('Exact exhaustion just above a threshold', () => {
    expect(exhaustionOf(values(100, 30, 30.4))).toBe(31);
    expect(isFitForWork({ ...values(100, 30, 30.4), healthLostHundredths: 0 }, p)).toBe(false);
    expect(isFitForWork({ ...values(100, 30, 30), healthLostHundredths: 0 }, p)).toBe(true);
  });

  it('Training growth with a training skill gain that is not whole', () => {
    const catalog = catalogWith(
      (raw) => (raw.get('agent_parameters')['training_skill_gain_per_turn'] = { $decimal: '1.1' }),
    );
    let state = newCampaign({ money: 5000, catalog });
    const [a1] = agentIds(state) as [string];
    state = setAssignment(state, [a1], 'Training');
    state = advance(state, {}, catalog);
    expect(agent(state, a1).state.skillHundredths).toBe(10110);
    state = advance(state, {}, catalog);
    expect(agent(state, a1).state.skillHundredths).toBe(10220);
  });
});

describe('ECON: Decimal increments', () => {
  it('GDR validation', () => {
    expectDefective((raw) => (raw.get('training_cap')['increment'] = { $decimal: '0.5' }));
    expectDefective((raw) => (raw.get('health_recovery')['increment'] = { $decimal: '0.125' }));
    expect(gdrs.upgrades.find((u) => u.id === 'training_skill_gain')!.incrementHundredths).toBe(50);
  });
});

describe('GUI: Decimal quantities shown', () => {
  it('shows a Decimal quantity as a whole number by default, rounded down so it never reads as a threshold reached', () => {
    // E.g. base skill 101.90 reads 101, current health 29.40 and 29.99 read 29, Investigation progress 702 reads 7.
    expect([10190, 2940, 2999, 702, 3000, 0].map(wholeText)).toEqual(['101', '29', '29', '7', '30', '0']);
    expect(progressPoints(702)).toBe('7');
    // A Combat report holds an Enemy's whole values in hundredths too; they are shown as they are.
    expect(wholeText(3000)).toBe('30');
  });

  it('shows Investigation progress gains, Upgrade effects, and Agent details with two decimals, never rounded', () => {
    expect([2940, 10110, 100, 220, 702, 3000].map(decimalText)).toEqual([
      '29.40',
      '101.10',
      '1.00',
      '2.20',
      '7.02',
      '30.00',
    ]);
    // A gain below one progress point shows, rather than reading "+0".
    expect([progressGain(104), progressGain(60)]).toEqual(['1.04', '0.60']);
  });
});
