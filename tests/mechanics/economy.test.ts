/** Tests, from the former Acceptance examples, of ECON (Economy and Upgrades). */
import { describe, expect, it } from 'vite-plus/test';
import { exhaustionOf } from '../../src/engine/mechanics/agents/agents.ts';
import { contractingContribution, fundingAfter, income } from '../../src/engine/mechanics/economy/economy.ts';
import { createGameRules } from '../../src/engine/game-rules.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  historyView,
} from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  catalogWith,
  advance,
  agent,
  agentIds,
  agents,
  expectDefective,
  expectRejected,
  funding,
  gdrs,
  losing,
  money,
  newCampaign,
  setAssignment,
  tweak,
  winning,
  withAgents,
  units,
  setCurrentHealth,
  effectiveValuesOf,
} from '../helpers/game.ts';

const agency = (state: CampaignState) => currentLiveWorldStateView(state, gdrs).agency;
const series = (state: CampaignState) => {
  const { moneyAtStartOfTurn, moneyAtEndOfTurn } = historyView(state).turnSeries;
  return { start: moneyAtStartOfTurn.map((v) => v.value), end: moneyAtEndOfTurn.map((v) => v.value) };
};
const setMoney = (state: CampaignState, value: number, fund?: number) =>
  tweak(state, (world) => {
    world.agency.state.money = value;
    if (fund !== undefined) {
      world.agency.state.funding = fund;
    }
  });

