/** GUI, Digit grouping: a comma between each group of three digits of the whole part of every number shown. */
import { describe, expect, it } from 'vite-plus/test';
import type { ConsequenceRecord } from '../../src/engine/index.ts';
import { groupDigitString } from '../../src/kernel/index.ts';
import { consequenceText, decimalText, groupDigits, signedNumber, wholeText } from '../../src/web/format.ts';

describe('GUI: Digit grouping', () => {
  it('groups the digits of a whole number from the right', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(45_817)).toBe('45,817');
    expect(groupDigits(1_000_000)).toBe('1,000,000');
    expect(groupDigits(123_456_789)).toBe('123,456,789');
  });

  it('keeps the sign of a negative number before its grouped digits', () => {
    expect(groupDigits(-999)).toBe('-999');
    expect(groupDigits(-1040)).toBe('-1,040');
    expect(groupDigits(-1_000_000)).toBe('-1,000,000');
  });

  it('groups only the whole part of a number with a fractional part', () => {
    expect(groupDigits(1234.5678)).toBe('1,234.5678');
    expect(groupDigits(-1250.5)).toBe('-1,250.5');
    expect(groupDigits(0.1234)).toBe('0.1234');
    expect(groupDigitString('1234')).toBe('1,234');
  });

  it('groups a gain, a Decimal quantity, and a Consequence', () => {
    expect(signedNumber(2237)).toBe('+2,237');
    expect(signedNumber(-1040)).toBe('-1,040');
    expect(signedNumber(0)).toBe('0');
    expect(decimalText(125_050)).toBe('1,250.50');
    expect(decimalText(-125_050)).toBe('-1,250.50');
    expect(decimalText(99_999)).toBe('999.99');
    expect(wholeText(123_499)).toBe('1,234');
    const none: ConsequenceRecord = {
      money: 0,
      fundingChange: 0,
      panicIncreaseHundredths: 0,
      panicReductionHundredths: 0,
      eliminatedFaction: null,
      defeat: false,
    };
    expect(consequenceText({ ...none, money: 1200, fundingChange: -1500 })).toBe(
      'money +1,200, funding -1,500',
    );
  });
});
