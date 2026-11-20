/** VIS, Consequences: each Consequence that applied is good or bad for the Player. */
import { describe, expect, it } from 'vite-plus/test';
import type { ConsequenceRecord } from '../../src/engine/index.ts';
import { consequenceParts, consequenceText, panicText } from '../../src/web/format.ts';

const none: ConsequenceRecord = {
  money: 0,
  fundingChange: 0,
  panicIncreaseHundredths: 0,
  panicReductionHundredths: 0,
  eliminatedFaction: null,
  defeat: false,
};

describe('VIS: Consequences', () => {
  it('colours gains of money and funding, a Panic reduction, and an Eliminated Faction as good', () => {
    expect(
      consequenceParts({
        ...none,
        money: 30,
        fundingChange: 5,
        panicReductionHundredths: 200,
        eliminatedFaction: 'Red Dawn',
      }),
    ).toEqual([
      { text: 'money +30', tone: 'good' },
      { text: 'funding +5', tone: 'good' },
      { text: 'Panic −2.00', tone: 'good' },
      { text: 'eliminated Red Dawn', tone: 'good' },
    ]);
  });

  it('colours a Panic increase, a loss of funding, and a lost Campaign as bad', () => {
    expect(
      consequenceParts({ ...none, fundingChange: -2, panicIncreaseHundredths: 30, defeat: true }).map(
        (part) => part.tone,
      ),
    ).toEqual(['bad', 'bad', 'bad']);
    expect(consequenceText({ ...none, panicIncreaseHundredths: 2 })).toBe('Panic +0.02');
    // MVIEW, Selected Mission site: a Consequence that lost the Campaign reads "Campaign lost".
    expect(consequenceText({ ...none, panicIncreaseHundredths: 100, defeat: true })).toBe(
      'Panic +1.00, Campaign lost',
    );
  });

  it('keeps the plain text of the Consequences', () => {
    expect(consequenceText({ ...none, money: 30, fundingChange: 5 })).toBe('money +30, funding +5');
    expect(consequenceText(none)).toBe('no consequence');
  });

  it('writes Panic with two decimals', () => {
    expect([panicText(0), panicText(2435), panicText(10_000)]).toEqual(['0.00%', '24.35%', '100.00%']);
  });
});
