/** Tests, from the former Acceptance examples, of TURN (Turn Advancement), and its order-independence guarantee as a property. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import type { Random } from '../../src/engine/random.ts';
import { isRejection } from '../../src/engine/result.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView, historyView } from '../../src/engine/views/views.ts';
import { chance, seedRng, uniformBelow, uniformInt, type RngState } from '../../src/kernel/index.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  allHit,
  allMiss,
  catalogWith,
  funding,
  gdrs,
  losing,
  money,
  newCampaign,
  onlyFaction,
  setAssignment,
  tweak,
  winning,
  withAgents,
  units,
} from '../helpers/game.ts';

const set = (
  state: CampaignState,
  values: { panic?: number; money?: number; funding?: number; turn?: number },
) =>
  tweak(state, (world) => {
    world.panic = values.panic ?? world.panic;
    world.agency.state.money = values.money ?? world.agency.state.money;
    world.agency.state.funding = values.funding ?? world.agency.state.funding;
    world.turn = values.turn ?? world.turn;
  });
const setFaction = (state: CampaignState, level: string, untilLevel: number | null, untilOperation: number) =>
  tweak(state, (world) => {
    const faction = Object.values(world.factions)[0]!;
    faction.state.activityLevel = level;
    faction.state.turnsUntilNextLevel = untilLevel;
    faction.state.turnsUntilNextOperation = untilOperation;
  });
const series = (state: CampaignState) => {
  const { moneyAtStartOfTurn, moneyAtEndOfTurn } = historyView(state, gdrs).turnSeries;
  return { start: moneyAtStartOfTurn.map((v) => v.value), end: moneyAtEndOfTurn.map((v) => v.value) };
};

describe('TURN: examples', () => {
  it('The first two Advance turns of a Campaign', () => {
    let state = setFaction(newCampaign(), 'faint', 60, 15);
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a3], assignment: 'Training' });
    // The injected Required progress outcome 3 gives i1 the Actual required progress 3.
    state = tweak(state, (world) => {
      world.randomOverrides.push({
        outcome: 'investigation.requiredProgress.locate_red_dawn_member',
        value: 3,
      });
    });
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a4] });
    const i1 = Object.keys(state.world.current.investigations)[0]!;
    expect(state.world.current.investigations[i1]!.constants.actualRequiredProgress).toBe(3);
    // Under AGENT, Transit rule, a3 moves within base and is At assignment at once.
    expect(agent(state, a3).state.status).toBe('AtAssignment');

    state = advance(state);
    let report = state.world.history.turnReport!;
    expect(report).toMatchObject({
      turn: 1,
      transit: { arrived: [a1, a2, a4] },
      income: { income: 20, moneyAfter: 520 },
      upkeep: { upkeep: 40, moneyAfter: 480 },
      training: [{ agent: a3, gained: true, skillAfterHundredths: 10100, exhaustionAfter: 1 }],
      forcedReturns: [],
      investigations: [{ investigation: i1, progressGain: 0, progressAfter: 0, completed: false }],
      missions: [],
      recovery: [],
      panic: { before: 0, after: 0 },
      ending: null,
    });
    expect(agent(state, a3).state.skillHundredths / 100).toBe(101);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 59, turnsUntilNextOperation: 14 });
    expect(state.world.current.turn).toBe(2);
    expect(series(state)).toEqual({ start: [500, 480], end: [500] });

    const view = currentStateView(state, gdrs);
    expect(view.agency).toMatchObject({ projectedIncome: 80, projectedUpkeep: 40 });
    expect(view.investigations[0]!.projectedProgressGain).toBe(100);

    state = advance(state);
    report = state.world.history.turnReport!;
    expect(report).toMatchObject({
      turn: 2,
      transit: { arrived: [] },
      income: { contractingAgents: 2, income: 80, moneyAfter: 560 },
      upkeep: { moneyAfter: 520 },
      training: [{ agent: a3, gained: true, skillAfterHundredths: 10200, exhaustionAfter: 2 }],
      investigations: [{ progressGain: 100, becameAssessed: true, progressAfter: 100, completed: false }],
    });
    // Each Agent that worked gains 1 exhaustion after its work: a1 and a2 in Agency income, a4 in Investigation
    // progress.
    expect([a1, a2, a3, a4].map((id) => agent(state, id).state.exactExhaustionHundredths / 100)).toEqual([
      1, 1, 2, 1,
    ]);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 58, turnsUntilNextOperation: 13 });
    expect(series(state)).toEqual({ start: [500, 480, 520], end: [500, 480] });
    expect(state.world.current.turn).toBe(3);
    expect(historyView(state, gdrs).entries.map((entry) => entry.turn)).toEqual([1, 2]);
  });

  it('Deployment, Combat, return, and recovery', () => {
    const created = addMissionSite(set(newCampaign({ money: 5000 }), { turn: 5 }), 'apprehend_member', {
      turnsUntilExpiration: 4,
    });
    let state = created.state;
    const [a1, a2] = agentIds(state) as [string, string];
    const [e1, e2, e3] = state.world.current.missionSites[created.site]!.state.enemies as [
      string,
      string,
      string,
    ];
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    // a2 is hit once for 12; every other Enemy attack misses.
    state = advance(state, {
      ...allHit([a1, a2], 15),
      ...allMiss([e1, e3]),
      [`combat.hit.${e2}`]: [false, false],
      [`combat.hit.${e1}`]: [false, false],
      [`combat.hit.${e3}`]: [true, false],
      [`combat.damage.${e3}`]: [12],
    });
    const report = state.world.history.turnReport!;
    expect(report.missions[0]).toMatchObject({ result: 'Won', consequence: { money: 5, panicReduction: 1 } });
    expect(report.upkeep.servingAgents).toBe(4);
    const wounded = [a1, a2].find((id) => agent(state, id).state.currentHealthHundredths / 100 < 30)!;
    const unharmed = [a1, a2].find((id) => id !== wounded)!;
    expect(units(agent(state, wounded).state)).toMatchObject({
      currentHealth: 18,
      assignment: { kind: 'Recovery' },
      status: 'InTransit',
    });
    expect(units(agent(state, unharmed).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    // In Turn 6 neither survivor can be assigned: both are In transit.
    const survivors = currentStateView(state, gdrs).agents.filter((a) => a.id === a1 || a.id === a2);
    expect(survivors.map((a) => a.canBeAssigned)).toEqual([false, false]);
    expect(report.recovery).toEqual([]);
    expect(state.world.current.missionSites[created.site]!.state.turnsUntilExpiration).toBe(4);
    // Each survivor gains 5 Mission exhaustion on top of what its Combat left.
    for (const id of [a1, a2]) {
      const combat = report.combatReports[0]!.participants.find((item) => item.id === id)!.final.exhaustion;
      expect(agent(state, id).state.exactExhaustionHundredths / 100).toBe(combat + 5);
    }
    const exhaustion = agent(state, wounded).state.exactExhaustionHundredths / 100;

    state = advance(state); // both arrive; nothing recovers
    expect(units(agent(state, wounded).state)).toMatchObject({
      currentHealth: 18,
      exhaustion,
      status: 'Recovering',
    });
    // round up((30 − 18) / 0.60) = 20.
    expect(currentStateView(state, gdrs).agents.find((a) => a.id === wounded)!.recoveryTurnsRemaining).toBe(
      20,
    );
    state = advance(state);
    expect(units(agent(state, wounded).state)).toMatchObject({
      currentHealthHundredths: 1860,
      exhaustion: Math.max(0, exhaustion - 5),
    });
    for (let i = 0; i < 18; i += 1) {
      state = advance(state);
    }
    expect(units(agent(state, wounded).state)).toMatchObject({
      currentHealthHundredths: 2940,
      assignment: { kind: 'Recovery' },
    });
    // 29.40 + 0.60 = 30, its base health.
    state = advance(state);
    expect(units(agent(state, wounded).state)).toMatchObject({
      currentHealthHundredths: 3000,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
  });

  function lastTurnState(): { state: CampaignState; s3: string; s4: string; s5: string; ids: string[] } {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    state = tweak(state, (world) => {
      world.agency.state.acquisitions['transport_cap'] = 3;
    });
    state = setFaction(set(state, { money: 1000, funding: 25, panic: 95, turn: 150 }), 'war', null, 1);
    const ids = agentIds(state);
    const s3 = addMissionSite(state, 'raid_hq');
    const s4 = addMissionSite(s3.state, 'foil_sabotage');
    const s5 = addMissionSite(s4.state, 'foil_recruitment_push', { turnsUntilExpiration: 1 });
    state = act(s5.state, 'deployAgents', { missionSite: s3.site, agents: ids.slice(0, 8) });
    state = act(state, 'deployAgents', { missionSite: s4.site, agents: ids.slice(8, 9) });
    state = setAssignment(state, ids.slice(9, 12), 'Contracting');
    return { state, s3: s3.site, s4: s4.site, s5: s5.site, ids };
  }

  it('The last Faction Eliminated while Panic reaches the limit', () => {
    const { state, s3, s4, s5, ids } = lastTurnState();
    const a9 = ids[8]!;
    const responseEnemies = state.world.current.missionSites[s4]!.state.enemies;
    const injected = {
      ...winning(state, s3),
      // a9 misses; one soldier hits a9 for 21 and the Combat ends as Retreated.
      [`combat.hit.${a9}`]: [false],
      ...allMiss(responseEnemies.slice(0, 4)),
      [`combat.hit.${responseEnemies[4]}`]: [true],
      [`combat.damage.${responseEnemies[4]}`]: [21],
      [`combat.hit.${responseEnemies[5]}`]: [false],
    };
    const forward = advance(state, injected);
    const reversed = advance(state, injected, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    const report = forward.world.history.turnReport!;
    expect(report.income).toMatchObject({ income: 115, moneyAfter: 1115 });
    expect(report.upkeep).toMatchObject({ servingAgents: 12, upkeep: 120, moneyAfter: 995 });
    expect(report.missions.map((m) => m.result)).toEqual(['Won', 'Lost']);
    expect(report.combatReports[1]!.outcome).toBe('Retreated');
    expect(units(agent(forward, a9).state)).toMatchObject({
      currentHealth: 9,
      assignment: { kind: 'Recovery' },
      status: 'InTransit',
    });
    expect(report.cancelledMissionSites).toEqual([s5]);
    expect(report.expiredMissionSites).toEqual([]);
    expect(report.factionActivity).toEqual([]);
    expect(onlyFaction(forward).state).toMatchObject({
      eliminated: true,
      eliminatedTurn: 150,
      turnsUntilNextOperation: 1,
    });
    expect([money(forward), funding(forward), forward.world.current.panic]).toEqual([995, 24, 100]);
    expect(forward.world.current).toMatchObject({
      ending: 'Victory',
      endingReasons: ['EveryFactionEliminated'],
      endingTurn: 150,
      turn: 151,
    });
    expect(series(forward).end.at(-1)).toBe(1000);
    expect(series(forward).start.at(-1)).toBe(995);
    const again = advanceTurnOf(forward, gdrs);
    expect(isRejection(again) && again.reason).toBe('campaign_ended');
    expect(currentStateView(forward, gdrs).turn).toBe(151);
  });

  it('The last Faction Eliminated while Panic reaches the limit: the raid fails', () => {
    const { state, s3, s4, s5, ids } = lastTurnState();
    const f = onlyFaction(state).id;
    const a9 = ids[8]!;
    const responseEnemies = state.world.current.missionSites[s4]!.state.enemies;
    const next = advance(state, {
      ...losing(state, s3),
      [`combat.hit.${a9}`]: [false],
      ...allMiss(responseEnemies.slice(0, 4)),
      [`combat.hit.${responseEnemies[4]}`]: [true],
      [`combat.damage.${responseEnemies[4]}`]: [21],
      [`combat.hit.${responseEnemies[5]}`]: [false],
      [`faction.${f}.operationLevel`]: [2],
      [`faction.${f}.operationInterval`]: [8],
      [`mission.archetypeSelection.${f}`]: ['foil_sabotage'],
    });
    const report = next.world.history.turnReport!;
    expect(report.missions.map((m) => m.result)).toEqual(['Lost', 'Lost']);
    expect(next.world.current.missionSites[s5]!.state.lifecycle).toBe('Expired');
    expect(report.expiredMissionSites[0]!.consequence).toMatchObject({ panicIncrease: 3, fundingChange: 0 });
    expect(report.factionActivity[0]).toMatchObject({ operationLevel: 'operation_level_2' });
    const s6 = next.world.current.missionSites[report.factionActivity[0]!.createdMissionSite!]!;
    expect(s6).toMatchObject({
      archetype: 'foil_sabotage',
      state: { lifecycle: 'Active', turnsUntilExpiration: 4 },
    });
    expect(funding(next)).toBe(24);
    expect(next.world.current).toMatchObject({
      panic: 100,
      ending: 'Defeat',
      endingReasons: ['PanicAtTheLimit'],
      endingTurn: 150,
      turn: 151,
    });
  });

  it('Two Mission sites created in one Advance turn', () => {
    let state = setFaction(
      set(newCampaign({ money: 5000 }), { panic: 10, funding: 20, turn: 30 }),
      'faint',
      40,
      1,
    );
    const [a1] = agentIds(state) as [string];
    const f = onlyFaction(state).id;
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a1] });
    const i2 = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[a1]!.state.status = 'AtAssignment';
      world.investigations[i2]!.state.progress = 200;
      (world.investigations[i2]!.constants as { actualRequiredProgress: number }).actualRequiredProgress = 3;
    });
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [1],
      [`faction.${f}.operationInterval`]: [20],
      [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
    });
    const [sA, sB] = Object.values(state.world.current.missionSites);
    expect([sA!.archetype, sA!.state.turnsUntilExpiration]).toEqual(['apprehend_member', 5]);
    expect([sB!.archetype, sB!.state.turnsUntilExpiration, sB!.constants.turnCreated]).toEqual([
      'foil_recruitment_push',
      3,
      30,
    ]);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 39, turnsUntilNextOperation: 20 });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    const expiration = () =>
      [sA!.id, sB!.id].map((id) => {
        const site = state.world.current.missionSites[id]!.state;
        return site.lifecycle === 'Expired' ? 'Expired' : site.turnsUntilExpiration;
      });
    state = advance(state);
    expect(expiration()).toEqual([4, 2]);
    state = advance(state);
    expect(expiration()).toEqual([3, 1]);
    state = advance(state);
    expect(expiration()).toEqual([2, 'Expired']);
    expect([state.world.current.panic, funding(state)]).toEqual([13, 20]);
    state = advance(state);
    state = advance(state);
    expect(expiration()).toEqual(['Expired', 'Expired']);
    expect(state.world.current.panic).toBe(13);
    expect(currentStateView(state, gdrs).leads[0]!.blockingConditions).toEqual([]);
  });

  it('Money below zero, Defeat, and Turn close', () => {
    const base = set(newCampaign(), { money: 15, funding: 0, panic: 30, turn: 20 });
    const eliminated = advance(base);
    expect(eliminated.world.current).toMatchObject({
      ending: 'Defeat',
      endingReasons: ['MoneyBelowZero'],
      endingTurn: 20,
      turn: 21,
      panic: 30,
    });
    expect(money(eliminated)).toBe(-25);
    expect(series(eliminated)).toEqual({ start: [500, -25], end: [15] });

    const zero = advance(set(base, { money: 40 }));
    expect([money(zero), zero.world.current.ending]).toEqual([0, null]);

    // Money restored by a later step: a Won Response Mission adds 30 after Upkeep.
    const site = addMissionSite(base, 'foil_sabotage');
    let restored = act(site.state, 'deployAgents', { missionSite: site.site, agents: agentIds(site.state) });
    restored = advance(restored, winning(restored, site.site));
    expect(restored.world.history.turnReport!.upkeep.moneyAfter).toBe(-25);
    expect([money(restored), funding(restored), restored.world.current.ending]).toEqual([5, 5, null]);
    expect(series(restored).start.at(-1)).toBe(5);
  });

  it('Funding and Panic from two steps', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 8);
    state = tweak(set(state, { funding: 0, panic: 20 }), (world) => {
      world.agency.state.acquisitions['transport_cap'] = 2;
    });
    const ids = agentIds(state);
    const s8 = addMissionSite(state, 'raid_safehouse');
    const s9 = addMissionSite(s8.state, 'foil_sabotage');
    const s10 = addMissionSite(s9.state, 'foil_sabotage', { turnsUntilExpiration: 1 });
    state = act(s10.state, 'deployAgents', { missionSite: s8.site, agents: ids.slice(0, 7) });
    state = act(state, 'deployAgents', { missionSite: s9.site, agents: ids.slice(7, 8) });
    const enemies9 = state.world.current.missionSites[s9.site]!.state.enemies;
    const injected = {
      ...winning(state, s8.site),
      ...allMiss([ids[7]!]),
      ...allHit(enemies9, 15),
    };
    const forward = advance(state, injected);
    const reversed = advance(state, injected, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    const report = forward.world.history.turnReport!;
    expect(report.missions.map((m) => m.result)).toEqual(['Won', 'Lost']);
    expect(report.combatReports[1]!.outcome).toBe('Wiped');
    expect(report.income.funding).toBe(0);
    // Step 6: max(0, 0 + 5 − 1) = 4; step 7: max(0, 4 − 1) = 3.
    expect(funding(forward)).toBe(3);
    expect(forward.world.current.panic).toBe(20 - 2 + 8 + 8);
    expect(currentStateView(forward, gdrs).agency.projectedIncome).toBe(3);
  });

  it('Step-start values', () => {
    let state = setAssignment(newCampaign(), agentIds(newCampaign()).slice(0, 2), 'Training');
    const [a1, a2] = agentIds(state) as [string, string];
    state = tweak(state, (world) => {
      world.agents[a1]!.state.skillHundredths = 12000;
      world.agents[a2]!.state.skillHundredths = 13500;
      world.agents[a2]!.state.exactExhaustionHundredths = 6900;
    });
    // a1's Training gain Probability is 1; a2's is 61 / 100, and the injected outcome is "gains".
    const injected = { [`agent.trainingGain.${a2}`]: [true] };
    const forward = advance(state, injected);
    const reversed = advance(state, injected, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect(units(agent(forward, a1).state)).toMatchObject({ skill: 121, exhaustion: 1 });
    // a2 reaches 70: a Forced return to Standby, At assignment, and then it recovers in step 9 to 65.
    expect(units(agent(forward, a2).state)).toMatchObject({
      skill: 136,
      exhaustion: 65,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
  });

  it('Work exhaustion before recovery: a Forced return from Contracting is In transit at step 9', () => {
    let state = setAssignment(newCampaign(), agentIds(newCampaign()).slice(0, 1), 'Contracting');
    const [a1] = agentIds(state) as [string];
    state = tweak(state, (world) => (world.agents[a1]!.state.exactExhaustionHundredths = 6900));
    state = advance(state);
    expect(units(agent(state, a1).state)).toMatchObject({
      exhaustion: 70,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    // It earned its income in the step, with effective skill 61: round down(30 × (1 − 39 / 500)) = 27.
    expect(state.world.history.turnReport!.income).toMatchObject({ contractingAgents: 1, income: 20 + 27 });
    state = advance(state); // arrives; recovers nothing
    expect(agent(state, a1).state.exactExhaustionHundredths / 100).toBe(70);
    state = advance(state);
    expect(agent(state, a1).state.exactExhaustionHundredths / 100).toBe(65);
  });

  it('Nothing to apply to: all twelve steps still apply', () => {
    const catalog = catalogWith((raw) => {
      raw.get('agent_parameters')['initial_roster_size'] = 0;
      raw.files.find((file) => file.path.endsWith('faction_archetypes.yaml'))!.gdrs.length = 0;
      raw.files.find((file) => file.path.endsWith('leads.yaml'))!.gdrs.length = 0;
      raw.pruneArticles();
    });
    const state = advance(newCampaign({ catalog }), {}, catalog);
    expect(state.world.current.turn).toBe(2);
    expect(money(state)).toBe(520);
    expect(state.world.history.turnReport).toMatchObject({ upkeep: { upkeep: 0 }, ending: null });
  });
});

/** Random outcomes that depend only on the name of the outcome and on how often that name was decided. */
function namedRandom(seed: string): Random {
  const generators = new Map<string, RngState>();
  const of = (outcome: string): RngState => {
    let rng = generators.get(outcome);
    if (!rng) {
      rng = seedRng(`${seed}/${outcome}`);
      generators.set(outcome, rng);
    }
    return rng;
  };
  return {
    uniform: (outcome, lo, hi) => uniformInt(of(outcome), lo, hi),
    chance: (outcome, p) => chance(of(outcome), p),
    weighted(outcome, entries) {
      const total = entries.reduce((sum, [, weight]) => sum + BigInt(weight), 0n);
      let pick = uniformBelow(of(outcome), total);
      for (const [key, weight] of entries) {
        if (pick < BigInt(weight)) {
          return key;
        }
        pick -= BigInt(weight);
      }
      throw new Error('no choice');
    },
  };
}

