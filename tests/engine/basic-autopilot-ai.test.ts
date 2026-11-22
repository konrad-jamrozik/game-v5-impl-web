/**
 * Tests of BASICAI, Deploy only to win: the Required rating share, the Combat margin plus the Loss margin step for each
 * Lost Mission at a Mission site of the same MissionSiteArchetype, which a team's Combat rating must at least reach.
 */
import { describe, expect, it } from 'vite-plus/test';
import { BASIC_AI_THRESHOLDS, meetsRequiredShare, requiredRatingSharePct } from '../../src/ai/index.ts';

describe('BASICAI: Required rating share', () => {
  it('uses the Game designer values: a Combat margin of 100% and a Loss margin step of 5 points', () => {
    expect(BASIC_AI_THRESHOLDS.combatMarginPct).toBe(100);
    expect(BASIC_AI_THRESHOLDS.lossMarginStepPct).toBe(5);
  });

  it('rises by the Loss margin step for each Lost Mission at a Mission site of the same MissionSiteArchetype', () => {
    const sites = [
      { id: 'site-1', archetype: 'foil_sabotage' },
      { id: 'site-2', archetype: 'foil_sabotage' },
      { id: 'site-3', archetype: 'raid_safehouse' },
      { id: 'site-4', archetype: 'foil_sabotage' },
    ];
    const missions = [
      { missionSite: 'site-1', lifecycle: 'Lost' },
      { missionSite: 'site-2', lifecycle: 'Lost' },
      { missionSite: 'site-3', lifecycle: 'Lost' },
      // A Won or still Deployed Mission raises nothing.
      { missionSite: 'site-4', lifecycle: 'Won' },
    ];
    const required = (archetype: string, list = missions) =>
      requiredRatingSharePct(BASIC_AI_THRESHOLDS, sites, list, archetype);
    expect(required('apprehend_member')).toBe(100);
    expect(required('raid_safehouse')).toBe(105);
    expect(required('foil_sabotage')).toBe(110);
    expect(required('foil_sabotage', [])).toBe(100);
  });

  it('is met by a Combat rating equal to the required share, and not by one below it', () => {
    // At 100%, a team equal to the Enemies qualifies.
    expect(meetsRequiredShare(500, 500, 100)).toBe(true);
    expect(meetsRequiredShare(499, 500, 100)).toBe(false);
    // At 105%, after one Lost Mission, 525 against 500 qualifies and 524 does not.
    expect(meetsRequiredShare(525, 500, 105)).toBe(true);
    expect(meetsRequiredShare(524, 500, 105)).toBe(false);
  });
});
