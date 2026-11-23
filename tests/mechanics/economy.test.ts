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
  useExampleCatalog,
} from '../helpers/game.ts';

// The EconomyParameters, Upgrades, and the other values of the examples, e.g. `contracting_skill_scale` 200, are
// Fixture values; see EXAMPLE_VALUES. What a test expects is derived from them by the rule it checks.
useExampleCatalog({ legacy: true });
const { economy } = gdrs;
const upgrade = (id: string) => gdrs.upgrades.find((item) => item.id === id)!;
/** The whole Increment of a Cap Upgrade or of the Weapon damage or Armor Upgrade. */
const increment = (id: string) => upgrade(id).incrementHundredths / 100;
/** An Agent's base weapon damage: that of the Weapon of the AgentArchetype. */
const agentWeaponDamage = () => gdrs.weapons.get(gdrs.agentArchetype.weapon)!.damage;
/** The contribution of an Agent of effective skill 100 on Contracting: exactly `contracting_income_per_agent`. */
const contracting = economy.contractingIncomePerAgent;

const agency = (state: CampaignState) => currentLiveWorldStateView(state, gdrs).agency;
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
    // newCampaign sets starting money 500 and starting funding 20 as Fixture values.
    const state = newCampaign();
    const view = agency(state);
    expect(view).toMatchObject({
      archetype: gdrs.agencyArchetype.id,
      name: gdrs.agencyArchetype.name,
      money: 500,
      funding: 20,
      agentCap: economy.baseAgentCap,
      transportCap: economy.baseTransportCap,
      trainingCap: economy.baseTrainingCap,
      // No Agent is on Contracting, so income is the funding; every Serving Agent costs upkeep.
      projectedIncome: 20,
      projectedUpkeep: agents(state).length * economy.upkeepPerAgent,
    });
    // Every Upgrade of the Game build, in its order, with no acquisition.
    expect(view.upgrades.map((u) => [u.id, u.acquisitions])).toEqual(gdrs.upgrades.map((u) => [u.id, 0]));
    expect(series(state)).toEqual({ start: [500], end: [] });
    // TURN, Prologue: a Campaign created without a Prologue keeps the value 0.
    expect(state.configuration).toEqual({ startingMoney: 500, startingFunding: 20, prologue: 0 });
    expect(agents(state).every((a) => a.state.baseWeaponDamage === agentWeaponDamage())).toBe(true);
    const rules = createGameRules(gdrs);
    const starting = rules.configurationValues.find((value) => value.key === 'startingMoney')!;
    expect(starting.adjustable).toBe(false);
    expect([800, 0, -1, 2.5].map((value) => starting.isPermitted(value))).toEqual([true, true, false, false]);
    expect(money(newCampaign({ money: 800 }))).toBe(800);
  });

  it('The first three Advance turns', () => {
    // Funding 20 and money 500 are newCampaign's Fixture values; every Agent has effective skill 100, so each on
    // Contracting earns exactly `contracting_income_per_agent`.
    const upkeep = economy.upkeepPerAgent;
    let state = newCampaign();
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    const roster = agentIds(state).length;
    const skill = agent(state, a3).state.skillHundredths;
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a3], assignment: 'Training' });
    // Under AGENT, Transit rule, a3 moves within base and is At assignment at once.
    expect(agent(state, a3).state.status).toBe('AtAssignment');
    // a1 and a2 are In transit to Contracting, so they earn nothing yet.
    expect(agency(state)).toMatchObject({ projectedIncome: 20, projectedUpkeep: roster * upkeep });
    state = advance(state);
    const turn2 = 500 + 20 - roster * upkeep;
    expect(state.world.history.turnReport).toMatchObject({
      income: { contractingAgents: 0, income: 20, moneyAfter: 520 },
      upkeep: { servingAgents: roster, upkeep: roster * upkeep, moneyAfter: turn2 },
    });
    expect(money(state)).toBe(turn2);

    state = act(state, 'hireAgents', { count: 1 });
    expect(money(state)).toBe(turn2 - economy.hireCost);
    const a5 = agentIds(state)[roster]!;
    expect(agency(state)).toMatchObject({
      projectedIncome: 20 + 2 * contracting,
      projectedUpkeep: (roster + 1) * upkeep,
    });
    state = advance(state);
    const turn3 = turn2 - economy.hireCost + 20 + 2 * contracting - (roster + 1) * upkeep;
    expect(state.world.history.turnReport).toMatchObject({
      income: {
        contractingAgents: 2,
        income: 20 + 2 * contracting,
        moneyAfter: turn2 - economy.hireCost + 20 + 2 * contracting,
      },
      upkeep: { servingAgents: roster + 1, upkeep: (roster + 1) * upkeep, moneyAfter: turn3 },
    });
    expect(agent(state, a3).state.skillHundredths).toBe(
      skill + 2 * gdrs.agentParameters.trainingSkillGainPerTurnHundredths,
    );

    // a5 is In transit to Contracting and a1 to Standby, so only a2 earns in the next Advance turn.
    state = act(state, 'assignAgents', { agents: [a5], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(agency(state)).toMatchObject({
      projectedIncome: 20 + contracting,
      projectedUpkeep: (roster + 1) * upkeep,
    });
    state = advance(state);
    const turn4 = turn3 + 20 + contracting - (roster + 1) * upkeep;
    expect(money(state)).toBe(turn4);
    // WHIST, Turn series, The current Turn from the Timeline: during Turn 4 the end-of-Turn Turn series has no value
    // for the current Turn, so it holds 3 values.
    expect(series(state)).toEqual({
      start: [500, turn2, turn3, turn4],
      end: [500, turn2 - economy.hireCost, turn3],
    });
    expect(agency(state).projectedIncome).toBe(20 + 2 * contracting);
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
    // Six Serving Agents: a1, a2, a3, a4, a5, and a6; a7 is Killed and a8 Dismissed. Only a5 is on Contracting and
    // arrived.
    const upkeep = economy.upkeepPerAgent;
    expect(agency(state)).toMatchObject({ projectedIncome: 20 + contracting, projectedUpkeep: 6 * upkeep });
    state = advance(state, losing(state, site.site));
    expect(state.world.history.turnReport).toMatchObject({
      income: { contractingAgents: 1, moneyAfter: 300 + 20 + contracting },
      upkeep: { servingAgents: 6, moneyAfter: 300 + 20 + contracting - 6 * upkeep },
    });
    expect(agent(state, a3).state.status).toBe('Killed');
    expect(agency(state).projectedUpkeep).toBe(5 * upkeep);
    void a1;
  });

  it('Negative money', () => {
    // Money 15 and no funding: the upkeep of the Serving Agents takes money below 0.
    const upkeep = agentIds(newCampaign()).length * economy.upkeepPerAgent;
    expect(upkeep).toBeGreaterThan(15);
    let state = advance(setMoney(newCampaign(), 15, 0));
    // No later step raises money to at least 0, so the Ending check step records a Campaign ending.
    expect(money(state)).toBe(15 - upkeep);
    expect(series(state).start.at(-1)).toBe(15 - upkeep);
    expect(state.world.current.ending).toBe('Defeat');
    expectRejected(state, 'hireAgents', { count: 1 }, 'campaign_ended');
    // In another Campaign, with money 15, addMoney removes money but never below 0.
    state = setMoney(newCampaign(), 15, 0);
    state = act(state, 'addMoney', { amount: -15 }, 'developer');
    expect(money(state)).toBe(0);
    expectRejected(state, 'addMoney', { amount: -1 }, 'negative_money', 'developer');
    expect(money(state)).toBe(0);
    state = act(state, 'addMoney', { amount: economy.hireCost + 25 }, 'developer');
    state = act(state, 'hireAgents', { count: 1 });
    expect(money(state)).toBe(25);
  });

  it('Funding changes from Mission sites', () => {
    expect(fundingAfter(3, [-10])).toBe(0);
    expect(fundingAfter(3, [5, -10])).toBe(0);
    expect(fundingAfter(3, [-10, 5])).toBe(0);
    expect(fundingAfter(0, [5, -1])).toBe(4);
    expect(fundingAfter(0, [-1])).toBe(0);

    // Win of a Faction operation level 2 site: its money and funding rewards, the funding after this Advance turn's
    // income, which the next Agency income step uses.
    const reward = gdrs.factionOperationLevels.find((level) => level.level === 2)!.onWin;
    const site = addMissionSite(newCampaign(), 'foil_sabotage');
    const team = agentIds(site.state);
    let state = act(site.state, 'deployAgents', { missionSite: site.site, agents: team });
    state = advance(state, winning(state, site.site));
    expect(state.world.history.turnReport!.income.funding).toBe(20);
    expect(funding(state)).toBe(20 + reward.funding);
    expect(money(state)).toBe(500 + 20 - team.length * economy.upkeepPerAgent + reward.money);
    expect(agency(state).projectedIncome).toBe(20 + reward.funding);

    // Loss at the floor: an Expired Response Mission site with funding 0.
    const expiring = addMissionSite(setMoney(newCampaign(), 500, 0), 'foil_sabotage', {
      turnsUntilExpiration: 1,
    });
    expect(funding(advance(expiring.state))).toBe(0);
  });

  it('Hiring at the Agent cap', () => {
    const cap = economy.baseAgentCap;
    const added = increment('agent_cap');
    const hire = economy.hireCost;
    // Money for the Upgrade and for one more Agent than it makes room for.
    let state = withAgents(setMoney(newCampaign(), upgrade('agent_cap').price + (added + 1) * hire), cap + 1);
    const ids = agentIds(state);
    state = tweak(state, (world) => {
      const dead = world.agents[ids[cap]!]!.state;
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
    // The Killed Agent does not count, and the Agent In transit does: the Serving Agents are exactly at the cap.
    expectRejected(state, 'hireAgents', { count: 1 }, 'agent_cap');
    state = act(state, 'purchaseUpgrade', { upgrade: 'agent_cap' });
    expect(agency(state)).toMatchObject({
      money: (added + 1) * hire,
      agentCap: cap + added,
      servingAgents: cap,
    });
    for (let i = 0; i < added; i += 1) {
      state = act(state, 'hireAgents', { count: 1 });
    }
    // At the raised cap, with money for one more Agent, hiring is rejected for the cap.
    expect(agency(state)).toMatchObject({ money: hire, servingAgents: cap + added });
    expectRejected(state, 'hireAgents', { count: 1 }, 'agent_cap');

    expect(money(act(setMoney(newCampaign(), hire), 'hireAgents', { count: 1 }))).toBe(0);
    expectRejected(setMoney(newCampaign(), hire - 1), 'hireAgents', { count: 1 }, 'not_enough_money');

    let over = withAgents(newCampaign(), cap);
    over = act(over, 'addAgents', { count: 3 }, 'developer');
    expect(agency(over)).toMatchObject({ servingAgents: cap + 3, agentCap: cap });
    expectRejected(over, 'hireAgents', { count: 1 }, 'agent_cap');
  });

  it('Hiring Agents: count Agents in one Player action, rejected as a whole when they do not all fit', () => {
    const hire = gdrs.economy.hireCost;
    const cap = agency(newCampaign()).agentCap;
    const start = setMoney(newCampaign(), 5 * hire);
    const serving = agency(start).servingAgents;
    const three = act(start, 'hireAgents', { count: 3 });
    // The same World state as three hires of one Agent each.
    let one = start;
    for (let i = 0; i < 3; i += 1) {
      one = act(one, 'hireAgents', { count: 1 });
    }
    expect(three.world.current).toEqual(one.world.current);
    expect(agency(three)).toMatchObject({ money: 2 * hire, servingAgents: serving + 3 });
    // Money for 5 Agents does not cover 6, and the Agent cap leaves room for no more than cap - serving.
    expectRejected(start, 'hireAgents', { count: 6 }, 'not_enough_money');
    expectRejected(
      setMoney(newCampaign(), cap * hire),
      'hireAgents',
      { count: cap - serving + 1 },
      'agent_cap',
    );
    expectRejected(start, 'hireAgents', { count: 0 }, 'invalid_count');
    expectRejected(start, 'hireAgents', { count: 1.5 }, 'invalid_count');
    // A Timeline entry written before hiring took a count names hireAgent and hires one Agent.
    expect(act(start, 'hireAgent').world.current).toEqual(
      act(start, 'hireAgents', { count: 1 }).world.current,
    );
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
    // Five Serving Agents: every Agent but the Killed a6.
    expect(agency(state).projectedUpkeep).toBe(5 * economy.upkeepPerAgent);
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
    // Dismissing costs and refunds nothing.
    expect(agency(next)).toMatchObject({ money: 120, projectedUpkeep: 3 * economy.upkeepPerAgent });
    expect(currentRetiredWorldStateView(next, gdrs).agents.map((a) => a.id)).toEqual([a1, a2, a6]);
  });

  it('Transport cap', () => {
    const cap = economy.baseTransportCap;
    const added = increment('transport_cap');
    let state = withAgents(setMoney(newCampaign(), upgrade('transport_cap').price + 500), cap + added);
    const ids = agentIds(state);
    const s1 = addMissionSite(state, 'foil_recruitment_push');
    const s2 = addMissionSite(s1.state, 'apprehend_member');
    // One place left under the cap, and two Agents to deploy.
    state = act(s2.state, 'deployAgents', { missionSite: s1.site, agents: ids.slice(0, cap - 1) });
    expectRejected(
      state,
      'deployAgents',
      { missionSite: s2.site, agents: ids.slice(cap - 1, cap + 1) },
      'transport_cap',
    );
    state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    expect(agency(state)).toMatchObject({ money: 500, transportCap: cap + added });
    // The raised cap takes the rest, exactly to the cap.
    state = act(state, 'deployAgents', { missionSite: s2.site, agents: ids.slice(cap - 1) });
    expect(agency(state).deployedAgents).toBe(cap + added);
    state = advance(state);
    expect(agency(state).deployedAgents).toBe(0);
  });

  it('Training cap', () => {
    const cap = economy.baseTrainingCap;
    const added = increment('training_cap');
    const price = upgrade('training_cap').price;
    expect(added).toBeGreaterThanOrEqual(4);
    let state = withAgents(setMoney(newCampaign(), price + 50), cap + 5);
    const ids = agentIds(state);
    const trainees = ids.slice(0, cap - 1);
    const [a1, a2, a3, a4, a5, a6] = ids.slice(cap - 1) as [string, string, string, string, string, string];
    state = setAssignment(state, trainees, 'Training');
    expectRejected(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Training' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Training' },
      status: 'AtAssignment',
    });
    expect(agency(state).trainingAgents).toBe(cap);
    expectRejected(state, 'assignAgents', { agents: [a2], assignment: 'Training' }, 'training_cap');
    state = act(state, 'assignAgents', { agents: [a2], assignment: 'Contracting' });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_cap' });
    expect(agency(state)).toMatchObject({ money: 50, trainingCap: cap + added });
    state = act(state, 'assignAgents', { agents: [a3, a4, a5, a6], assignment: 'Training' });
    expect(agency(state).trainingAgents).toBe(cap + 4);
    // An Agent that leaves Training no longer counts.
    state = act(state, 'assignAgents', { agents: [trainees[0]!], assignment: 'Standby' });
    expect(agency(state).trainingAgents).toBe(cap + 3);
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'training_cap' }, 'not_enough_money');
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
    // Money for the Max health Upgrade, one hire, and one of each Rate Upgrade.
    const rates = ['exhaustion_recovery', 'health_recovery', 'training_skill_gain'] as const;
    const [exhaustionPrice, healthPrice, trainingPrice] = rates.map((id) => upgrade(id).price) as [
      number,
      number,
      number,
    ];
    const ratePrices = exhaustionPrice + healthPrice + trainingPrice;
    const start = 500 + economy.hireCost + ratePrices;
    let state = withAgents(setMoney(newCampaign({ catalog: withMaxHealth }), start), 4, withMaxHealth);
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
    expect(money(state)).toBe(start - 500);
    expect([a1, a2, a3, a4].map((id) => health(state, id))).toEqual([
      [31, 31],
      [21, 31],
      [31, 31],
      [0, 30],
    ]);
    // AGENT, Effective max health and current health: the purchase rewrites no Agent value.
    expect(agents(state)).toEqual(agents(beforePurchase));
    state = act(state, 'hireAgents', { count: 1 }, 'player', withMaxHealth);
    expect(money(state)).toBe(ratePrices);
    const a5 = agentIds(state).at(-1)!;
    expect(agent(state, a5).state).toMatchObject({
      status: 'InTransit',
      healthLostHundredths: 0,
      baseHealth: gdrs.agentArchetype.baseHealth,
    });
    expect(health(state, a5)).toEqual([31, 31]);
    const before = state;
    state = act(state, 'purchaseUpgrade', { upgrade: 'exhaustion_recovery' }, 'player', withMaxHealth);
    // ECON, Rate Upgrades: each rate is its parameter plus the Increment of each acquisition, held in hundredths,
    // e.g. 5 + 1 × 1 = 6.00, 2 + 1 × 1 = 3.00, and 1 + 0.5 × 1 = 1.50 with the values of the example.
    const rateOf = (id: (typeof rates)[number]) => upgrade(id).incrementHundredths;
    const recovery = gdrs.recoveryParameters;
    expect(agency(state)).toMatchObject({
      money: healthPrice + trainingPrice,
      exhaustionRecoveryHundredths:
        recovery.exhaustionRecoveryPerTurnHundredths + rateOf('exhaustion_recovery'),
    });
    state = act(state, 'purchaseUpgrade', { upgrade: 'health_recovery' }, 'player', withMaxHealth);
    expect(agency(state)).toMatchObject({
      money: trainingPrice,
      healthRecoveryPctHundredths: recovery.healthRecoveryPctPerTurnHundredths + rateOf('health_recovery'),
    });
    state = act(state, 'purchaseUpgrade', { upgrade: 'training_skill_gain' }, 'player', withMaxHealth);
    expect(agency(state)).toMatchObject({
      money: 0,
      trainingSkillGainHundredths:
        gdrs.agentParameters.trainingSkillGainPerTurnHundredths + rateOf('training_skill_gain'),
    });
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
      baseHealth: gdrs.agentArchetype.baseHealth,
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
    // One less than the price, then exactly the price.
    let state = setMoney(newCampaign(), upgrade('training_cap').price - 1);
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
    expect(agency(state)).toMatchObject({
      money: 0,
      trainingCap: economy.baseTrainingCap + increment('training_cap'),
    });
  });

  it('GDR validation', () => {
    expectDefective((raw) => (raw.get('training_cap')['effect'] = 'agent_morale'));
    // ECON, Upgrade effects: no Upgrade raises weapon damage or armor any more.
    expectDefective((raw) => (raw.get('training_cap')['effect'] = 'agent_weapon_damage'));
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
