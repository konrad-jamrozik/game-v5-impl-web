/** CSCR, Status bar values: Turns since last enemy activity; CVIEW, Faction charts. */
import { describe, expect, it } from 'vitest';
import { responseSitesSeries, turnsSinceLastFactionActivity } from '../../src/web/faction-activity.ts';

const response = (targetFaction: string, turnCreated: number) =>
  ({ kind: 'Response', targetFaction, turnCreated }) as const;
const initiative = (targetFaction: string, turnCreated: number) =>
  ({ kind: 'Initiative', targetFaction, turnCreated }) as const;

describe('CSCR: Turns since last enemy activity', () => {
  it('counts from the start of the Campaign before any Response Mission site exists', () => {
    expect(turnsSinceLastFactionActivity(1, [])).toBe(0);
    expect(turnsSinceLastFactionActivity(9, [initiative('f-1', 4)])).toBe(8);
  });

  it('is 0 in the Turn after the Advance turn that created a Response Mission site, and grows by 1 each Turn', () => {
    // A site created by the Advance turn ending Turn 13 has Turn created 13 and first exists in Turn 14.
    const sites = [response('f-1', 11), response('f-2', 13), initiative('f-1', 15)];
    expect(turnsSinceLastFactionActivity(14, sites)).toBe(0);
    expect(turnsSinceLastFactionActivity(16, sites)).toBe(2);
  });
});

describe('CVIEW: Faction charts', () => {
  it('counts, for each Turn, the Response Mission sites of the Faction created before that Turn', () => {
    const sites = [response('f-1', 11), response('f-2', 13), response('f-1', 14), initiative('f-1', 2)];
    const series = responseSitesSeries('f-1', 16, sites);
    expect(series).toHaveLength(16);
    expect(series[10]).toEqual({ turn: 11, value: 0 });
    expect(series[11]).toEqual({ turn: 12, value: 1 });
    expect(series.at(-1)).toEqual({ turn: 16, value: 2 });
    expect(responseSitesSeries('f-3', 16, sites).every((point) => point.value === 0)).toBe(true);
  });
});
