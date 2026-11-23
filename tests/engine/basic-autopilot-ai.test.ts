/**
 * Tests of BASICAI: the Required rating share, the Combat margin plus the Loss margin step for each Lost Mission at a
 * Mission site of the same MissionSiteArchetype, which a team's Combat rating must at least reach; the Muster; the
 * Agent groups; and the Tuning parameters that switch a choice off. Each test runs one Turn routine on a Campaign it
 * sets up, and every Tuning parameter it depends on is read from BASIC_AI_THRESHOLDS or set as a Fixture value.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  BASIC_AI_THRESHOLDS,
  createBasicAutopilotAi,
  meetsRequiredShare,
  requiredRatingSharePct,
  type BasicAiThresholds,
} from '../../src/ai/index.ts';
import type { CurrentLiveWorldStateView, MissionSiteView, PlayerApi } from '../../src/engine/index.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { ok, startEngine, unlockContracting } from '../helpers/engine.ts';

/** BASICAI, Glossary, Reserve quota: the Reserve share of the Roster size, rounded down. */
const reserveQuota = (roster: number, t: BasicAiThresholds = BASIC_AI_THRESHOLDS) =>
  Math.floor((roster * t.reserveSharePct) / 100);

/**
 * BASICAI, Glossary, Investigator quota: the Investigator share of the Roster size, rounded down, but at least 1 while
 * the Roster size is at least 1.
 */
const investigatorQuota = (roster: number, t: BasicAiThresholds = BASIC_AI_THRESHOLDS) => {
  const share = Math.floor((roster * t.investigatorSharePct) / 100);
  return t.investigatorSharePct > 0 && roster >= 1 ? Math.max(1, share) : share;
};

describe('BASICAI: Required rating share', () => {
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
    const margin = BASIC_AI_THRESHOLDS.combatMarginPct;
    const step = BASIC_AI_THRESHOLDS.lossMarginStepPct;
    expect(required('apprehend_member')).toBe(margin);
    expect(required('raid_safehouse')).toBe(margin + step);
    expect(required('foil_sabotage')).toBe(margin + 2 * step);
    expect(required('foil_sabotage', [])).toBe(margin);
  });

  it('is met by a Combat rating equal to the required share, and not by one below it', () => {
    // At a share of 100%, a team equal to the Enemies qualifies.
    expect(meetsRequiredShare(500, 500, 100)).toBe(true);
    expect(meetsRequiredShare(499, 500, 100)).toBe(false);
    // At a share of 105%, 525 against 500 qualifies and 524 does not.
    expect(meetsRequiredShare(525, 500, 105)).toBe(true);
    expect(meetsRequiredShare(524, 500, 105)).toBe(false);
  });
});

/**
 * A Campaign whose first Agents are the Agent reserve on Standby, at least 3 of them and at least the Reserve quota,
 * and the rest of the roster Contractors, with a Player API that also shows an Initiative Mission site that the given
 * team just wins at the Combat margin, hires no Agent, and records every assignment the AI orders. `resting` shows that
 * Agent on Recovery with health lost 1.00 and a Health recovery rate of 0.60, so that it becomes a Deployable Agent
 * only after two Advance turns of recovery.
 */
