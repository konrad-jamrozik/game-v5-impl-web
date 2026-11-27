/**
 * Tests of BASICAI: the Required rating share; the Equipping plan, which gives a Weapon only while Storage has rounds
 * for it; the Next rung and the Strike team; and one Turn routine of a new Campaign, which keeps the Strike team in
 * base, investigates the Lead that unlocks Contracting first, and sells surplus Items. Every Tuning parameter a test
 * depends on is read from BASIC_AI_THRESHOLDS.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  BASIC_AI_THRESHOLDS,
  createBasicAutopilotAi,
  makePlan,
  meetsRequiredShare,
  nextRungs,
  planEquipment,
  requiredRatingSharePct,
} from '../../src/ai/index.ts';
import { byDeployedFirst } from '../../src/ai/basic/equipping.ts';
import type {
  AgentView,
  CurrentLiveWorldStateView,
  EquipmentView,
  PlayerApi,
} from '../../src/engine/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';

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
    expect(meetsRequiredShare(500, 500, 100)).toBe(true);
    expect(meetsRequiredShare(499, 500, 100)).toBe(false);
    expect(meetsRequiredShare(525, 500, 105)).toBe(true);
    expect(meetsRequiredShare(524, 500, 105)).toBe(false);
  });
});

/** A new Campaign and its Current world state. */
async function newCampaign(seed: string) {
  const { engine } = await startEngine();
  ok(await engine.session.campaign.create({ seed }));
  return { engine, live: ok(engine.player.queries.getCurrentLiveWorldState()) };
}

const instance = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));

describe('BASICAI: Equipping', () => {
  it('gives a Weapon only while Storage holds its rounds for every Agent before, and the best first', async () => {
    const { live } = await newCampaign('equipping');
    const equipment = live.agency.equipment;
    const per = equipment.ammoShortRoundsPerAgent;
    // A Weapon whose Ammo is not Unlocked yet, e.g. one taken as Spoils of war.
    const looted = equipment.items.find(
      (item) => item.kind === 'weapon' && item.ammoType !== null && !item.unlocked,
    );
    if (looted === undefined) {
      throw new Error('The Game build has no Weapon whose Ammo starts locked.');
    }
    const pistol = live.agents[0]?.weapon;
    // Three of them in Storage and rounds for two and a half.
    const items = equipment.items.map((item) =>
      item.id === looted.id
        ? { ...item, owned: 3, available: 3 }
        : item.id === looted.ammoType
          ? { ...item, available: 2 * per + Math.floor(per / 2) }
          : item,
    );
    const view: EquipmentView = { ...equipment, items };
    const ordered = [...live.agents].sort(
      (a, b) => b.skillHundredths - a.skillHundredths || instance(a.id) - instance(b.id),
    );
    const weapons = (mode: 'storage' | 'buying' | 'unlimited') => {
      const plan = planEquipment(live.agents, view, mode);
      return ordered.slice(0, 4).map((agent) => plan.kit.get(agent.id)?.weapon);
    };
    expect(weapons('storage')).toEqual([looted.id, looted.id, pistol, pistol]);
    // Its Ammo is not Unlocked, so buying cannot add rounds for the third.
    expect(weapons('buying')).toEqual([looted.id, looted.id, pistol, pistol]);
    expect(weapons('unlimited')).toEqual([looted.id, looted.id, looted.id, pistol]);
  });
  it('gives the best gear to the Deployed Agents first, then in Agent order', async () => {
    const { live } = await newCampaign('deployed-first');
    const ordered = [...live.agents].sort(
      (a, b) => b.skillHundredths - a.skillHundredths || instance(a.id) - instance(b.id),
    );
    const strongest = ordered[0];
    const weakest = ordered[ordered.length - 1];
    if (strongest === undefined || weakest === undefined || strongest === weakest) {
      throw new Error('A new Campaign needs two Agents.');
    }
    const deployed: AgentView = { ...weakest, assignment: { kind: 'Deployed', mission: 'mission-1' } };
    expect([strongest, deployed].sort(byDeployedFirst).map((agent) => agent.id)).toEqual([
      weakest.id,
      strongest.id,
    ]);
    expect([weakest, strongest].sort(byDeployedFirst).map((agent) => agent.id)).toEqual([
      strongest.id,
      weakest.id,
    ]);
  });
});

