/** Acceptance examples of TURN (Turn Advancement), and its order-independence guarantee as a property. */
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

describe('TURN: Acceptance examples', () => {
  it('The first two Advance turns of a Campaign', () => {
    let state = setFaction(newCampaign(), 'faint', 60, 15);
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Contracting' });
    state = act(state, 'assignAgents', { agents: [a3], assignment: 'Training' });
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a4] });
    const i1 = Object.keys(state.world.current.investigations)[0]!;

    state = advance(state);
    let report = state.world.history.turnReport!;
    expect(report).toMatchObject({
      turn: 1,
      transit: { arrived: [a1, a2, a3, a4] },
      income: { income: 20, moneyAfter: 520 },
      upkeep: { upkeep: 40, moneyAfter: 480 },
      training: [],
      investigations: [{ investigation: i1, progressGain: 0, progressAfter: 0, completed: false }],
      missions: [],
      recovery: [],
      panic: { before: 0, after: 0 },
      ending: null,
    });
    expect(agent(state, a3).state.skill).toBe(100);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 59, turnsUntilNextOperation: 14 });
    expect(state.world.current.turn).toBe(2);
    expect(series(state)).toEqual({ start: [500, 480], end: [500] });

    const view = currentStateView(state, gdrs);
    expect(view.agency).toMatchObject({ projectedIncome: 80, projectedUpkeep: 40 });
    expect(view.investigations[0]!.projectedCompletionProbability).toEqual({ n: '1', d: '3' });

    state = advance(state, { [`investigation.completion.${i1}`]: [false] });
    report = state.world.history.turnReport!;
    expect(report).toMatchObject({
      turn: 2,
      transit: { arrived: [] },
      income: { contractingAgents: 2, income: 80, moneyAfter: 560 },
      upkeep: { moneyAfter: 520 },
      training: [{ agent: a3, skillAfter: 101 }],
      investigations: [{ progressGain: 100, progressAfter: 100, completed: false }],
    });
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 58, turnsUntilNextOperation: 13 });
    expect(series(state)).toEqual({ start: [500, 480, 520], end: [500, 480] });
    expect(state.world.current.turn).toBe(3);
    expect(historyView(state, gdrs).entries.map((entry) => entry.turn)).toEqual([1, 2]);
  });

  it('Deployment, Combat, return, and recovery', () => {
    const created = addMissionSite(set(newCampaign({ money: 5000 }), { turn: 5 }), 'apprehend_member', {
      turnsUntilExpiry: 4,
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
    const wounded = [a1, a2].find((id) => agent(state, id).state.currentHealth < 30)!;
    const unharmed = [a1, a2].find((id) => id !== wounded)!;
    expect(agent(state, wounded).state).toMatchObject({
      currentHealth: 18,
      assignment: { kind: 'Recovery' },
      taskPhase: 'InTransit',
    });
    expect(agent(state, unharmed).state).toMatchObject({
      assignment: { kind: 'Standby' },
      taskPhase: 'InTransit',
    });
    expect(report.recovery).toEqual([]);
    expect(state.world.current.missionSites[created.site]!.state.turnsUntilExpiry).toBe(4);
    const exhaustion = agent(state, wounded).state.exhaustion;

    state = advance(state); // both arrive; nothing recovers
    expect(agent(state, wounded).state).toMatchObject({
      currentHealth: 18,
      exhaustion,
      taskPhase: 'AtAssignment',
    });
    expect(currentStateView(state, gdrs).agents.find((a) => a.id === wounded)!.recoveryTurnsRemaining).toBe(
      12,
    );
    state = advance(state);
    expect(agent(state, wounded).state).toMatchObject({
      currentHealth: 19,
      exhaustion: Math.max(0, exhaustion - 5),
    });
    for (let i = 0; i < 10; i += 1) {
      state = advance(state);
    }
    expect(agent(state, wounded).state).toMatchObject({
      currentHealth: 29,
      assignment: { kind: 'Recovery' },
    });
    state = advance(state);
    expect(agent(state, wounded).state).toMatchObject({
      currentHealth: 30,
      assignment: { kind: 'Standby' },
      taskPhase: 'AtAssignment',
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
    const s5 = addMissionSite(s4.state, 'foil_recruitment_push', { turnsUntilExpiry: 1 });
    state = act(s5.state, 'deployAgents', { missionSite: s3.site, agents: ids.slice(0, 8) });
    state = act(state, 'deployAgents', { missionSite: s4.site, agents: ids.slice(8, 9) });
    state = setAssignment(state, ids.slice(9, 12), 'Contracting');
    return { state, s3: s3.site, s4: s4.site, s5: s5.site, ids };
  }

  it('The last Faction Defeated while Panic reaches the limit', () => {
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
    expect(agent(forward, a9).state).toMatchObject({
      currentHealth: 9,
      assignment: { kind: 'Recovery' },
      taskPhase: 'InTransit',
    });
    expect(report.cancelledMissionSites).toEqual([s5]);
    expect(report.expiredMissionSites).toEqual([]);
    expect(report.factionActivity).toEqual([]);
    expect(onlyFaction(forward).state).toMatchObject({
      defeated: true,
      defeatedTurn: 150,
      turnsUntilNextOperation: 1,
    });
    expect(forward.world.current.leadProgression['locate_red_dawn_hq']).toHaveLength(1);
    expect([money(forward), funding(forward), forward.world.current.panic]).toEqual([995, 24, 100]);
    expect(forward.world.current).toMatchObject({
      ending: 'Victory',
      endingReasons: ['EveryFactionDefeated'],
      endingTurn: 150,
      turn: 151,
    });
    expect(series(forward).end.at(-1)).toBe(1000);
    expect(series(forward).start.at(-1)).toBe(995);
    const again = advanceTurnOf(forward, gdrs);
    expect(isRejection(again) && again.reason).toBe('campaign_ended');
    expect(currentStateView(forward, gdrs).turn).toBe(151);
  });

  it('The last Faction Defeated while Panic reaches the limit: the raid fails', () => {
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
      state: { lifecycle: 'Active', turnsUntilExpiry: 4 },
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
      world.agents[a1]!.state.taskPhase = 'AtAssignment';
      world.investigations[i2]!.state.progress = 200;
    });
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [1],
      [`faction.${f}.operationInterval`]: [20],
      [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
    });
    const [sA, sB] = Object.values(state.world.current.missionSites);
    expect([sA!.archetype, sA!.state.turnsUntilExpiry]).toEqual(['apprehend_member', 5]);
    expect([sB!.archetype, sB!.state.turnsUntilExpiry, sB!.constants.turnCreated]).toEqual([
      'foil_recruitment_push',
      3,
      30,
    ]);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 39, turnsUntilNextOperation: 20 });
    expect(agent(state, a1).state).toMatchObject({ assignment: { kind: 'Standby' }, taskPhase: 'InTransit' });
    const expiry = () =>
      [sA!.id, sB!.id].map((id) => {
        const site = state.world.current.missionSites[id]!.state;
        return site.lifecycle === 'Expired' ? 'Expired' : site.turnsUntilExpiry;
      });
    state = advance(state);
    expect(expiry()).toEqual([4, 2]);
    state = advance(state);
    expect(expiry()).toEqual([3, 1]);
    state = advance(state);
    expect(expiry()).toEqual([2, 'Expired']);
    expect([state.world.current.panic, funding(state)]).toEqual([13, 20]);
    state = advance(state);
    state = advance(state);
    expect(expiry()).toEqual(['Expired', 'Expired']);
    expect(state.world.current.panic).toBe(13);
    expect(currentStateView(state, gdrs).leads[0]!.blockingConditions).toEqual([]);
  });

  it('Money below zero, Defeat, and Turn close', () => {
    const base = set(newCampaign(), { money: 15, funding: 0, panic: 30, turn: 20 });
    const defeated = advance(base);
    expect(defeated.world.current).toMatchObject({
      ending: 'Defeat',
      endingReasons: ['MoneyBelowZero'],
      endingTurn: 20,
      turn: 21,
      panic: 30,
    });
    expect(money(defeated)).toBe(-25);
    expect(series(defeated)).toEqual({ start: [500, -25], end: [15] });

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
    const s10 = addMissionSite(s9.state, 'foil_sabotage', { turnsUntilExpiry: 1 });
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
      world.agents[a1]!.state.skill = 120;
      world.agents[a2]!.state.skill = 135;
    });
    const forward = advance(state);
    const reversed = advance(state, {}, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect([agent(forward, a1).state.skill, agent(forward, a2).state.skill]).toEqual([121, 136]);
  });

  it('Nothing to apply to: all twelve steps still apply', () => {
    const catalog = catalogWith((raw) => {
      raw.get('agent_parameters')['initial_roster_size'] = 0;
      raw.files.find((file) => file.path.endsWith('faction_archetypes.yaml'))!.gdrs.length = 0;
      raw.files.find((file) => file.path.endsWith('leads.yaml'))!.gdrs.length = 0;
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
        difficulty: 2,
        faction: id === 'lead_b' ? 'second_faction' : 'red_dawn',
      });
    }
  });

  /** A busy Committed state: Agents on every Current assignment, several Investigations, Missions, and sites. */
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
        item.state.taskPhase = 'AtAssignment';
      }
      for (const investigation of Object.values(world.investigations)) {
        investigation.state.progress = 150;
      }
      const tired = world.agents[ids[19]!]!.state;
      tired.exhaustion = 40;
      const hurt = world.agents[ids[18]!]!.state;
      hurt.currentHealth = 29;
      hurt.assignment = { kind: 'Recovery' };
      const hurt2 = world.agents[ids[17]!]!.state;
      hurt2.currentHealth = 12;
      hurt2.exhaustion = 30;
      hurt2.assignment = { kind: 'Recovery' };
    });
    for (const [archetype, team] of [
      ['apprehend_member', ids.slice(11, 13)],
      ['foil_sabotage', ids.slice(13, 15)],
      ['foil_recruitment_push', ids.slice(15, 17)],
    ] as const) {
      const site = addMissionSite(state, archetype, { catalog });
      state = act(site.state, 'deployAgents', { missionSite: site.site, agents: team }, 'player', catalog);
    }
    state = addMissionSite(state, 'foil_sabotage', { catalog, turnsUntilExpiry: 1 }).state;
    state = addMissionSite(state, 'foil_recruitment_push', { catalog, turnsUntilExpiry: 1 }).state;
    state = addMissionSite(state, 'raid_safehouse', { catalog, turnsUntilExpiry: 2 }).state;
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