describe('ECON: examples', () => {
  it('Campaign creation', () => {
    const state = newCampaign();
    const view = agency(state);
    expect(view).toMatchObject({
      archetype: 'agency',
      name: 'The Agency',
      money: 500,
      funding: 20,
      agentCap: 20,
      transportCap: 8,
      trainingCap: 10,
      projectedIncome: 20,
      projectedUpkeep: 40,
    });
    expect(view.upgrades.map((u) => [u.id, u.acquisitions])).toEqual([
      ['agent_cap', 0],
      ['transport_cap', 0],
      ['training_cap', 0],
      ['weapon_damage', 0],
      ['armor', 0],
      ['training_skill_gain', 0],
      ['exhaustion_recovery', 0],
      ['health_recovery', 0],
    ]);
    expect(series(state)).toEqual({ start: [500], end: [] });
    expect(state.configuration).toEqual({ startingMoney: 500, startingFunding: 20 });
    expect(agents(state).every((a) => a.state.baseWeaponDamage === 10)).toBe(true);
    const rules = createGameRules(gdrs);
    const starting = rules.configurationValues.find((value) => value.key === 'startingMoney')!;
    expect(starting.adjustable).toBe(false);
    expect([800, 0, -1, 2.5].map((value) => starting.isPermitted(value))).toEqual([true, true, false, false]);
    expect(money(newCampaign({ money: 800 }))).toBe(800);
  });

  it('The first three Advance turns', () => {
    let state = newCampaign();
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a3], assignment: 'Training' });
    // Under AGENT, Transit rule, a3 moves within base and is At assignment at once.
    expect(agent(state, a3).state.status).toBe('AtAssignment');
    expect(agency(state)).toMatchObject({ projectedIncome: 20, projectedUpkeep: 40 });
    state = advance(state);
    expect(state.world.history.turnReport).toMatchObject({
      income: { contractingAgents: 0, income: 20, moneyAfter: 520 },
      upkeep: { servingAgents: 4, upkeep: 40, moneyAfter: 480 },
    });
    expect(money(state)).toBe(480);

    state = act(state, 'hireAgent');
    expect(money(state)).toBe(430);
    const a5 = agentIds(state)[4]!;
    expect(agency(state)).toMatchObject({ projectedIncome: 80, projectedUpkeep: 50 });
    state = advance(state);
    expect(state.world.history.turnReport).toMatchObject({
      income: { contractingAgents: 2, income: 80, moneyAfter: 510 },
      upkeep: { servingAgents: 5, upkeep: 50, moneyAfter: 460 },
    });
    expect(agent(state, a3).state.skillHundredths / 100).toBe(102);

    state = act(state, 'assignAgents', { agents: [a5], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(agency(state)).toMatchObject({ projectedIncome: 50, projectedUpkeep: 50 });
    state = advance(state);
    expect(money(state)).toBe(460);
    // WHIST, Turn series, The current Turn from the Timeline: during Turn 4 the end-of-Turn Turn series has no value
    // for the current Turn, so it holds 3 values.
    expect(series(state)).toEqual({ start: [500, 480, 460, 460], end: [500, 430, 460] });
    expect(agency(state).projectedIncome).toBe(80);
  });

  it('Contracting income and effective skill', () => {
    let state = setMoney(newCampaign(), 500, 20);
    const [c1, c2, c3, a4] = agentIds(state) as [string, string, string, string];
    state = setAssignment(state, [c1, c2, c3], 'Contracting');
    state = tweak(state, (world) => {
      world.agents[c1]!.state.exactExhaustionHundredths = 1000;
      world.agents[c2]!.state.exactExhaustionHundredths = 4700;
      world.agents[c3]!.state.skillHundredths = 15000;
      world.agents[c3]!.state.exactExhaustionHundredths = 6900;
    });
    const view = currentLiveWorldStateView(state, gdrs);
    expect(view.agents.slice(0, 3).map((a) => a.effectiveSkill)).toEqual([100, 83, 91]);
    // With contracting_skill_scale 200: 30 × (1 − 17 / 200) = 27.45 and 30 × (1 − 9 / 200) = 28.65.
    expect(contractingContribution(83, gdrs.economy).toString()).toBe('549/20');
    expect(contractingContribution(91, gdrs.economy).toString()).toBe('573/20');
    // 20 + round down(30 + 27.45 + 28.65) = 106; rounding each contribution on its own would give 105.
    expect(agency(state).projectedIncome).toBe(106);
    state = advance(state);
    expect(state.world.history.turnReport!.income).toMatchObject({ contractingAgents: 3, income: 106 });
    expect([c1, c2, c3].map((id) => agent(state, id).state.exactExhaustionHundredths / 100)).toEqual([
      11, 48, 70,
    ]);
    expect(units(agent(state, c3).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    // 20 + round down(30 + 30 × (1 − 18 / 200)) = 20 + round down(57.3) = 77.
    expect(agency(state).projectedIncome).toBe(77);
    // e.g. effective skill 100, 83, and 150 give round down(94.95) = 94.
    expect(income(0, [100, 83, 150], gdrs.economy)).toBe(94);
    // An Agent with effective skill 0 still contributes 1 − 100 / 200, i.e. half.
    expect(contractingContribution(0, gdrs.economy).toString()).toBe('15');
    void a4;
  });

  it('Upkeep counts every Serving Agent', () => {
    let state = withAgents(newCampaign(), 8);
    const [a1, a2, a3, a4, a5, a6, a7, a8] = agentIds(state) as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state = setMoney(state, 300, 20);
    state = setAssignment(state, [a2], 'Contracting', 'InTransit');
    state = setAssignment(state, [a5], 'Contracting');
    state = setAssignment(state, [a6], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[a4]!.state, 2000);
      world.agents[a4]!.state.assignment = { kind: 'Recovery' };
      world.agents[a4]!.state.status = 'Recovering';
      world.agents[a7]!.state.status = 'Killed';
      world.agents[a7]!.state.turnTerminated = 1;
      world.agents[a7]!.state.finalMaxHealth = world.agents[a7]!.state.baseHealth;
      world.agents[a7]!.state.finalWeaponDamage = world.agents[a7]!.state.baseWeaponDamage;
      world.agents[a7]!.state.finalArmor = world.agents[a7]!.state.baseArmor;
      world.agents[a7]!.state.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(world.agents[a7]!.state, 0);
      world.agents[a7]!.state.assignment = null;
    });
    state = act(state, 'dismissAgents', { agents: [a8] });
    const site = addMissionSite(state, 'raid_hq');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a3] });
    expect(agency(state)).toMatchObject({ projectedIncome: 50, projectedUpkeep: 60 });
    state = advance(state, losing(state, site.site));
    expect(state.world.history.turnReport).toMatchObject({
      income: { contractingAgents: 1, moneyAfter: 350 },
      upkeep: { servingAgents: 6, moneyAfter: 290 },
    });
    expect(agent(state, a3).state.status).toBe('Killed');
    expect(agency(state).projectedUpkeep).toBe(50);
    void a1;
  });

  it('Negative money', () => {
    let state = advance(setMoney(newCampaign(), 15, 0));
    // No later step raises money to at least 0, so the Ending check step records a Campaign ending.
    expect(money(state)).toBe(-25);
    expect(series(state).start.at(-1)).toBe(-25);
    expect(state.world.current.ending).toBe('Defeat');
    expectRejected(state, 'hireAgent', {}, 'campaign_ended');
    // In another Campaign, with money 15, addMoney removes money but never below 0.
    state = setMoney(newCampaign(), 15, 0);
    state = act(state, 'addMoney', { amount: -15 }, 'developer');
    expect(money(state)).toBe(0);
    expectRejected(state, 'addMoney', { amount: -1 }, 'negative_money', 'developer');
    expect(money(state)).toBe(0);
    state = act(state, 'addMoney', { amount: 75 }, 'developer');
    state = act(state, 'hireAgent');
    expect(money(state)).toBe(25);
  });

  it('Funding changes from Mission sites', () => {
    expect(fundingAfter(3, [-10])).toBe(0);
    expect(fundingAfter(3, [5, -10])).toBe(0);
    expect(fundingAfter(3, [-10, 5])).toBe(0);
    expect(fundingAfter(0, [5, -1])).toBe(4);
    expect(fundingAfter(0, [-1])).toBe(0);

    // Win of a Faction operation level 2 site: money +200 and funding 20 + 10, which the next Agency income step uses.
    const site = addMissionSite(newCampaign(), 'foil_sabotage');
    let state = act(site.state, 'deployAgents', { missionSite: site.site, agents: agentIds(site.state) });
    state = advance(state, winning(state, site.site));
    expect(state.world.history.turnReport!.income.funding).toBe(20);
    expect(funding(state)).toBe(30);
    expect(money(state)).toBe(500 + 20 - 40 + 200);
    expect(agency(state).projectedIncome).toBe(30);

    // Loss at the floor: an Expired Response Mission site with funding 0.
    const expiring = addMissionSite(setMoney(newCampaign(), 500, 0), 'foil_sabotage', {
      turnsUntilExpiration: 1,
    });
    expect(funding(advance(expiring.state))).toBe(0);
  });

  it('Hiring at the Agent cap', () => {
    let state = withAgents(setMoney(newCampaign(), 3050), 21);
    const ids = agentIds(state);
    state = tweak(state, (world) => {
      const dead = world.agents[ids[20]!]!.state;
      dead.status = 'Killed';
      dead.turnTerminated = 1;
      dead.finalMaxHealth = dead.baseHealth;
      dead.finalWeaponDamage = dead.baseWeaponDamage;
      dead.finalArmor = dead.baseArmor;
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.assignment = null;
      world.agents[ids[0]!]!.state.status = 'InTransit';
    });
    expectRejected(state, 'hireAgent', {}, 'agent_cap');
    state = act(state, 'purchaseUpgrade', { upgrade: 'agent_cap' });
    expect(agency(state)).toMatchObject({ money: 1050, agentCap: 40, servingAgents: 20 });
    for (let i = 0; i < 20; i += 1) {
      state = act(state, 'hireAgent');
    }
    expect(agency(state)).toMatchObject({ money: 50, servingAgents: 40 });
    expectRejected(state, 'hireAgent', {}, 'agent_cap');

    expect(money(act(setMoney(newCampaign(), 50), 'hireAgent'))).toBe(0);
    expectRejected(setMoney(newCampaign(), 49), 'hireAgent', {}, 'not_enough_money');

    let over = withAgents(newCampaign(), 20);
    over = act(over, 'addAgents', { count: 3 }, 'developer');
    expect(agency(over)).toMatchObject({ servingAgents: 23, agentCap: 20 });
    expectRejected(over, 'hireAgent', {}, 'agent_cap');
  });

  it('Dismissing Agents', () => {
    let state = withAgents(setMoney(newCampaign(), 120), 6);
    const [a1, a2, a3, a4, a5, a6] = agentIds(state) as [string, string, string, string, string, string];
    state = setAssignment(state, [a3], 'Standby', 'InTransit');
    state = setAssignment(state, [a4], 'Contracting');
    state = tweak(state, (world) => {
      const dead = world.agents[a6]!.state;
      dead.status = 'Killed';
      dead.turnTerminated = 1;
      dead.finalMaxHealth = dead.baseHealth;
      dead.finalWeaponDamage = dead.baseWeaponDamage;
      dead.finalArmor = dead.baseArmor;
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.assignment = null;
    });
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a5] });
    expect(agency(state).projectedUpkeep).toBe(50);
    const reject = (list: string[], reason: string) =>
      expectRejected(state, 'dismissAgents', { agents: list }, reason);
    reject([], 'agents_empty');
    reject([a1, a1], 'agents_duplicate');
    reject([a3], 'agents_in_transit');
    reject([a4], 'agents_not_on_standby');
    reject([a5], 'agents_not_on_standby');
    reject([a6], 'agents_not_serving');
    reject([a1, a3], 'agents_in_transit');
    const next = act(state, 'dismissAgents', { agents: [a1, a2] });
    expect(units(agent(next, a1).state)).toMatchObject({
      status: 'Dismissed',
      assignment: null,
      turnTerminated: next.world.current.turn,
      killedBy: null,
    });
    expect(agency(next)).toMatchObject({ money: 120, projectedUpkeep: 30 });
    expect(currentRetiredWorldStateView(next, gdrs).agents.map((a) => a.id)).toEqual([a1, a2, a6]);
  });

  it('Transport cap', () => {
    let state = withAgents(setMoney(newCampaign(), 2000), 12);
    const ids = agentIds(state);
    const s1 = addMissionSite(state, 'foil_recruitment_push');
    const s2 = addMissionSite(s1.state, 'apprehend_member');
    state = act(s2.state, 'deployAgents', { missionSite: s1.site, agents: ids.slice(0, 7) });
    expectRejected(state, 'deployAgents', { missionSite: s2.site, agents: ids.slice(7, 9) }, 'transport_cap');
    state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    expect(agency(state)).toMatchObject({ money: 500, transportCap: 16 });
    state = act(state, 'deployAgents', { missionSite: s2.site, agents: ids.slice(7, 12) });
    expect(agency(state).deployedAgents).toBe(12);
    state = advance(state);
    expect(agency(state).deployedAgents).toBe(0);
  });

  it('Training cap', () => {
    let state = withAgents(setMoney(newCampaign(), 1050), 15);
    const ids = agentIds(state);
    const trainees = ids.slice(0, 9);
    const [a1, a2, a3, a4, a5, a6] = ids.slice(9) as [string, string, string, string, string, string];
    state = setAssignment(state, trainees, 'Training');
    expectRejected(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Training' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Training' },
      status: 'AtAssignment',
    });
    expect(agency(state).trainingAgents).toBe(10);
    expectRejected(state, 'assignAgents', { agents: [a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a2], assignment: 'Contracting' });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_cap' });
    expect(agency(state)).toMatchObject({ money: 50, trainingCap: 20 });
    state = act(state, 'assignAgents', { agents: [a3, a4, a5, a6], assignment: 'Training' });
    expect(agency(state).trainingAgents).toBe(14);
    state = act(state, 'assignAgents', { agents: [trainees[0]!], assignment: 'Standby' });
    expect(agency(state).trainingAgents).toBe(13);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'training_cap' }, 'not_enough_money');
  });

  it('Weapon damage Upgrade', () => {
    let state = withAgents(setMoney(newCampaign(), 2100), 6);
    const [a1, a2, a3, a4, a5, a6] = agentIds(state) as [string, string, string, string, string, string];
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a4], 'Standby', 'InTransit');
    state = act(state, 'dismissAgents', { agents: [a6] });
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[a3]!.state, 1000);
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'InTransit';
      const dead = world.agents[a5]!.state;
      dead.status = 'Killed';
      dead.turnTerminated = 1;
      dead.finalMaxHealth = dead.baseHealth;
      dead.finalWeaponDamage = dead.baseWeaponDamage;
      dead.finalArmor = dead.baseArmor;
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.assignment = null;
    });
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a2] });
    const damages = (s: CampaignState) =>
      [a1, a2, a3, a4, a5, a6].map((id) => effectiveValuesOf(s, id).weaponDamage);
    const before = state;

    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    expect(money(state)).toBe(100);
    expect(damages(state)).toEqual([12, 12, 12, 12, 10, 10]);
    // AGENT, Modifiable values: buying the Upgrade rewrites no Agent value, and a Terminated Agent keeps its Final
    // weapon damage.
    expect(agents(state)).toEqual(agents(before));
    expect(agents(state).every((a) => a.state.baseWeaponDamage === 10)).toBe(true);
    expect(agent(state, a5).state.finalWeaponDamage).toBe(10);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' }, 'not_enough_money');
    state = act(state, 'addMoney', { amount: 2400 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    expect(money(state)).toBe(500);
    expect(damages(state)).toEqual([14, 14, 14, 14, 10, 10]);
    state = act(state, 'hireAgent');
    state = act(state, 'addAgents', { count: 1 }, 'developer');
    expect(money(state)).toBe(450);
    expect(
      agentIds(state)
        .slice(6)
        .map((id) => effectiveValuesOf(state, id).weaponDamage),
    ).toEqual([14, 14]);
    expect(
      Object.values(state.world.current.enemies).every(
        (e) => e.state.baseWeaponDamage === gdrs.weapons.get(e.state.weapon)!.damage,
      ),
    ).toBe(true);
    // An Agent dismissed after the purchases records the effective weapon damage it had as its Final weapon damage.
    state = act(setAssignment(state, [a4], 'Standby'), 'dismissAgents', { agents: [a4] });
    expect(agent(state, a4).state.finalWeaponDamage).toBe(14);
    state = act(state, 'addMoney', { amount: 1550 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    expect(damages(state)).toEqual([16, 16, 16, 14, 10, 10]);
    expect(gdrs.weapons.get('combat_pistol')!.damage).toBe(10);
  });

  it('Armor Upgrade', () => {
    let state = setMoney(newCampaign(), 2500);
    const [a1, a2] = agentIds(state) as [string, string];
    const armors = (s: CampaignState) => agentIds(s).map((id) => effectiveValuesOf(s, id).armor);
    // GDRS: every Agent wears the Service armor, whose base armor is 0.
    expect(armors(state)).toEqual([0, 0, 0, 0]);
    expect(agents(state).every((a) => a.state.armor === 'service_armor' && a.state.baseArmor === 0)).toBe(
      true,
    );
    const beforePurchase = state;
    state = act(state, 'purchaseUpgrade', { upgrade: 'armor' });
    expect(money(state)).toBe(1500);
    // ECON, Armor Upgrade: effective armor = base armor + Upgrade bonus of agent_armor, at once, rewriting no value.
    expect(armors(state)).toEqual([5, 5, 5, 5]);
    expect(agents(state)).toEqual(agents(beforePurchase));
    // AGENT, Service record: a dismissed Agent keeps its effective armor as its Final armor.
    state = act(state, 'dismissAgents', { agents: [a1] });
    expect(agent(state, a1).state.finalArmor).toBe(5);
    state = act(state, 'purchaseUpgrade', { upgrade: 'armor' });
    expect([a1, a2].map((id) => effectiveValuesOf(state, id).armor)).toEqual([5, 10]);
    // Player API: each Agent's Armor and effective armor, a Terminated Agent's Final armor, and the effective armor
    // that the Armor Upgrade card of the Upgrades View shows.
    const live = currentLiveWorldStateView(state, gdrs);
    expect(live.agency.agentArmor).toBe(10);
    expect(live.agents.find((item) => item.id === a2)).toMatchObject({
      armor: 'service_armor',
      armorName: 'Service armor',
      baseArmor: 0,
      effectiveArmor: 10,
      finalArmor: null,
    });
    expect(currentRetiredWorldStateView(state, gdrs).agents.find((item) => item.id === a1)).toMatchObject({
      effectiveArmor: 5,
      finalArmor: 5,
    });
    // A new Agent has the effective armor of every other Serving Agent.
    state = act(state, 'hireAgent');
    expect(effectiveValuesOf(state, agentIds(state).at(-1)!).armor).toBe(10);
    // The first Combat after the purchase starts every Agent with the raised current armor; no Enemy is affected.
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a2] });
    state = advance(state, winning(state, site.site));
    const report = state.world.history.turnReport!.combatReports[0]!;
    expect(report.participants.find((item) => item.id === a2)!.start.armor).toBe(10);
    expect(
      report.participants.filter((item) => item.side === 'enemy').every((item) => item.start.armor === 0),
    ).toBe(true);
  });

  it('Max health and Rate Upgrades', () => {
    // No Upgrade is a Max health Upgrade, so this example adds one (GDRS, Economy and Upgrades GDRs).
    const withMaxHealth = catalogWith((raw) => {
      const file = raw.files.find((item) => item.gdrs.some((gdr) => gdr['type'] === 'Upgrade'))!;
      raw.add(file.path, {
        id: 'max_health',
        type: 'Upgrade',
        name: 'Max health',
        price: 500,
        effect: 'agent_max_health',
        increment: 1,
      });
    });
    let state = withAgents(setMoney(newCampaign({ catalog: withMaxHealth }), 3550), 4, withMaxHealth);
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    state = setAssignment(state, [a3], 'Training');
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exactExhaustionHundredths = 1200;
      const recovering = world.agents[a2]!.state;
      setCurrentHealth(recovering, 2000);
      recovering.exactExhaustionHundredths = 800;
      recovering.assignment = { kind: 'Recovery' };
      recovering.status = 'Recovering';
      const dead = world.agents[a4]!.state;
      dead.status = 'Killed';
      dead.turnTerminated = 1;
      dead.finalMaxHealth = dead.baseHealth;
      dead.finalWeaponDamage = dead.baseWeaponDamage;
      dead.finalArmor = dead.baseArmor;
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.exactExhaustionHundredths = 4000;
      dead.assignment = null;
    });
    const health = (s: CampaignState, id: string) => {
      const { currentHealth, maxHealth } = effectiveValuesOf(s, id, withMaxHealth);
      return [currentHealth, maxHealth];
    };
    const beforePurchase = state;

    state = act(state, 'purchaseUpgrade', { upgrade: 'max_health' }, 'player', withMaxHealth);
    expect(money(state)).toBe(3050);
    expect([a1, a2, a3, a4].map((id) => health(state, id))).toEqual([
      [31, 31],
      [21, 31],
      [31, 31],
      [0, 30],
    ]);
    // AGENT, Effective max health and current health: the purchase rewrites no Agent value.
    expect(agents(state)).toEqual(agents(beforePurchase));
    state = act(state, 'hireAgent', {}, 'player', withMaxHealth);
    expect(money(state)).toBe(3000);
    const a5 = agentIds(state).at(-1)!;
    expect(agent(state, a5).state).toMatchObject({
      status: 'InTransit',
      healthLostHundredths: 0,
      baseHealth: 30,
    });
    expect(health(state, a5)).toEqual([31, 31]);
    const before = state;
    state = act(state, 'purchaseUpgrade', { upgrade: 'exhaustion_recovery' }, 'player', withMaxHealth);
    // ECON, Rate Upgrades: 5 + 1 × 1 = 6.00, 2 + 1 × 1 = 3.00, and 1 + 0.5 × 1 = 1.50, held in hundredths.
    expect(agency(state)).toMatchObject({ money: 2000, exhaustionRecoveryHundredths: 600 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'health_recovery' }, 'player', withMaxHealth);
    expect(agency(state)).toMatchObject({ money: 1000, healthRecoveryPctHundredths: 300 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_skill_gain' }, 'player', withMaxHealth);
    expect(agency(state)).toMatchObject({ money: 0, trainingSkillGainHundredths: 150 });
    expect(agents(state)).toEqual(agents(before));

    // Money for Upkeep, so that the Campaign goes on to the next Advance turn; it changes no Agent value.
    state = act(state, 'addMoney', { amount: 1000 }, 'developer', withMaxHealth);
    state = advance(state, {}, withMaxHealth);
    // a3 gains 1.50 to 101.50; a1 loses 6 Exact exhaustion to 6, exhaustion 6; a2 loses 6 to 2, exhaustion 2, and
    // regains round up to hundredths(3 × 31 / 100) = 0.93, to 21.93 of 31.
    expect(agent(state, a3).state.skillHundredths).toBe(10150);
    expect(agent(state, a1).state.exactExhaustionHundredths).toBe(600);
    expect(exhaustionOf(agent(state, a1).state)).toBe(6);
    expect(units(agent(state, a2).state, 1)).toMatchObject({
      exactExhaustionHundredths: 200,
      currentHealthHundredths: 2193,
      baseHealth: 30,
    });
    expect(health(state, a2)).toEqual([21.93, 31]);
    expect(exhaustionOf(agent(state, a2).state)).toBe(2);
    state = advance(state, {}, withMaxHealth);
    // In the next Advance turn a1 falls to Exact exhaustion 0, where without the Upgrade it would be 1.
    expect(agent(state, a1).state.exactExhaustionHundredths).toBe(0);
    // AGENT, Service record: an Agent dismissed now keeps its effective max health as its Final max health, and a
    // later purchase changes it no more.
    state = act(state, 'dismissAgents', { agents: [a1] }, 'player', withMaxHealth);
    expect(agent(state, a1).state.finalMaxHealth).toBe(31);
    state = act(state, 'addMoney', { amount: 500 }, 'developer', withMaxHealth);
    state = act(state, 'purchaseUpgrade', { upgrade: 'max_health' }, 'player', withMaxHealth);
    expect([a1, a3].map((id) => health(state, id))).toEqual([
      [31, 31],
      [32, 32],
    ]);
  });

  it('Purchase rejections and exact affordability', () => {
    let state = setMoney(newCampaign(), 999);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'training_cap' }, 'not_enough_money');
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'agent_morale' }, 'unknown_upgrade');
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'combat_pistol' }, 'unknown_upgrade');
    for (const amount of [0, 2.5]) {
      expectRejected(state, 'addMoney', { amount }, 'invalid_amount', 'developer');
    }
    // addMoney(-5) would leave money −5.
    expectRejected(setMoney(newCampaign(), 0), 'addMoney', { amount: -5 }, 'negative_money', 'developer');
    state = act(state, 'addMoney', { amount: 1 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_cap' });
    expect(agency(state)).toMatchObject({ money: 0, trainingCap: 20 });
  });

  it('GDR validation', () => {
    expectDefective((raw) => (raw.get('weapon_damage')['effect'] = 'agent_morale'));
    expectDefective((raw) => delete raw.get('transport_cap')['increment']);
    expectDefective((raw) => (raw.get('agent_cap')['max_acquisitions'] = 3));
    expectDefective((raw) => (raw.get('training_cap')['price'] = -1));
    expectDefective((raw) => (raw.get('economy')['hire_cost'] = { $decimal: '12.5' }));
    // ECON, Economy GDR validation: contracting_skill_scale is a whole number of at least 100.
    expectDefective((raw) => (raw.get('economy')['contracting_skill_scale'] = 99));
    expectDefective((raw) => delete raw.get('economy')['contracting_skill_scale']);
    expectDefective((raw) =>
      raw.add('economy-and-upgrades/economy_parameters.yaml', { ...raw.get('economy'), id: 'economy_two' }),
    );
    expectDefective((raw) => (raw.get('standard')['starting_money'] = -100));
    expectDefective((raw) => (raw.get('configuration_parameters')['default_preset'] = 'hard'));
  });
});