describe('TURN: Values a step uses, as a property', () => {
  const catalog = catalogWith((raw) => {
    raw.add('factions/faction_archetypes.yaml', {
      id: 'second_faction',
      type: 'FactionArchetype',
      name: 'Second Faction',
      initial_activity_level: 'active',
    });
    for (const id of ['lead_b', 'lead_c']) {
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get('locate_red_dawn_member'),
        id,
        required_progress: 2,
        faction: id === 'lead_b' ? 'second_faction' : 'red_dawn',
      });
    }
  });

  /** A busy World state: Agents on every Current assignment, several Investigations, Missions, and sites. */
  function busyState(): CampaignState {
    let state = withAgents(newCampaign({ money: 3000, catalog, quietFactions: false }), 20, catalog);
    state = tweak(state, (world) => {
      world.agency.state.acquisitions['transport_cap'] = 4;
      world.panic = 40;
      for (const faction of Object.values(world.factions)) {
        faction.state.turnsUntilNextOperation = 1;
        faction.state.turnsUntilNextLevel = 1;
      }
    });
    const ids = agentIds(state);
    const run = (name: string, args: Record<string, unknown>) => {
      state = act(state, name, args, 'player', catalog);
    };
    run('assignAgents', { agents: ids.slice(0, 3), assignment: 'Contracting' });
    run('assignAgents', { agents: ids.slice(3, 6), assignment: 'Training' });
    run('startInvestigation', { lead: 'locate_red_dawn_member', agents: ids.slice(6, 8) });
    run('startInvestigation', { lead: 'lead_b', agents: ids.slice(8, 10) });
    run('startInvestigation', { lead: 'lead_c', agents: ids.slice(10, 11) });
    state = tweak(state, (world) => {
      for (const item of Object.values(world.agents)) {
        item.state.status = 'AtAssignment';
      }
      for (const investigation of Object.values(world.investigations)) {
        investigation.state.progress = 150;
      }
      const tired = world.agents[ids[19]!]!.state;
      tired.exactExhaustionHundredths = 4000;
      const hurt = world.agents[ids[18]!]!.state;
      hurt.currentHealthHundredths = 2900;
      hurt.assignment = { kind: 'Recovery' };
      hurt.status = 'Recovering';
      const hurt2 = world.agents[ids[17]!]!.state;
      hurt2.currentHealthHundredths = 1200;
      hurt2.exactExhaustionHundredths = 3000;
      hurt2.assignment = { kind: 'Recovery' };
      hurt2.status = 'Recovering';
    });
    for (const [archetype, team] of [
      ['apprehend_member', ids.slice(11, 13)],
      ['foil_sabotage', ids.slice(13, 15)],
      ['foil_recruitment_push', ids.slice(15, 17)],
    ] as const) {
      const site = addMissionSite(state, archetype, { catalog });
      state = act(site.state, 'deployAgents', { missionSite: site.site, agents: team }, 'player', catalog);
    }
    state = addMissionSite(state, 'foil_sabotage', { catalog, turnsUntilExpiration: 1 }).state;
    state = addMissionSite(state, 'foil_recruitment_push', { catalog, turnsUntilExpiration: 1 }).state;
    state = addMissionSite(state, 'raid_safehouse', { catalog, turnsUntilExpiration: 2 }).state;
    return state;
  }

  it('shuffling the processing order inside each step changes nothing', () => {
    const state = busyState();
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), fc.integer(), (seed, shuffleSeed) => {
        const baseline = advanceTurnOf(state, catalog, namedRandom(seed));
        const rng = seedRng(String(shuffleSeed));
        const shuffled = advanceTurnOf(state, catalog, namedRandom(seed), (items) => {
          const copy = [...items];
          for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = uniformInt(rng, 0, i);
            [copy[i], copy[j]] = [copy[j]!, copy[i]!];
          }
          return copy;
        });
        expect(shuffled).toEqual(baseline);
      }),
      { numRuns: 60 },
    );
  });

  it('gives a busy turn something to do in every step', () => {
    const next = advance(busyState(), {}, catalog);
    const report = next.world.history.turnReport!;
    expect(report.training.length).toBeGreaterThan(0);
    expect(report.investigations).toHaveLength(3);
    expect(report.missions).toHaveLength(3);
    expect(report.expiredMissionSites.length).toBeGreaterThan(0);
    expect(report.factionActivity).toHaveLength(2);
    expect(report.recovery.length).toBeGreaterThan(0);
  });
});
