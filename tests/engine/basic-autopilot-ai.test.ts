/**
 * Tests of BASICAI: the Required rating share, the Combat margin plus the Loss margin step for each Lost Mission at a
 * Mission site of the same MissionSiteArchetype, which a team's Combat rating must at least reach; the Muster; and the
 * Agent groups.
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
 * A Campaign whose Agents 1 to 3 are the Agent reserve on Standby, at the Reserve quota of 8 Agents, and Agents 4 to
 * 8 Contractors, with a Player API that also shows an Initiative Mission site that the given team just wins at the
 * Combat margin, hires no Agent, and records every assignment the AI orders. `resting` shows that Agent on Recovery
 * with health lost 1.00 and a Health recovery rate of 0.60, so that it becomes a Deployable Agent only after two
 * Advance turns of recovery.
 */
async function musterCampaign(
  rateAs: (contracting: readonly string[]) => readonly string[],
  resting: string | null = null,
) {
  const { engine } = await startEngine();
  ok(await engine.session.campaign.create({ seed: 'muster' }));
  ok(
    await engine.player.actions.assignAgents(
      ['agent-4', 'agent-5', 'agent-6', 'agent-7', 'agent-8'],
      'Contracting',
    ),
  );
  ok(await engine.player.actions.advanceTurn());
  const real = engine.player;
  const rating = (ids: readonly string[]) => ok(real.queries.previewDeployment(null, ids)).teamCombatRating;
  // The Contractor a Muster takes first: the lowest exhaustion, then the most capable, then the earlier in the roster.
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
        if (!result.ok) {
          return result;
        }
        const agents = result.value.agents.map((agent) =>
          agent.id === resting
            ? {
                ...agent,
                assignment: { kind: 'Recovery' as const },
                agentStatus: 'Recovering' as const,
                canBeAssigned: false,
                deployable: false,
                fitForWork: false,
                healthLostHundredths: 100,
                healthRecoveryRateHundredths: 60,
              }
            : agent,
        );
        return { ...result, value: { ...result.value, agents, missionSites: [site] } };
      },
    },
    actions: {
      ...real.actions,
      // No Agent is hired, because a hired Agent In transit to Standby would also join the Agent reserve.
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
  it('recalls the Contractor a Winning team needs, and keeps the Agents of the Muster where they are', async () => {
    // The three Agents of the Agent reserve alone cannot win; with the most capable Contractor they can.
    const { player, orders, contracting, rating } = await musterCampaign((on) => [
      'agent-1',
      'agent-2',
      'agent-3',
      on[0]!,
    ]);
    expect(rating(['agent-1', 'agent-2', 'agent-3'])).toBeLessThan(
      rating(['agent-1', 'agent-2', 'agent-3', contracting[0]!]),
    );
    await createBasicAutopilotAi().step({ player });
    expect(orders).toContainEqual([contracting[0]!, 'Standby']);
    expect(orders).not.toContainEqual([contracting[1]!, 'Standby']);
    // An Agent of the Muster keeps the Assignment it has: no step sends Agents 1 to 3 to other work.
    expect(orders.filter(([id]) => ['agent-1', 'agent-2', 'agent-3'].includes(id))).toEqual([]);
  });

  it('recalls no Contractor while a member of the Muster needs more than one Advance turn to rest', async () => {
    // agent-1 becomes a Deployable Agent only after two Advance turns on Recovery, so the Contractor keeps earning.
    const { player, orders } = await musterCampaign(
      (on) => ['agent-1', 'agent-2', 'agent-3', on[0]!],
      'agent-1',
    );
    await createBasicAutopilotAi().step({ player });
    expect(orders.filter(([, assignment]) => assignment === 'Standby')).toEqual([]);
  });
});

describe('BASICAI: Agent groups', () => {
  it('keeps 40% of the roster in the Agent reserve, training, and sends the rest to Contracting', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'groups' }));
    await createBasicAutopilotAi().step({ player: engine.player });
    const live = ok(engine.player.queries.getCurrentLiveWorldState());
    const kinds = live.agents.map((agent) => agent.assignment?.kind);
    const count = (kind: string) => kinds.filter((item) => item === kind).length;
    // With 8 Agents the Reserve quota is 3 and the Investigator quota 0. The AI also hires one Agent, which keeps
    // money at 5 Turns of upkeep, and that Agent joins the Agent reserve on its way to Standby, so one Agent of the
    // reserve becomes a Spare Agent and goes to Contracting too.
    expect(live.agency.servingAgents).toBe(9);
    expect(count('Investigation')).toBe(0);
    expect(count('Contracting')).toBe(6);
    expect(count('Training') + count('Standby')).toBe(3);
    expect(count('Training')).toBe(2);
  });
});
