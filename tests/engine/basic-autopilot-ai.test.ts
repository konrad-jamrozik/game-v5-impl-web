/**
 * Tests of BASICAI, Deploy only to win: the Required rating share, the Combat margin plus the Loss margin step for each
 * Lost Mission at a Mission site of the same MissionSiteArchetype, which a team's Combat rating must at least reach.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  BASIC_AI_THRESHOLDS,
  createBasicAutopilotAi,
  meetsRequiredShare,
  requiredRatingSharePct,
} from '../../src/ai/index.ts';
import type { MissionSiteView, PlayerApi } from '../../src/engine/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';

describe('BASICAI: Required rating share', () => {
  it('uses the Game designer values: a Combat margin of 110% and a Loss margin step of 5 points', () => {
    expect(BASIC_AI_THRESHOLDS.combatMarginPct).toBe(110);
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
    expect(required('apprehend_member')).toBe(110);
    expect(required('raid_safehouse')).toBe(115);
    expect(required('foil_sabotage')).toBe(120);
    expect(required('foil_sabotage', [])).toBe(110);
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

/**
 * A Campaign whose Agents 1 and 2 are on Standby and Agents 3 and 4 on Contracting, with a Player API that also shows
 * an Initiative Mission site that the given team just wins at the Combat margin, and records every assignment the AI
 * orders.
 */
async function musterCampaign(rateAs: (contracting: readonly string[]) => readonly string[]) {
  const { engine } = await startEngine();
  ok(await engine.session.campaign.create({ seed: 'muster' }));
  ok(await engine.player.actions.assignAgents(['agent-3', 'agent-4'], 'Contracting'));
  ok(await engine.player.actions.advanceTurn());
  const real = engine.player;
  const rating = (ids: readonly string[]) => ok(real.queries.previewDeployment(null, ids)).teamCombatRating;
  // The Agent on Contracting a Muster takes first: the more capable, then the earlier in the roster.
  const live = ok(real.queries.getCurrentLiveWorldState());
  const contracting = live.agents
    .filter((agent) => agent.assignment?.kind === 'Contracting')
    .sort((a, b) => b.effectiveSkill - a.effectiveSkill || a.id.localeCompare(b.id))
    .map((agent) => agent.id);
  // The Enemies rate so that the given team just reaches the Combat margin, and a weaker one does not.
  const enemiesRating = Math.floor((rating(rateAs(contracting)) * 100) / BASIC_AI_THRESHOLDS.combatMarginPct);
  const site = {
    ...({} as MissionSiteView),
    id: 'mission-site-muster',
    archetype: 'raid_safehouse',
    kind: 'Initiative',
    lifecycle: 'Active',
    turnsUntilExpiration: 3,
    enemies: [] as MissionSiteView['enemies'],
    enemiesCombatRating: enemiesRating,
  } as MissionSiteView;
  const orders: [string, string][] = [];
  const player: PlayerApi = {
    ...real,
    queries: {
      ...real.queries,
      getCurrentLiveWorldState: () => {
        const result = real.queries.getCurrentLiveWorldState();
        return result.ok ? { ...result, value: { ...result.value, missionSites: [site] } } : result;
      },
    },
    actions: {
      ...real.actions,
      // No Agent is hired, because a hired Agent In transit to Standby would also join the Muster.
      hireAgent: async () => ({
        ok: false,
        error: { code: 'rejected', message: 'This test hires no Agent.', reason: 'not_enough_money' },
      }),
      assignAgents: async (agents, assignment) => {
        for (const id of agents) {
          orders.push([id, assignment]);
        }
        return real.actions.assignAgents(agents, assignment);
      },
    },
  };
  return { player, orders, contracting, rating };
}

describe('BASICAI: Muster for Initiative Mission sites', () => {
  it('recalls the Agent on Contracting a winning team needs, and keeps the Mustered Agents on Standby', async () => {
    // The two Agents on Standby alone cannot win; with the more capable Agent on Contracting they can.
    const { player, orders, contracting, rating } = await musterCampaign((on) => [
      'agent-1',
      'agent-2',
      on[0]!,
    ]);
    expect(rating(['agent-1', 'agent-2'])).toBeLessThan(rating(['agent-1', 'agent-2', contracting[0]!]));
    await createBasicAutopilotAi().step({ player });
    // Step 3 recalls that Agent alone; the other keeps Contracting, so Expected income stays above 60% of upkeep.
    expect(orders).toContainEqual([contracting[0]!, 'Standby']);
    expect(orders).not.toContainEqual([contracting[1]!, 'Standby']);
    // A Mustered Agent keeps the Assignment it has: no step sends Agents 1 or 2 to other work.
    expect(orders.filter(([id]) => id === 'agent-1' || id === 'agent-2')).toEqual([]);
  });

  it('forms no Muster when its recalls would leave Expected income below the Muster income floor', async () => {
    // A team that needs both Agents on Contracting: recalling both leaves only funding, 20, below 60% of upkeep 40.
    const { player, orders } = await musterCampaign((on) => ['agent-1', 'agent-2', ...on]);
    await createBasicAutopilotAi().step({ player });
    expect(orders.filter(([, assignment]) => assignment === 'Standby')).toEqual([]);
  });
});
