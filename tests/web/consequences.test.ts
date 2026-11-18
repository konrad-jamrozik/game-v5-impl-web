/** VIS, Consequences: each Consequence that applied is good or bad for the Player. */
import { describe, expect, it } from 'vitest';
import { consequenceParts, consequenceText } from '../../src/web/format.ts';

const none = { money: 0, fundingChange: 0, panicIncrease: 0, panicReduction: 0, eliminatedFaction: null };

describe('VIS: Consequences', () => {
  it('colours gains of money and funding, a Panic reduction, and an Eliminated Faction as good', () => {
    expect(
      consequenceParts({
        ...none,
        money: 30,
        fundingChange: 5,
        panicReduction: 2,
        eliminatedFaction: 'Red Dawn',
      }),
    ).toEqual([
      { text: 'money +30', tone: 'good' },
      { text: 'funding +5', tone: 'good' },
      { text: 'Panic −2', tone: 'good' },
      { text: 'eliminated Red Dawn', tone: 'good' },
    ]);
  });

  it('colours a Panic increase and a loss of funding as bad', () => {
    expect(
      consequenceParts({ ...none, fundingChange: -2, panicIncrease: 3 }).map((part) => part.tone),
    ).toEqual(['bad', 'bad']);
  });

  it('keeps the plain text of the Consequences', () => {
    expect(consequenceText({ ...none, money: 30, fundingChange: 5 })).toBe('money +30, funding +5');
    expect(consequenceText(none)).toBe('no consequence');
  });
});