describe('BASICAI: Next rung and Strike team', () => {
  it('sets each Faction the weakest Initiative MissionSiteArchetype stronger than every one Won against it', async () => {
    const { engine, live } = await newCampaign('rungs');
    const data = ok(engine.player.queries.getGameData());
    const ladder = data.missionSiteArchetypes
      .filter((item) => item.kind === 'initiative')
      .sort((a, b) => a.enemiesCombatRating - b.enemiesCombatRating);
    const [first, second] = live.factions;
    if (first === undefined || second === undefined || ladder.length < 2) {
      throw new Error('The Game build needs two Factions and two Initiative MissionSiteArchetypes.');
    }
    const rungs = nextRungs(live, data, new Map([[first.id, new Set([ladder[0]?.id ?? ''])]]));
    expect(rungs.get(first.id)?.archetype).toBe(ladder[1]?.id);
    expect(rungs.get(second.id)?.archetype).toBe(ladder[0]?.id);
  });

  it('keeps the Strike team within the Transport cap, leaving room for Contracting and one Investigation team', async () => {
    const { engine, live } = await newCampaign('strike');
    const plan = makePlan(
      live,
      ok(engine.player.queries.getCurrentRetiredWorldState()),
      ok(engine.player.queries.getGameData()),
      BASIC_AI_THRESHOLDS,
    );
    expect(plan.strike.length).toBeGreaterThan(0);
    expect(plan.strike.length).toBeLessThanOrEqual(live.agency.transportCap);
    expect(plan.strike.length).toBeLessThanOrEqual(
      live.agency.servingAgents - live.agency.contractingCap - BASIC_AI_THRESHOLDS.researchTeamSize,
    );
    // The Strike team is the first Agents in Agent order.
    expect(plan.strike.map((agent) => agent.id)).toEqual(
      plan.order.slice(0, plan.strike.length).map((agent) => agent.id),
    );
  });

  it('asks for the Agents of the more numerous Enemies of the Threat even when a stronger Next rung sets the goal', async () => {
    const { engine, live } = await newCampaign('strike-count');
    const data = ok(engine.player.queries.getGameData());
    // Every Initiative MissionSiteArchetype far stronger than any Response one, so that the weakest Next rung sets the
    // Strike goal's Combat rating.
    const strongest = Math.max(...data.missionSiteArchetypes.map((item) => item.enemiesCombatRating));
    const rungsStronger = {
      ...data,
      missionSiteArchetypes: data.missionSiteArchetypes.map((item) =>
        item.kind === 'initiative'
          ? { ...item, enemiesCombatRating: item.enemiesCombatRating + strongest }
          : item,
      ),
    };
    const plan = makePlan(
      live,
      ok(engine.player.queries.getCurrentRetiredWorldState()),
      rungsStronger,
      BASIC_AI_THRESHOLDS,
    );
    const weakest = [...plan.rungs.values()].sort((a, b) => a.combatRating - b.combatRating)[0];
    if (plan.threat === null || weakest === undefined || plan.goal === null) {
      throw new Error('A new Campaign needs a Threat and a Next rung.');
    }
    if (plan.threat.enemies <= weakest.enemies) {
      throw new Error('The Game build needs a Threat with more Enemies than the first Next rung.');
    }
    expect(plan.goal.combatRating).toBe(
      Math.ceil((weakest.combatRating * BASIC_AI_THRESHOLDS.combatMarginPct) / 100),
    );
    expect(plan.goal.enemies).toBe(plan.threat.enemies);
  });
});

type Engine = Awaited<ReturnType<typeof startEngine>>['engine'];

/** One Turn routine of the Basic Autopilot AI, and the Current world state it leaves when it requests Advance turn. */
async function routine(engine: Engine): Promise<CurrentLiveWorldStateView> {
  let end: CurrentLiveWorldStateView | null = null;
  const player: PlayerApi = {
    ...engine.player,
    actions: {
      ...engine.player.actions,
      advanceTurn: async () => {
        end = ok(engine.player.queries.getCurrentLiveWorldState());
        return engine.player.actions.advanceTurn();
      },
    },
  };
  await createBasicAutopilotAi().step({ player });
  const live = end as CurrentLiveWorldStateView | null;
  if (live === null) {
    throw new Error('The Turn routine did not request Advance turn.');
  }
  return live;
}

describe('BASICAI: one Turn routine', () => {
  // CTEST, Limits: each test plays one Turn of one Campaign.
  it('keeps the Strike team in base and investigates the Lead that unlocks Contracting first', async () => {
    const { engine, live: start } = await newCampaign('routine');
    const retired = ok(engine.player.queries.getCurrentRetiredWorldState());
    const unlocking = retired.leads.find((lead) => lead.unlocksContracting && lead.canBeInvestigatedNow);
    const plan = makePlan(start, retired, ok(engine.player.queries.getGameData()), BASIC_AI_THRESHOLDS);
    const live = await routine(engine);
    expect(live.investigations[0]?.lead).toBe(unlocking?.id);
    for (const agent of live.agents.filter((item) => plan.strikeIds.has(item.id))) {
      expect(['Standby', 'Training']).toContain(agent.assignment?.kind);
    }
  });

  it('sells the Items no Agent is to wear beyond Spare Items of each', async () => {
    const { engine, live } = await newCampaign('selling');
    const pistol = live.agency.equipment.items.find((item) => item.id === live.agents[0]?.weapon);
    if (pistol === undefined) {
      throw new Error('The Initial roster wears no Item.');
    }
    const surplus = 20;
    ok(engine.session.developer.enable());
    ok(await engine.developer.actions.addMoney(pistol.price * surplus));
    ok(engine.session.developer.disable());
    ok(await engine.player.actions.buyItems([{ id: pistol.id, count: surplus }]));
    const after = await routine(engine);
    const owned = after.agency.equipment.items.find((item) => item.id === pistol.id)?.owned ?? 0;
    expect(owned).toBeLessThanOrEqual(after.agency.servingAgents + BASIC_AI_THRESHOLDS.spareItems);
    expect(owned).toBeLessThan(live.agents.length + surplus);
  });
});
