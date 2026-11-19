/** Tests, from the former Acceptance examples, of ECON (Economy and Upgrades). */
import { describe, expect, it } from 'vite-plus/test';
import { exhaustionOf } from '../../src/engine/mechanics/agents/agents.ts';
import { contractingContribution, fundingAfter, income } from '../../src/engine/mechanics/economy/economy.ts';
import { createGameRules } from '../../src/engine/game-rules.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView, historyView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
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

const agency = (state: CampaignState) => currentStateView(state, gdrs).agency;
const series = (state: CampaignState) => {
  const { moneyAtStartOfTurn, moneyAtEndOfTurn } = historyView(state, gdrs).turnSeries;
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
      transportCap: 4,
      trainingCap: 4,
      projectedIncome: 20,
      projectedUpkeep: 40,
    });
    expect(view.upgrades.map((u) => [u.id, u.acquisitions])).toEqual([
      ['agent_cap', 0],
      ['transport_cap', 0],
      ['training_cap', 0],
      ['weapon_damage', 0],
      ['max_health', 0],
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
    const view = currentStateView(state, gdrs);
    expect(view.agents.slice(0, 3).map((a) => a.effectiveSkill)).toEqual([100, 83, 91]);
    expect(contractingContribution(83, gdrs.economy).toString()).toBe('1449/50');
    expect(contractingContribution(91, gdrs.economy).toString()).toBe('1473/50');
    // 20 + round down(30 + 28.98 + 29.46) = 108; rounding each contribution on its own would give 107.
    expect(agency(state).projectedIncome).toBe(108);
    state = advance(state);
    expect(state.world.history.turnReport!.income).toMatchObject({ contractingAgents: 3, income: 108 });
    expect([c1, c2, c3].map((id) => agent(state, id).state.exactExhaustionHundredths / 100)).toEqual([
      11, 48, 70,
    ]);
    expect(units(agent(state, c3).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agency(state).projectedIncome).toBe(78);
    // e.g. effective skill 100, 83, and 150 give round down(91.98) = 91.
    expect(income(0, [100, 83, 150], gdrs.economy)).toBe(91);
    // An Agent with effective skill 0 still contributes four fifths.
    expect(contractingContribution(0, gdrs.economy).toString()).toBe('24');
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

    // Win: money +30 and funding 20 + 5, which the next Agency income step uses.
    const site = addMissionSite(newCampaign(), 'foil_sabotage');
    let state = act(site.state, 'deployAgents', { missionSite: site.site, agents: agentIds(site.state) });
    state = advance(state, winning(state, site.site));
    expect(state.world.history.turnReport!.income.funding).toBe(20);
    expect(funding(state)).toBe(25);
    expect(money(state)).toBe(500 + 20 - 40 + 30);
    expect(agency(state).projectedIncome).toBe(25);

    // Loss at the floor: an Expired Response Mission site with funding 0.
    const expiring = addMissionSite(setMoney(newCampaign(), 500, 0), 'foil_sabotage', {
      turnsUntilExpiration: 1,
    });
    expect(funding(advance(expiring.state))).toBe(0);
  });

  it('Hiring at the Agent cap', () => {
    let state = withAgents(setMoney(newCampaign(), 500), 21);
    const ids = agentIds(state);
    state = tweak(state, (world) => {
      const dead = world.agents[ids[20]!]!.state;
      dead.status = 'Killed';
      dead.turnTerminated = 1;
      dead.finalMaxHealth = dead.baseHealth;
      dead.finalWeaponDamage = dead.baseWeaponDamage;
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.assignment = null;
      world.agents[ids[0]!]!.state.status = 'InTransit';
    });
    expectRejected(state, 'hireAgent', {}, 'agent_cap');
    state = act(state, 'purchaseUpgrade', { upgrade: 'agent_cap' });
    expect(agency(state)).toMatchObject({ money: 300, agentCap: 24, servingAgents: 20 });
    for (let i = 0; i < 4; i += 1) {
      state = act(state, 'hireAgent');
    }
    expect(agency(state)).toMatchObject({ money: 100, servingAgents: 24 });
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
    expect(historyView(next, gdrs).retained.agents.map((a) => a.id)).toEqual([a1, a2, a6]);
  });

  it('Transport cap', () => {
    let state = withAgents(setMoney(newCampaign(), 1000), 9);
    const ids = agentIds(state);
    const s1 = addMissionSite(state, 'foil_recruitment_push');
    const s2 = addMissionSite(s1.state, 'apprehend_member');
    state = act(s2.state, 'deployAgents', { missionSite: s1.site, agents: ids.slice(0, 3) });
    expectRejected(state, 'deployAgents', { missionSite: s2.site, agents: ids.slice(3, 5) }, 'transport_cap');
    state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    expect(agency(state)).toMatchObject({ money: 0, transportCap: 6 });
    state = act(state, 'deployAgents', { missionSite: s2.site, agents: ids.slice(3, 6) });
    expect(agency(state).deployedAgents).toBe(6);
    state = advance(state);
    expect(agency(state).deployedAgents).toBe(0);
  });

  it('Training cap', () => {
    let state = withAgents(setMoney(newCampaign(), 250), 9);
    const [t1, t2, t3, a1, a2, a3, a4, a5, a6] = agentIds(state) as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state = setAssignment(state, [t1, t2, t3], 'Training');
    expectRejected(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Training' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Training' },
      status: 'AtAssignment',
    });
    expect(agency(state).trainingAgents).toBe(4);
    expectRejected(state, 'assignAgents', { agents: [a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a2], assignment: 'Contracting' });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_cap' });
    expect(agency(state)).toMatchObject({ money: 50, trainingCap: 8 });
    state = act(state, 'assignAgents', { agents: [a3, a4, a5, a6], assignment: 'Training' });
    expect(agency(state).trainingAgents).toBe(8);
    state = act(state, 'assignAgents', { agents: [t1], assignment: 'Standby' });
    expect(agency(state).trainingAgents).toBe(7);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'training_cap' }, 'not_enough_money');
  });

  it('Weapon damage Upgrade', () => {
    let state = withAgents(setMoney(newCampaign(), 600), 6);
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
    expect(damages(state)).toEqual([11, 11, 11, 11, 10, 10]);
    // AGENT, Modifiable values: buying the Upgrade rewrites no Agent value, and a Terminated Agent keeps its Final
    // weapon damage.
    expect(agents(state)).toEqual(agents(before));
    expect(agents(state).every((a) => a.state.baseWeaponDamage === 10)).toBe(true);
    expect(agent(state, a5).state.finalWeaponDamage).toBe(10);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' }, 'not_enough_money');
    state = act(state, 'addMoney', { amount: 900 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    expect(money(state)).toBe(500);
    expect(damages(state)).toEqual([12, 12, 12, 12, 10, 10]);
    state = act(state, 'hireAgent');
    state = act(state, 'addAgents', { count: 1 }, 'developer');
    expect(money(state)).toBe(450);
    expect(
      agentIds(state)
        .slice(6)
        .map((id) => effectiveValuesOf(state, id).weaponDamage),
    ).toEqual([12, 12]);
    expect(Object.values(state.world.current.enemies).every((e) => e.state.baseWeaponDamage === 10)).toBe(
      true,
    );
    // An Agent dismissed after the purchases records the effective weapon damage it had as its Final weapon damage.
    state = act(setAssignment(state, [a4], 'Standby'), 'dismissAgents', { agents: [a4] });
    expect(agent(state, a4).state.finalWeaponDamage).toBe(12);
    state = act(state, 'addMoney', { amount: 500 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    expect(damages(state)).toEqual([13, 13, 13, 12, 10, 10]);
    expect(gdrs.weapons.get('sidearm')!.damage).toBe(10);
  });

  it('Max health and Rate Upgrades', () => {
    let state = withAgents(setMoney(newCampaign(), 2050), 4);
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
      dead.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(dead, 0);
      dead.exactExhaustionHundredths = 4000;
      dead.assignment = null;
    });
    const health = (s: CampaignState, id: string) => {
      const { currentHealth, maxHealth } = effectiveValuesOf(s, id);
      return [currentHealth, maxHealth];
    };
    const beforePurchase = state;

    state = act(state, 'purchaseUpgrade', { upgrade: 'max_health' });
    expect(money(state)).toBe(1550);
    expect([a1, a2, a3, a4].map((id) => health(state, id))).toEqual([
      [31, 31],
      [21, 31],
      [31, 31],
      [0, 30],
    ]);
    // AGENT, Effective max health and current health: the purchase rewrites no Agent value.
    expect(agents(state)).toEqual(agents(beforePurchase));
    state = act(state, 'hireAgent');
    expect(money(state)).toBe(1500);
    const a5 = agentIds(state).at(-1)!;
    expect(agent(state, a5).state).toMatchObject({
      status: 'InTransit',
      healthLostHundredths: 0,
      baseHealth: 30,
    });
    expect(health(state, a5)).toEqual([31, 31]);
    const before = state;
    state = act(state, 'purchaseUpgrade', { upgrade: 'exhaustion_recovery' });
    // ECON, Rate Upgrades: 5 + 0.5 × 1 = 5.50, 2 + 0.2 × 1 = 2.20, and 1 + 0.1 × 1 = 1.10, held in hundredths.
    expect(agency(state)).toMatchObject({ money: 1000, exhaustionRecoveryHundredths: 550 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'health_recovery' });
    expect(agency(state)).toMatchObject({ money: 500, healthRecoveryPctHundredths: 220 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_skill_gain' });
    expect(agency(state)).toMatchObject({ money: 0, trainingSkillGainHundredths: 110 });
    expect(agents(state)).toEqual(agents(before));

    // Money for Upkeep, so that the Campaign goes on to the next Advance turn; it changes no Agent value.
    state = act(state, 'addMoney', { amount: 1000 }, 'developer');
    state = advance(state);
    // a3 gains 1.10 to 101.10; a1 loses 5.50 Exact exhaustion to 6.50, exhaustion 7; a2 loses 5.50 to 2.50,
    // exhaustion 3, and regains round up to hundredths(2.2 × 31 / 100) = 0.69, to 21.69 of 31.
    expect(agent(state, a3).state.skillHundredths).toBe(10110);
    expect(agent(state, a1).state.exactExhaustionHundredths).toBe(650);
    expect(exhaustionOf(agent(state, a1).state)).toBe(7);
    expect(units(agent(state, a2).state, 1)).toMatchObject({
      exactExhaustionHundredths: 250,
      currentHealthHundredths: 2169,
      baseHealth: 30,
    });
    expect(health(state, a2)).toEqual([21.69, 31]);
    expect(exhaustionOf(agent(state, a2).state)).toBe(3);
    state = advance(state);
    // In the next Advance turn a1 falls to Exact exhaustion 1, where without the Upgrade it would be 2.
    expect(agent(state, a1).state.exactExhaustionHundredths).toBe(100);
    // AGENT, Service record: an Agent dismissed now keeps its effective max health as its Final max health, and a
    // later purchase changes it no more.
    state = act(state, 'dismissAgents', { agents: [a1] });
    expect(agent(state, a1).state.finalMaxHealth).toBe(31);
    state = act(state, 'addMoney', { amount: 500 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'max_health' });
    expect([a1, a3].map((id) => health(state, id))).toEqual([
      [31, 31],
      [32, 32],
    ]);
  });

  it('Purchase rejections and exact affordability', () => {
    let state = setMoney(newCampaign(), 199);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'training_cap' }, 'not_enough_money');
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'agent_morale' }, 'unknown_upgrade');
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'sidearm' }, 'unknown_upgrade');
    for (const amount of [0, 2.5]) {
      expectRejected(state, 'addMoney', { amount }, 'invalid_amount', 'developer');
    }
    // addMoney(-5) would leave money −5.
    expectRejected(setMoney(newCampaign(), 0), 'addMoney', { amount: -5 }, 'negative_money', 'developer');
    state = act(state, 'addMoney', { amount: 1 }, 'developer');
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_cap' });
    expect(agency(state)).toMatchObject({ money: 0, trainingCap: 8 });
  });

  it('GDR validation', () => {
    expectDefective((raw) => (raw.get('weapon_damage')['effect'] = 'agent_morale'));
    expectDefective((raw) => delete raw.get('transport_cap')['increment']);
    expectDefective((raw) => (raw.get('agent_cap')['max_acquisitions'] = 3));
    expectDefective((raw) => (raw.get('training_cap')['price'] = -1));
    expectDefective((raw) => (raw.get('economy')['hire_cost'] = { $decimal: '12.5' }));
    expectDefective((raw) =>
      raw.add('economy-and-upgrades/economy_parameters.yaml', { ...raw.get('economy'), id: 'economy_two' }),
    );
    expectDefective((raw) => (raw.get('standard')['starting_money'] = -100));
    expectDefective((raw) => (raw.get('configuration_parameters')['default_preset'] = 'hard'));
  });
});