async function musterCampaign(
  rateAs: (reserve: readonly string[], contracting: readonly string[]) => readonly string[],
  resting: (reserve: readonly string[]) => string | null = () => null,
) {
  const { engine } = await startEngine();
  ok(await engine.session.campaign.create({ seed: 'muster' }));
  await unlockContracting(engine);
  const live0 = ok(engine.player.queries.getCurrentLiveWorldState());
  const roster = live0.agents.map((agent) => agent.id);
  const reserve = roster.slice(0, Math.max(3, reserveQuota(roster.length)));
  expect(roster.length).toBeGreaterThan(reserve.length + 1);
  // As many of the others as the Contracting cap allows contract.
  const contractors = roster.slice(reserve.length, reserve.length + live0.agency.contractingCap);
  expect(contractors.length).toBeGreaterThan(1);
  ok(await engine.player.actions.assignAgents(contractors, 'Contracting'));
  // The Agents the Contracting cap leaves over are dismissed, so that the roster is the reserve and the Contractors.
  const leftOver = roster.slice(reserve.length + contractors.length);
  if (leftOver.length > 0) {
    ok(await engine.player.actions.dismissAgents(leftOver));
  }
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
  const enemiesRating = Math.floor(
    (rating(rateAs(reserve, contracting)) * 100) / BASIC_AI_THRESHOLDS.combatMarginPct,
  );
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
  const restingAgent = resting(reserve);
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
          agent.id === restingAgent
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
      hireAgents: async () => ({
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
  return { player, orders, reserve, contracting, rating };
}

describe('BASICAI: Muster for Initiative Mission sites', () => {
  it('recalls the Contractor a Winning team needs, and keeps the Agents of the Muster where they are', async () => {
    // The Agents of the Agent reserve alone cannot win; with the most capable Contractor they can.
    const { player, orders, reserve, contracting, rating } = await musterCampaign((own, on) => [
      ...own,
      on[0]!,
    ]);
    expect(rating(reserve)).toBeLessThan(rating([...reserve, contracting[0]!]));
    await createBasicAutopilotAi().step({ player });
    expect(orders).toContainEqual([contracting[0]!, 'Standby']);
    expect(orders).not.toContainEqual([contracting[1]!, 'Standby']);
    // An Agent of the Muster keeps the Assignment it has: no step sends an Agent of the reserve to other work.
    expect(orders.filter(([id]) => reserve.includes(id))).toEqual([]);
  });

  it('recalls no Contractor while a member of the Muster needs more than one Advance turn to rest', async () => {
    // The first Agent becomes a Deployable Agent only after two Advance turns on Recovery, so the Contractor keeps
    // earning.
    const { player, orders } = await musterCampaign(
      (own, on) => [...own, on[0]!],
      (own) => own[0]!,
    );
    await createBasicAutopilotAi().step({ player });
    expect(orders.filter(([, assignment]) => assignment === 'Standby')).toEqual([]);
  });
});

const kindCount = (live: CurrentLiveWorldStateView, kind: string) =>
  live.agents.filter((agent) => agent.assignment?.kind === kind).length;

describe('BASICAI: Agent groups', () => {
  it('keeps the Reserve quota in the Agent reserve, training, and sends the rest to Contracting', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'groups' }));
    // The groups are read as the Turn routine leaves them, when it requests Advance turn.
    let routineEnd: CurrentLiveWorldStateView | null = null;
    const player: PlayerApi = {
      ...engine.player,
      actions: {
        ...engine.player.actions,
        advanceTurn: async () => {
          routineEnd = ok(engine.player.queries.getCurrentLiveWorldState());
          return engine.player.actions.advanceTurn();
        },
      },
    };
    await createBasicAutopilotAi().step({ player });
    const live = routineEnd as CurrentLiveWorldStateView | null;
    if (live === null) {
      throw new Error('The Turn routine did not request Advance turn.');
    }
    // The quotas are those of the Roster size the Turn routine leaves, which may have hired Agents; a hired Agent joins
    // the Agent reserve on its way to Standby.
    const roster = live.agency.servingAgents;
    const reserve = live.agents.filter((agent) =>
      ['Standby', 'Training', 'Recovery', 'Deployed'].includes(agent.assignment?.kind ?? ''),
    );
    // Contractors are limited by the Contracting cap, 0 until Contracting is unlocked; the others stay in the Agent
    // reserve.
    const contractors = Math.min(
      live.agency.contractingCap,
      roster - reserveQuota(roster) - investigatorQuota(roster),
    );
    expect(kindCount(live, 'Investigation')).toBe(investigatorQuota(roster));
    expect(kindCount(live, 'Contracting')).toBe(contractors);
    expect(reserve).toHaveLength(roster - investigatorQuota(roster) - contractors);
    // Every Agent of the Agent reserve that has arrived in base trains while the Training cap has a place left.
    const inBase = reserve.filter((agent) => agent.agentStatus !== 'InTransit');
    expect(kindCount(live, 'Training')).toBe(Math.min(live.agency.trainingCap, inBase.length));
  });
});

/** A new Campaign whose Basic Autopilot AI has the given Tuning parameters instead of the Game designer values. */
async function tunedCampaign(seed: string, thresholds: Partial<BasicAiThresholds>) {
  const ai = createBasicAutopilotAi({ ...BASIC_AI_THRESHOLDS, ...thresholds });
  const { engine } = await startEngine({ autopilotAis: [ai] });
  ok(await engine.session.campaign.create({ seed }));
  return { engine, ai };
}

describe('BASICAI: Tuning parameters that switch a choice off', () => {
  /**
   * One Turn routine of a Campaign whose Agent cap was raised once, so that the Upgrade budget allows an Other
   * Upgrade, with money for it above the Savings floor, and whose Upgrade weights are 0 for every Other Upgrade but
   * `subject`, which has the given weight. Returns the Other Upgrades after the Turn routine and `subject`.
   */
  async function weightedTurn(seed: string, weight: number) {
    const upgrades = bootstrapGdrCatalog().upgrades;
    const others = upgrades.filter((upgrade) => !upgrade.effect.endsWith('_cap'));
    const subject = others[0]!;
    const weights = Object.fromEntries(
      others.map((upgrade) => [upgrade.id, upgrade.id === subject.id ? weight : 0]),
    );
    const tuned = await tunedCampaign(seed, { upgradeWeights: weights });
    const agentCap = upgrades.find((upgrade) => upgrade.effect === 'agent_cap')!;
    ok(tuned.engine.session.developer.enable());
    ok(await tuned.engine.developer.actions.addMoney(agentCap.price));
    ok(await tuned.engine.player.actions.purchaseUpgrade(agentCap.id));
    const agency = ok(tuned.engine.player.queries.getCurrentLiveWorldState()).agency;
    const budget = agency.upgrades.find((upgrade) => upgrade.id === agentCap.id)!.price;
    expect(subject.price).toBeLessThanOrEqual(budget);
    const floor = BASIC_AI_THRESHOLDS.savingsFloorTurns * agency.projectedUpkeep;
    // BASICAI, Purchases, item 1: the Ammo it buys first, up to twice what Ammo short asks for.
    const ammo = agency.equipment.items
      .filter((item) => item.kind === 'ammo' && item.unlocked && item.ammoAgents > 0)
      .reduce((sum, item) => sum + item.price * Math.max(0, 2 * item.ammoNeeded - item.available), 0);
    ok(
      await tuned.engine.developer.actions.addMoney(Math.max(1, subject.price + ammo + floor - agency.money)),
    );
    ok(tuned.engine.session.developer.disable());
    await tuned.ai.step({ player: tuned.engine.player });
    const after = ok(tuned.engine.player.queries.getCurrentLiveWorldState()).agency.upgrades.filter(
      (upgrade) => !upgrade.effect.endsWith('_cap'),
    );
    return { after, subject };
  }

  // CTEST, Limits: the test plays 2 Campaigns, one Turn each.
  it('never buys an Upgrade of weight 0, which it buys with any other weight', async () => {
    const weighted = await weightedTurn('weights', 1);
    expect(
      weighted.after.find((upgrade) => upgrade.id === weighted.subject.id)!.acquisitions,
    ).toBeGreaterThan(0);
    const unweighted = await weightedTurn('weights', 0);
    expect(unweighted.after.map((upgrade) => upgrade.acquisitions)).toEqual(unweighted.after.map(() => 0));
  });

  // CTEST, Limits: the test plays 2 Campaigns, one Turn each.
  it('investigates no Lead with an Investigator share of 0, and does with a larger one', async () => {
    const investigating = await tunedCampaign('investigators', {
      investigatorSharePct: 100 - BASIC_AI_THRESHOLDS.reserveSharePct,
    });
    await investigating.ai.step({ player: investigating.engine.player });
    const some = ok(investigating.engine.player.queries.getCurrentLiveWorldState());
    expect(kindCount(some, 'Investigation')).toBeGreaterThan(0);

    const idle = await tunedCampaign('investigators', { investigatorSharePct: 0 });
    await idle.ai.step({ player: idle.engine.player });
    const none = ok(idle.engine.player.queries.getCurrentLiveWorldState());
    expect(kindCount(none, 'Investigation')).toBe(0);
    expect(none.investigations).toEqual([]);
  });
});
