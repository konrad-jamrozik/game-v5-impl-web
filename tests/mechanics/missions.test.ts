/** Tests, from the former Acceptance examples, of MISSION (Missions) and RECOVER (Agent Recovery). */
import { describe, expect, it } from 'vite-plus/test';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import {
  consequencesOf,
  missionExhaustion,
  previousOperation,
  selectResponseArchetype,
} from '../../src/engine/mechanics/missions/missions.ts';
import { isRejection } from '../../src/engine/result.ts';
import { seedRng } from '../../src/kernel/index.ts';
import { exhaustionOf } from '../../src/engine/mechanics/agents/agents.ts';
import {
  healthRecoveryRateHundredths,
  recoveryTurnsRemaining,
} from '../../src/engine/mechanics/recovery/recovery.ts';
import { injectedRandom, seededRandom } from '../../src/engine/random.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import type { GdrCatalog } from '../../src/gdr/index.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import {
  act,
  BOOTSTRAP_GDRS as bootstrap,
  addMissionSite,
  advance,
  agent,
  agentIds,
  allHit,
  allMiss,
  catalogWith,
  effect,
  expectDefective,
  expectRejected,
  funding,
  gdrs,
  missionAt,
  money,
  newCampaign,
  onlyFaction,
  setAssignment,
  tweak,
  winning,
  withAgents,
  units,
  setCurrentHealth,
  currentHealthOf,
  useLegacyCatalog,
} from '../helpers/game.ts';

useLegacyCatalog();

const set = (
  state: CampaignState,
  values: { panicHundredths?: number; money?: number; funding?: number; turn?: number },
) =>
  tweak(state, (world) => {
    world.panicHundredths = values.panicHundredths ?? world.panicHundredths;
    world.agency.state.money = values.money ?? world.agency.state.money;
    world.agency.state.funding = values.funding ?? world.agency.state.funding;
    world.turn = values.turn ?? world.turn;
  });
const site = (state: CampaignState, id: string) => state.world.current.missionSites[id]!;
const mission = (state: CampaignState, id: string) => state.world.current.missions[id]!;

describe('MISSION: examples', () => {
  it('The full life of an apprehend_member Mission site', () => {
    // Creation by the completion effect of locate_red_dawn_member, in the Advance turn ending turn 4.
    let state = set(newCampaign(), { turn: 4 });
    const ids = agentIds(state);
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [ids[0]] });
    const i1 = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[ids[0]!]!.state.status = 'AtAssignment';
      world.investigations[i1]!.state.progress = 200;
      (world.investigations[i1]!.constants as { actualRequiredProgress: number }).actualRequiredProgress = 3;
    });
    state = advance(state);
    const s1 = Object.keys(state.world.current.missionSites)[0]!;
    expect(site(state, s1)).toMatchObject({
      archetype: 'apprehend_member',
      constants: {
        kind: 'Initiative',
        origin: { kind: 'Investigation', investigation: i1 },
        targetFaction: onlyFaction(state).id,
        turnCreated: 4,
      },
      state: { lifecycle: 'Active', turnsUntilExpiration: 5 },
    });
    const enemies = site(state, s1).state.enemies;
    expect(enemies.map((id) => state.world.current.enemies[id]!.archetype)).toEqual([
      'initiate',
      'initiate',
      'initiate',
    ]);
    const view = currentLiveWorldStateView(state, gdrs).missionSites[0]!;
    expect(view).toMatchObject({
      // COMBAT, Combat rating: three initiates of effective skill 40, max health 20, and weapon damage 10 rate
      // ⌊3 ^ 0.2 × 3 × 40 × (10 / 10 + 20 / 30) / 2⌋ = ⌊3 ^ 0.2 × 100⌋.
      enemiesCombatRating: 124,
      rewards: { money: 5, fundingChange: 0, panicReductionHundredths: 100 },
      mission: null,
      lead: 'locate_red_dawn_member',
    });

    // Countdown, Advance turn ending turn 5.
    state = advance(state);
    expect(site(state, s1).state.turnsUntilExpiration).toBe(4);

    // Deploying, Turn 6. The example's Agents have exhaustion 0; a1's work on i1 gave it 1.
    state = setAssignment(state, ids, 'Standby');
    state = tweak(state, (world) => (world.agents[ids[0]!]!.state.exactExhaustionHundredths = 0));
    state = act(state, 'deployAgents', { missionSite: s1, agents: ids });
    const m1 = missionAt(state, s1);
    expect(site(state, s1).state).toMatchObject({ lifecycle: 'Deployed', turnsUntilExpiration: 4 });
    // An Deployed Mission site is an Unfinished Mission site: it blocks its Lead and is in Current world state.
    expect(
      currentRetiredWorldStateView(state, gdrs).leads.find((lead) => lead.id === 'locate_red_dawn_member'),
    ).toMatchObject({ available: false, status: 'Inactive' });
    expect(currentLiveWorldStateView(state, gdrs).missionSites.map((item) => item.id)).toEqual([s1]);
    expect(mission(state, m1)).toMatchObject({
      archetype: 'standard_mission',
      constants: { missionSite: s1, turnDeployed: 6, teamSent: ids },
      state: { lifecycle: 'Deployed', currentTeam: ids },
    });
    const other = addMissionSite(state, 'foil_recruitment_push');
    state = act(other.state, 'hireAgent');
    expectRejected(
      state,
      'deployAgents',
      { missionSite: other.site, agents: [agentIds(state)[4]] },
      'agents_cannot_be_ordered',
    );

    // Resolution, Advance turn ending turn 6, with the Combat trace of the example.
    state = tweak(set(state, { money: 400, funding: 20, panicHundredths: 1000 }), (world) => {
      delete world.missionSites[other.site];
      for (const id of other.state.world.current.missionSites[other.site]!.state.enemies) {
        delete world.enemies[id];
      }
      delete world.agents[agentIds(state)[4]!];
    });
    const [a1, a2, a3, a4] = ids as [string, string, string, string];
    const [e1, e2, e3] = enemies as [string, string, string];
    state = advance(state, {
      [`combat.target.${a1}`]: [e1, e2],
      [`combat.target.${a2}`]: [e2],
      [`combat.target.${a3}`]: [e3],
      [`combat.target.${a4}`]: [e1],
      [`combat.hit.${a1}`]: [true, true],
      [`combat.damage.${a1}`]: [15, 5],
      [`combat.hit.${a2}`]: [true, true],
      [`combat.damage.${a2}`]: [15, 5],
      [`combat.hit.${a3}`]: [true],
      [`combat.damage.${a3}`]: [15],
      [`combat.hit.${a4}`]: [true],
      [`combat.damage.${a4}`]: [5],
      [`combat.hit.${e2}`]: [false],
      [`combat.hit.${e3}`]: [false],
    });
    const report = state.world.history.turnReport!;
    expect(report.income.moneyAfter).toBe(420);
    expect(report.upkeep.moneyAfter).toBe(380);
    expect(report.combatReports[0]).toMatchObject({ mission: m1, outcome: 'Prevailed', rounds: 2 });
    expect(report.combatReports[0]!.log).toHaveLength(8);
    // COMBAT, Combat report and MISSION, Turn report: the History entry keeps each participant's current health and
    // effective skill at Combat start and at Combat end, its final condition, each side's Combat rating at Combat
    // start and at Combat end, and the Consequences that applied.
    const kept = state.world.history.historyEntries.at(-1)!.report.missions[0]!;
    const combat = report.combatReports[0]!;
    expect(kept.participants).toEqual(
      combat.participants.map((p) => ({
        id: p.id,
        side: p.side,
        startHealthHundredths: p.start.currentHealthHundredths,
        startEffectiveSkill: p.start.effectiveSkill,
        endHealthHundredths: p.final.currentHealthHundredths,
        endEffectiveSkill: p.final.effectiveSkill,
        condition: p.final.condition,
      })),
    );
    expect(kept.ratingsStart).toEqual({
      agents: combat.ratings[0]!.agents,
      enemies: combat.ratings[0]!.enemies,
    });
    expect(kept.ratingsEnd).toEqual({ agents: combat.ratings.at(-1)!.agents, enemies: 0 });
    expect(kept.consequence).toEqual(report.missions[0]!.consequence);
    // The Combat leaves 4, 2, 1, and 1; no Agent was Killed, so Mission exhaustion adds 5 to each.
    expect(report.combatReports[0]!.participants.slice(0, 4).map((p) => p.final.exhaustion)).toEqual([
      4, 2, 1, 1,
    ]);
    expect([a1, a2, a3, a4].map((id) => agent(state, id).state.exactExhaustionHundredths / 100)).toEqual([
      9, 7, 6, 6,
    ]);
    // Mission growth: m1 is the first Mission of each, so the survival skill gain 30 adds to each combat skill gain:
    // a1 8 + 4 + 30 = 42, a2 8 + 30 = 38, a3 and a4 4 + 30 = 34. Each Experience equals its gain.
    expect(report.combatReports[0]!.participants.slice(0, 4).map((p) => p.combatExperience)).toEqual([
      12, 8, 4, 4,
    ]);
    expect([a1, a2, a3, a4].map((id) => agent(state, id).state.skillHundredths / 100)).toEqual([
      142, 138, 134, 134,
    ]);
    expect([a1, a2, a3, a4].map((id) => agent(state, id).state.experience)).toEqual([42, 38, 34, 34]);
    expect(report.missions[0]!.growth).toEqual([
      {
        agent: a1,
        survivalExperience: 30,
        missionExperience: 42,
        skillAfterHundredths: 14200,
        experienceAfter: 42,
      },
      {
        agent: a2,
        survivalExperience: 30,
        missionExperience: 38,
        skillAfterHundredths: 13800,
        experienceAfter: 38,
      },
      {
        agent: a3,
        survivalExperience: 30,
        missionExperience: 34,
        skillAfterHundredths: 13400,
        experienceAfter: 34,
      },
      {
        agent: a4,
        survivalExperience: 30,
        missionExperience: 34,
        skillAfterHundredths: 13400,
        experienceAfter: 34,
      },
    ]);
    expect(site(state, s1).state).toMatchObject({ lifecycle: 'Concluded', turnsUntilExpiration: 4 });
    expect(mission(state, m1).state).toEqual({ lifecycle: 'Won', currentTeam: [] });
    expect(mission(state, m1).constants.teamSent).toEqual(ids);
    for (const id of ids) {
      expect(units(agent(state, id).state)).toMatchObject({
        assignment: { kind: 'Standby' },
        status: 'InTransit',
        participationHistory: [
          ...(id === a1 ? [{ kind: 'Investigation', id: i1 }] : []),
          { kind: 'Mission', id: m1 },
        ],
      });
    }
    expect([money(state), funding(state), state.world.current.panicHundredths]).toEqual([385, 20, 900]);
    expect(
      currentRetiredWorldStateView(state, gdrs).leads.find((lead) => lead.id === 'locate_red_dawn_member'),
    ).toMatchObject({ available: false, status: 'Archived', completionCount: 1 });
    expectRejected(state, 'deployAgents', { missionSite: s1, agents: [a1] }, 'mission_site_not_active');
    // A Won Mission and its Concluded Mission site are Retired: in World history, not Current world state.
    expect(currentLiveWorldStateView(state, gdrs).missionSites).toHaveLength(0);
    expect(currentRetiredWorldStateView(state, gdrs).missions.map((m) => m.id)).toEqual([m1]);
    expect(
      currentRetiredWorldStateView(state, gdrs).missionSites.map((item) => [item.id, item.lifecycle]),
    ).toEqual([[s1, 'Concluded']]);
    // A Concluded Mission site never counts down.
    const later = advance(state);
    expect(site(later, s1).state).toMatchObject({ lifecycle: 'Concluded', turnsUntilExpiration: 4 });
  });

  it('foil_sabotage ignored, Lost, and Won', () => {
    const created = addMissionSite(
      set(newCampaign(), { money: 320, funding: 20, panicHundredths: 1000, turn: 41 }),
      'foil_sabotage',
    );
    const s2 = created.site;
    const view = currentLiveWorldStateView(created.state, gdrs).missionSites[0]!;
    expect(view).toMatchObject({
      kind: 'Response',
      // COMBAT, Combat rating: four initiates rate 40 × 5/6 each and two soldiers 120 × 17/10 each, ⌊6 ^ 0.2 × 1624/3⌋.
      enemiesCombatRating: 774,
      rewards: { money: 30, fundingChange: 5 },
      penalties: { panicIncreaseHundredths: 800, fundingChange: -1, defeat: false },
      operationLevel: { id: 'operation_level_2', level: 2 },
    });
    expect(view.enemies.map((e) => e.archetype)).toEqual([
      'initiate',
      'initiate',
      'initiate',
      'initiate',
      'soldier',
      'soldier',
    ]);

    // Ignored: counts down 4, 3, 2, 1 and is Expired in the fourth Advance turn.
    let ignored = created.state;
    for (const expected of [3, 2, 1]) {
      ignored = advance(ignored);
      expect(site(ignored, s2).state).toMatchObject({ lifecycle: 'Active', turnsUntilExpiration: expected });
    }
    const beforeExpiry = { money: money(ignored), panic: ignored.world.current.panicHundredths };
    ignored = advance(ignored);
    expect(site(ignored, s2).state).toEqual({
      lifecycle: 'Expired',
      turnsUntilExpiration: 0,
      enemies: site(created.state, s2).state.enemies,
    });
    expect(ignored.world.current.panicHundredths).toBe(beforeExpiry.panic + 800);
    expect(funding(ignored)).toBe(19);
    expect(money(ignored)).toBe(beforeExpiry.money + 20 - 40);
    expect(Object.keys(ignored.world.current.missions)).toHaveLength(0);
    // MISSION, Turn report: the Turn report of the Advance turn ending Turn 44 lists s2 among the Mission sites
    // Expired, and its History entry keeps the same list.
    expect(ignored.world.current.turn).toBe(45);
    expect(turnReportView(ignored)!.expiredMissionSites.map((item) => item.missionSite)).toContain(s2);
    const entry = ignored.world.history.historyEntries.at(-1)!;
    expect(entry.turn).toBe(44);
    expect(entry.report.expiredMissionSites).toContain(s2);

    // Lost: a1 alone retreats after one Combat round.
    const [a1, a2, a3, a4] = agentIds(created.state) as [string, string, string, string];
    const [e1, e2, e3, e4, e5, e6] = site(created.state, s2).state.enemies as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    let lost = act(created.state, 'deployAgents', { missionSite: s2, agents: [a1] });
    lost = advance(lost, {
      [`combat.hit.${a1}`]: [false],
      [`combat.hit.${e1}`]: [false],
      [`combat.hit.${e2}`]: [false],
      [`combat.hit.${e3}`]: [false],
      [`combat.hit.${e4}`]: [false],
      [`combat.hit.${e5}`]: [true],
      [`combat.damage.${e5}`]: [21],
      [`combat.hit.${e6}`]: [false],
    });
    const lostReport = lost.world.history.turnReport!;
    expect(lostReport.combatReports[0]).toMatchObject({ outcome: 'Retreated', rounds: 1 });
    expect(lostReport.combatReports[0]!.participants[0]!.final).toMatchObject({
      currentHealthHundredths: 900,
      exhaustion: 7,
      effectiveSkill: 30,
    });
    expect(mission(lost, missionAt(lost, s2)).state.lifecycle).toBe('Lost');
    // Mission exhaustion raises 7 to 12, as it would after a win.
    expect(units(agent(lost, a1).state)).toMatchObject({
      assignment: { kind: 'Recovery' },
      status: 'InTransit',
      exhaustion: 12,
    });
    // Mission growth applies as after a win: 2 + 2 + 2 + 2 + 2 + 1 + 2 = 13 and the survival skill gain 30.
    expect(lostReport.combatReports[0]!.participants[0]!.combatExperience).toBe(13);
    expect(agent(lost, a1).state).toMatchObject({ skillHundredths: 14300, experience: 43 });
    expect([lost.world.current.panicHundredths, funding(lost), money(lost)]).toEqual([1800, 19, 300]);
    expect(site(lost, s2).state).toMatchObject({ lifecycle: 'Concluded', turnsUntilExpiration: 4 });

    // Won: four Agents prevail in three Combat rounds.
    let won = act(created.state, 'deployAgents', { missionSite: s2, agents: [a1, a2, a3, a4] });
    // Without their armor, two hits of 15 kill each soldier in the first Combat round, as the script below assumes.
    won = tweak(won, (world) => {
      for (const id of [e5, e6]) {
        world.enemies[id]!.state.baseArmor = 0;
      }
    });
    const hits = (count: number, damage: number[]) => ({ hit: new Array<boolean>(count).fill(true), damage });
    const agentScript = hits(3, [15, 15, 5]);
    won = advance(won, {
      // The Agents strike the soldiers first, then one initiate each.
      [`combat.target.${a1}`]: [e5, e1, e1],
      [`combat.target.${a2}`]: [e6, e2, e2],
      [`combat.target.${a3}`]: [e5, e3, e3],
      [`combat.target.${a4}`]: [e6, e4],
      ...Object.fromEntries(
        [a1, a2, a3, a4].flatMap((id) => [
          [`combat.hit.${id}`, agentScript.hit],
          [`combat.damage.${id}`, agentScript.damage],
        ]),
      ),
      ...Object.fromEntries([e1, e2, e3, e4].map((id) => [`combat.hit.${id}`, [false, false]])),
    });
    const wonReport = won.world.history.turnReport!;
    expect(wonReport.combatReports[0]).toMatchObject({ outcome: 'Prevailed', rounds: 3 });
    const round2Enemies = wonReport.combatReports[0]!.log.filter(
      (x) => x.round === 2 && x.attacker.startsWith('enemy'),
    );
    // Each Enemy's target outcome is left to the test's random source, which takes the earliest candidate, a1.
    expect(round2Enemies.every((x) => x.defender === a1)).toBe(true);
    expect(mission(won, missionAt(won, s2)).state.lifecycle).toBe('Won');
    expect([money(won), funding(won), won.world.current.panicHundredths]).toEqual([330, 25, 1000]);
    for (const id of [a1, a2, a3, a4]) {
      expect(units(agent(won, id).state)).toMatchObject({
        currentHealth: 30,
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
    }
    // The Combat leaves a1 with 11 and the others with 3; Mission exhaustion adds 5 to each.
    expect([a1, a2, a3, a4].map((id) => agent(won, id).state.exactExhaustionHundredths / 100)).toEqual([
      16, 8, 8, 8,
    ]);
  });

  it('A Won raid_hq Mission eliminates Red Dawn and cancels an Active Mission site', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    // One Transport cap Upgrade of +8 raises the Transport cap from 8 to 16.
    state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    state = set(state, { money: 1000 + 30, funding: 25, panicHundredths: 4000, turn: 150 });
    state = tweak(state, (world) => {
      // Money is 1000 when Mission resolution begins: income 25 and upkeep 120 come first.
      world.agency.state.money = 1000 - 25 + 120;
    });
    const ids = agentIds(state);
    const s3 = addMissionSite(state, 'raid_hq');
    const s4 = addMissionSite(s3.state, 'foil_sabotage');
    const s5 = addMissionSite(s4.state, 'foil_recruitment_push', { turnsUntilExpiration: 2 });
    state = act(s5.state, 'deployAgents', { missionSite: s3.site, agents: ids.slice(0, 8) });
    state = act(state, 'deployAgents', { missionSite: s4.site, agents: ids.slice(8, 12) });
    expect(currentLiveWorldStateView(state, gdrs).agency.transportCap).toBe(16);
    const injected = { ...winning(state, s3.site), ...winning(state, s4.site) };
    const forward = advance(state, injected);
    const reversed = advance(state, injected, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    const report = forward.world.history.turnReport!;
    expect(
      report.missions.map((m) => [m.result, m.consequence.eliminatedFaction, m.consequence.money]),
    ).toEqual([
      ['Won', onlyFaction(forward).id, 0],
      ['Won', null, 30],
    ]);
    expect(onlyFaction(forward).state).toMatchObject({ eliminated: true, eliminatedTurn: 150 });
    expect([money(forward), funding(forward)]).toEqual([1030, 30]);
    expect(site(forward, s5.site).state).toMatchObject({ lifecycle: 'Cancelled', turnsUntilExpiration: 2 });
    // Mission sites whose Missions were resolved in the same step are Concluded, not cancelled.
    expect(site(forward, s3.site).state.lifecycle).toBe('Concluded');
    expect(site(forward, s4.site).state.lifecycle).toBe('Concluded');
    expect(report.cancelledMissionSites).toEqual([s5.site]);
    expect(report.expiredMissionSites).toEqual([]);
    expect(forward.world.history.historyEntries.at(-1)!.report.cancelledMissionSites).toEqual([s5.site]);
    expect(forward.world.current.panicHundredths).toBe(4000);
  });

  it('Transport cap and other rejections of deployAgents', () => {
    let state = withAgents(newCampaign({ money: 2000 }), 12);
    const [a1, a2, a3, a4, a5, a6, a7, a8, ...fill] = agentIds(state) as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      ...string[],
    ];
    const s6 = addMissionSite(state, 'foil_recruitment_push');
    const s7 = addMissionSite(s6.state, 'apprehend_member');
    const s8 = addMissionSite(s7.state, 'foil_recruitment_push', { turnsUntilExpiration: 1 });
    state = tweak(s8.state, (world) => {
      world.missionSites[s8.site]!.state.lifecycle = 'Expired';
      world.missionSites[s8.site]!.state.turnsUntilExpiration = 0;
      setCurrentHealth(world.agents[a7]!.state, 1200);
      world.agents[a7]!.state.assignment = { kind: 'Recovery' };
      world.agents[a7]!.state.status = 'Recovering';
    });
    // Seven Deployed Agents leave one place of the Transport cap of 8.
    state = act(state, 'deployAgents', { missionSite: s6.site, agents: [a1, a2, a3, ...fill] });
    state = setAssignment(state, [a6], 'Training', 'InTransit');
    state = setAssignment(state, [a8], 'Contracting');
    const reject = (missionSite: string, list: string[], reason: string) =>
      expectRejected(state, 'deployAgents', { missionSite, agents: list }, reason);
    reject(s7.site, [a4, a5], 'transport_cap');
    reject(s7.site, [], 'agents_empty');
    reject(s7.site, [a4, a4], 'agents_duplicate');
    reject(s7.site, [a6], 'agents_cannot_be_ordered');
    reject(s7.site, [a7], 'agents_cannot_be_ordered');
    reject(s7.site, [a1], 'agents_cannot_be_ordered');
    reject(s7.site, [a8], 'agents_not_in_base');
    reject(s6.site, [a4], 'mission_site_not_active');
    reject(s8.site, [a4], 'mission_site_not_active');
    reject('nowhere', [a4], 'unknown_mission_site');
    const deployed = act(state, 'deployAgents', { missionSite: s7.site, agents: [a4] });
    expect(mission(deployed, missionAt(deployed, s7.site)).state.currentTeam).toEqual([a4]);
    expectRejected(
      deployed,
      'deployAgents',
      { missionSite: s7.site, agents: [a5] },
      'mission_site_not_active',
    );
    const upgraded = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    const both = act(upgraded, 'deployAgents', { missionSite: s7.site, agents: [a4, a5] });
    expect(agent(both, a5).state.assignment).toEqual({ kind: 'Deployed', mission: missionAt(both, s7.site) });
  });

  it('Only an Agent on a Base Assignment can be deployed', () => {
    let state = withAgents(newCampaign({ money: 2000 }), 4);
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a2] });
    const i1 = Object.keys(state.world.current.investigations)[0]!;
    const created = addMissionSite(state, 'foil_recruitment_push');
    state = setAssignment(created.state, [a1], 'Training');
    state = tweak(state, (world) => {
      world.agents[a2]!.state.status = 'AtAssignment';
    });
    state = setAssignment(state, [a3], 'Contracting');
    // An Agent on an Investigation is rejected, so deploying never takes an Agent off an Investigation.
    expectRejected(
      state,
      'deployAgents',
      { missionSite: created.site, agents: [a1, a2] },
      'agents_not_in_base',
    );
    expectRejected(state, 'deployAgents', { missionSite: created.site, agents: [a3] }, 'agents_not_in_base');
    expect(state.world.current.investigations[i1]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a2],
    });
    // An Agent on Training is deployed at once, without first being recalled.
    const deployed = act(state, 'deployAgents', { missionSite: created.site, agents: [a1] });
    expect(units(agent(deployed, a1).state)).toMatchObject({
      assignment: { kind: 'Deployed', mission: missionAt(deployed, created.site) },
      status: 'AtAssignment',
    });
  });

  it('Deploying on the last Turn', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member', { turnsUntilExpiration: 1 });
    // Not deployed: Expired, with no consequence for an Initiative Mission site.
    const expired = advance(created.state);
    expect(site(expired, created.site).state).toMatchObject({
      lifecycle: 'Expired',
      turnsUntilExpiration: 0,
    });
    expect([money(expired), funding(expired), expired.world.current.panicHundredths]).toEqual([480, 20, 0]);
    // Deployed in the last Turn: the team fights, and the Mission site is never Expired.
    let state = act(created.state, 'deployAgents', {
      missionSite: created.site,
      agents: agentIds(created.state),
    });
    state = advance(state, winning(state, created.site));
    expect(site(state, created.site).state).toMatchObject({
      lifecycle: 'Concluded',
      turnsUntilExpiration: 1,
    });
    expect(mission(state, missionAt(state, created.site)).state.lifecycle).toBe('Won');
    expect(money(state)).toBe(485);
  });

  it('A Response Mission site from Faction activity; MissionSiteArchetype selection', () => {
    let state = tweak(set(newCampaign(), { turn: 15 }), (world) => {
      Object.values(world.factions)[0]!.state.turnsUntilNextOperation = 1;
    });
    const f = onlyFaction(state).id;
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [1],
      [`faction.${f}.operationInterval`]: [20],
      [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
    });
    const [s9] = Object.values(state.world.current.missionSites);
    expect(s9).toMatchObject({
      archetype: 'foil_recruitment_push',
      constants: { kind: 'Response', turnCreated: 15, targetFaction: f },
      state: { lifecycle: 'Active', turnsUntilExpiration: 3 },
    });
    expect(s9!.state.enemies).toHaveLength(5);
    state = advance(advance(state));
    expect(site(state, s9!.id).state.turnsUntilExpiration).toBe(1);
    const panic = state.world.current.panicHundredths;
    state = advance(state);
    expect(site(state, s9!.id).state.lifecycle).toBe('Expired');
    expect(state.world.current.panicHundredths).toBe(panic + 300);

    // With a second MissionSiteArchetype of level 1, each of the two has Probability 1 / 2.
    const catalog = catalogWith((raw) =>
      raw.add('missions/mission_site_archetypes.yaml', {
        ...raw.get('foil_recruitment_push'),
        id: 'test_foil_level_1',
      }),
    );
    const pick = (value: string) =>
      selectResponseArchetype(
        injectedRandom({ 'mission.archetypeSelection.f': [value] }),
        'f',
        1,
        catalog.missionSiteArchetypes,
        null,
      ).id;
    expect(pick('test_foil_level_1')).toBe('test_foil_level_1');
    expect(pick('foil_recruitment_push')).toBe('foil_recruitment_push');
  });

  it('MissionSiteArchetype selection excludes the initiating Faction previous operation when the level offers another', () => {
    // The possible values are what the selection offers its random outcome; each has the same weight.
    const offered = (level: number, previous: string | null, catalog: GdrCatalog = bootstrap) => {
      let seen: string[] = [];
      const recording = {
        ...injectedRandom({}),
        weighted: (_outcome: string, entries: readonly (readonly [string, number])[]) => {
          seen = entries.map(([key, weight]) => {
            expect(weight).toBe(1);
            return key;
          });
          return entries[0]![0];
        },
      };
      selectResponseArchetype(recording, 'f', level, catalog.missionSiteArchetypes, previous);
      return seen;
    };
    // E.g., with the Bootstrap values: after foil_sabotage, a level-2 occurrence selects one of the other two, and a
    // level-1 occurrence any of the three of level 1.
    expect(offered(2, 'foil_sabotage')).toEqual(['foil_vip_assassination', 'defend_against_office_raid']);
    expect(offered(1, 'foil_sabotage')).toEqual([
      'foil_recruitment_push',
      'foil_supply_theft',
      'foil_business_extortion',
    ]);
    expect(offered(2, null)).toHaveLength(3);
    // The existential level offers three as well.
    expect(offered(5, 'defend_against_hq_assault')).toEqual([
      'foil_bioweapon_release',
      'foil_warhead_launch',
    ]);

    // The previous operation is read from the Faction's latest Response Mission site, whatever became of it, and the
    // previous operation of another Faction plays no part.
    let state = newCampaign({ catalog: bootstrap });
    const f = onlyFaction(state).id;
    const first = addMissionSite(state, 'foil_sabotage', { catalog: bootstrap });
    state = tweak(first.state, (world) => {
      world.missionSites[first.site]!.state.lifecycle = 'Expired';
      Object.values(world.factions)[0]!.state.turnsUntilNextOperation = 1;
    });
    expect(previousOperation(f, state.world.current.missionSites)).toBe('foil_sabotage');
    expect(previousOperation('faction-9', state.world.current.missionSites)).toBeNull();
    // A seeded selection over 40 occurrences of level 2 never repeats foil_sabotage right after it.
    for (let seed = 0; seed < 40; seed += 1) {
      const next = advanceTurnOf(
        state,
        bootstrap,
        injectedRandom(
          { [`faction.${f}.operationLevel`]: [2], [`faction.${f}.operationInterval`]: [20] },
          seededRandom(seedRng(`no repeat ${seed}`), []),
        ),
      );
      if (isRejection(next)) {
        throw new Error(next.message);
      }
      const created = Object.values(next.world.current.missionSites).at(-1)!;
      expect(created.archetype).not.toBe('foil_sabotage');
      expect(created.constants.origin).toMatchObject({ initiatingFaction: f });
    }
  });

  it('Several Mission sites in one step', () => {
    for (const sabotageWon of [true, false]) {
      let state = withAgents(newCampaign({ money: 100_000 }), 12);
      for (let i = 0; i < 4; i += 1) {
        state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
      }
      // Money is 200 when Mission resolution begins: upkeep 120 comes first, and funding is 0.
      state = set(state, { money: 200 + 120, funding: 0, panicHundredths: 5000 });
      const ids = agentIds(state);
      const s10 = addMissionSite(state, 'apprehend_member');
      const s11 = addMissionSite(s10.state, 'foil_sabotage');
      const s12 = addMissionSite(s11.state, 'foil_recruitment_push');
      state = act(s12.state, 'deployAgents', { missionSite: s10.site, agents: ids.slice(0, 4) });
      state = act(state, 'deployAgents', { missionSite: s11.site, agents: ids.slice(4, 8) });
      state = act(state, 'deployAgents', { missionSite: s12.site, agents: ids.slice(8, 12) });
      const outcome = (team: string[], siteId: string, win: boolean) => {
        const enemies = site(state, siteId).state.enemies;
        return win
          ? { ...allHit(team, 15), ...allMiss(enemies) }
          : { ...allMiss(team), ...allHit(enemies, 15) };
      };
      const injected = {
        ...outcome(ids.slice(0, 4), s10.site, true),
        ...outcome(ids.slice(4, 8), s11.site, sabotageWon),
        ...outcome(ids.slice(8, 12), s12.site, false),
      };
      const forward = advance(state, injected);
      const reversed = advance(state, injected, gdrs, (items) => [...items].reverse());
      expect(reversed).toEqual(forward);
      const results = forward.world.history.turnReport!.missions.map((m) => m.result);
      if (sabotageWon) {
        expect(results).toEqual(['Won', 'Won', 'Lost']);
        expect([money(forward), funding(forward), forward.world.current.panicHundredths]).toEqual([
          235, 5, 5200,
        ]);
      } else {
        expect(results).toEqual(['Won', 'Lost', 'Lost']);
        expect([money(forward), funding(forward), forward.world.current.panicHundredths]).toEqual([
          205, 0, 6000,
        ]);
      }
    }
  });

  it('Structure of a Concluded Mission site and its Mission', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member');
    const deployed = act(created.state, 'deployAgents', {
      missionSite: created.site,
      agents: [agentIds(created.state)[0]],
    });
    const m1 = missionAt(deployed, created.site);
    const state = tweak(deployed, (world) => {
      world.missionSites[created.site]!.state.lifecycle = 'Concluded';
      world.missions[m1]!.state.lifecycle = 'Lost';
      world.missions[m1]!.state.currentTeam = [];
      world.agents[agentIds(created.state)[0]!]!.state.assignment = { kind: 'Standby' };
    });
    expect(checkInvariants(state, gdrs)).toEqual([]);
    // A Mission references the Mission site exactly when it is Deployed or Concluded.
    expect(
      checkInvariants(
        tweak(state, (world) => delete world.missions[m1]),
        gdrs,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('Structure of a Deployed Mission site and its Mission: invalid variants', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member');
    const state = act(created.state, 'deployAgents', {
      missionSite: created.site,
      agents: [agentIds(created.state)[0]],
    });
    const m1 = missionAt(state, created.site);
    expect(checkInvariants(state, gdrs)).toEqual([]);
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.missionSites[created.site]!.state.lifecycle = 'Active'));
    invalid((world) => (world.missions['mission-x'] = { ...world.missions[m1]!, id: 'mission-x' }));
    invalid((world) => (world.missions[m1]!.state.lifecycle = 'Won'));
    invalid((world) => (world.missions[m1]!.state.currentTeam = []));
    invalid((world) => {
      world.missionSites[created.site]!.state.lifecycle = 'Expired';
    });
    invalid((world) => world.missionSites[created.site]!.state.enemies.pop());
  });

  it('Consequences', () => {
    const archetype = (id: string) => gdrs.missionSiteArchetypes.find((item) => item.id === id)!;
    const level2 = gdrs.factionOperationLevels.find((item) => item.level === 2)!;
    expect(consequencesOf('Lost', archetype('raid_safehouse'), null)).toMatchObject({
      money: 0,
      panicIncreaseHundredths: 0,
    });
    expect(consequencesOf('Expired', archetype('raid_safehouse'), null)).toMatchObject({
      money: 0,
      fundingChange: 0,
    });
    expect(consequencesOf('Won', archetype('raid_hq'), null)).toEqual({
      money: 0,
      fundingChange: 0,
      panicIncreaseHundredths: 0,
      panicReductionHundredths: 0,
      eliminateTargetFaction: true,
      defeat: false,
    });
    expect(consequencesOf('Expired', archetype('foil_sabotage'), level2)).toEqual(
      consequencesOf('Lost', archetype('foil_sabotage'), level2),
    );
    expect(consequencesOf('Cancelled', archetype('foil_sabotage'), level2)).toMatchObject({
      panicIncreaseHundredths: 0,
    });
    // A `defeat` Effect of a Faction operation level applies when its Response Mission is Lost or its site Expired.
    const level5 = bootstrap.factionOperationLevels.find((item) => item.level === 5)!;
    const hqAssault = bootstrap.missionSiteArchetypes.find(
      (item) => item.id === 'defend_against_hq_assault',
    )!;
    expect(consequencesOf('Lost', hqAssault, level5)).toMatchObject({
      defeat: true,
      panicIncreaseHundredths: 0,
    });
    expect(consequencesOf('Expired', hqAssault, level5)).toMatchObject({ defeat: true });
    expect(consequencesOf('Won', hqAssault, level5)).toMatchObject({ defeat: false, money: 10000 });
  });

  it('GDR validation', () => {
    expectDefective((raw) => (raw.get('apprehend_member')['expires_in_turns'] = 0));
    expectDefective((raw) => (raw.get('foil_sabotage')['enemies'].$entries.length = 0));
    expectDefective((raw) => raw.get('raid_safehouse')['enemies'].$entries.push(['no_such_enemy', 1]));
    expectDefective((raw) => (raw.get('foil_recruitment_push')['enemies'].$entries[0][1] = 0));
    expectDefective((raw) => (raw.get('foil_sabotage')['on_win'] = [effect('money', 30)]));
    expectDefective((raw) => raw.get('raid_hq')['on_win'].push(effect('money', -5)));
    // Rule 5: an Initiative `on_win` is a valid Effect list of `money`, `funding`, `panic` of at most 0, and
    // `eliminate_faction` of `true` (EFFECT, Effect list format; FACTION, Elimination).
    expectDefective((raw) => (raw.get('apprehend_member')['on_win'] = [effect('panic', 1)]));
    expectDefective(
      (raw) => (raw.get('apprehend_member')['on_win'] = [effect('panic', { $decimal: '0.01' })]),
    );
    expectDefective(
      (raw) => (raw.get('apprehend_member')['on_win'] = [effect('panic', { $decimal: '-0.005' })]),
    );
    expectDefective((raw) => raw.get('apprehend_member')['on_win'].push(effect('money', 1)));
    expectDefective((raw) => (raw.get('raid_hq')['on_win'] = [effect('eliminate_faction', false)]));
    expectDefective((raw) => (raw.get('apprehend_member')['on_win'] = [effect('panic_reduction_pct', 1)]));
    expectDefective((raw) => (raw.get('apprehend_member')['on_win'] = [effect('defeat', true)]));
    expectDefective((raw) => (raw.get('apprehend_member')['on_win'] = [{ $entries: [] }]));
    expectDefective((raw) => (raw.get('apprehend_member')['on_win'] = { $entries: [['money', 5]] }));
    expectDefective((raw) => (raw.get('foil_sabotage')['operation_level'] = 9));
    expectDefective((raw) => (raw.get('apprehend_member')['operation_level'] = 1));
    expectDefective((raw) => (raw.get('apprehend_member')['kind'] = 'offensive'));
    // Rule 7: an operation level's Effect lists hold only `money` and `funding` of at least 0 on a win, and `panic`
    // of at least 0, `funding` of any sign, and `defeat` when ignored or lost; both properties are required.
    expectDefective((raw) => raw.get('operation_level_2')['on_ignored_or_lost'].push(effect('money', 5)));
    expectDefective((raw) => (raw.get('operation_level_2')['on_ignored_or_lost'] = [effect('panic', -1)]));
    expectDefective((raw) => (raw.get('operation_level_2')['on_win'] = [effect('funding', -1)]));
    expectDefective((raw) => (raw.get('operation_level_2')['on_win'] = [effect('defeat', true)]));
    expectDefective((raw) => delete raw.get('operation_level_2')['on_win']);
    expect(
      catalogWith((raw) => raw.get('operation_level_2')['on_ignored_or_lost'].push(effect('defeat', true)))
        .factionOperationLevels[1]!.onIgnoredOrLost.defeat,
    ).toBe(true);
  });

  it('Effect lists of Consequences', () => {
    // EFFECT, Effect list format; ECON, Money and funding Effect kinds; ENDING, Panic Effect kind: a `panic` Effect of
    // -1 is a Panic reduction of 1.00, held as 100 hundredths, and an Effect kind the list does not hold changes
    // nothing, e.g. `apprehend_member`'s `on_win` holds no `panic` Effect. The Bootstrap values:
    const site = (catalog: GdrCatalog, id: string) =>
      catalog.missionSiteArchetypes.find((item) => item.id === id)!;
    const level = (catalog: GdrCatalog, value: number) =>
      catalog.factionOperationLevels.find((item) => item.level === value)!;
    expect(site(bootstrap, 'raid_safehouse').onWin).toEqual({
      money: 200,
      funding: 10,
      panicReductionHundredths: 100,
      eliminateTargetFaction: false,
    });
    expect(site(bootstrap, 'raid_hq').onWin).toEqual({
      money: 10_000,
      funding: 200,
      panicReductionHundredths: 2000,
      eliminateTargetFaction: false,
    });
    expect(site(bootstrap, 'apprehend_member').onWin).toEqual({
      money: 10,
      funding: 0,
      panicReductionHundredths: 0,
      eliminateTargetFaction: false,
    });
    expect(level(bootstrap, 1)).toMatchObject({
      onWin: { money: 50, funding: 0 },
      onIgnoredOrLost: { panicIncreaseHundredths: 100, funding: 0, defeat: false },
    });
    expect(level(bootstrap, 2)).toMatchObject({
      onWin: { money: 200, funding: 10 },
      onIgnoredOrLost: { panicIncreaseHundredths: 200, funding: -5, defeat: false },
    });
    expect(level(bootstrap, 5)).toMatchObject({
      onWin: { money: 10000, funding: 80 },
      onIgnoredOrLost: { panicIncreaseHundredths: 0, funding: 0, defeat: true },
    });
    // Order has no meaning, and an empty or omitted Effect list is valid and changes nothing.
    const changed = catalogWith((raw) => {
      raw.get('raid_safehouse')['on_win'].reverse();
      raw.get('operation_level_2')['on_ignored_or_lost'] = [];
      delete raw.get('apprehend_member')['on_win'];
    });
    expect(site(changed, 'raid_safehouse').onWin).toEqual(site(gdrs, 'raid_safehouse').onWin);
    expect(level(changed, 2).onIgnoredOrLost).toEqual({
      panicIncreaseHundredths: 0,
      funding: 0,
      defeat: false,
    });
    expect(site(changed, 'apprehend_member').onWin).toEqual({
      money: 0,
      funding: 0,
      panicReductionHundredths: 0,
      eliminateTargetFaction: false,
    });
    expectDefective((raw) => {
      const file = raw.files.find((item) => item.path.endsWith('mission_site_archetypes.yaml'))!;
      file.gdrs.splice(file.gdrs.indexOf(raw.get('foil_sabotage')), 1);
    });
    expectDefective((raw) => (raw.get('raid_hq')['faction'] = 'red_dawn'));
    expectDefective((raw) =>
      raw.add('missions/mission_archetypes.yaml', { ...raw.get('standard_mission'), id: 'elite_mission' }),
    );
  });
});

describe('MISSION: Mission exhaustion', () => {
  it('adds exhaustion_per_mission and 1 per percent of the team Killed, rounded up', () => {
    const p = gdrs.agentParameters;
    expect(missionExhaustion(0, 4, p)).toBe(5);
    expect(missionExhaustion(1, 4, p)).toBe(30);
    expect(missionExhaustion(1, 3, p)).toBe(39);
    expect(missionExhaustion(1, 2, p)).toBe(55);
    // A survivor that leaves the Combat with exhaustion 80 after 73% of its team was Killed ends with 158.
    expect(80 + missionExhaustion(73, 100, p)).toBe(158);
  });

  it('applies to every survivor whatever the Combat outcome, with no upper clamp', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member');
    let state = created.state;
    const [a1, a2] = agentIds(state) as [string, string];
    // The first Enemy attack targets a2, and 5 health is all it has.
    state = tweak(state, (world) => {
      world.agents[a2]!.state.skillHundredths = 100000;
      // Base health 5 too: a Serving Agent that is not on Recovery has full current health.
      world.agents[a2]!.state.baseHealth = 5;
      setCurrentHealth(world.agents[a2]!.state, 500);
    });
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    const enemies = site(state, created.site).state.enemies;
    // a2 is killed by the first Enemy attack; a1 misses until the Combat ends.
    const after = advance(state, {
      [`combat.hit.${a1}`]: new Array<boolean>(200).fill(false),
      [`combat.hit.${a2}`]: [false],
      [`combat.target.${enemies[0]}`]: [a2],
      [`combat.hit.${enemies[0]}`]: [true, ...new Array<boolean>(200).fill(false)],
      [`combat.damage.${enemies[0]}`]: [5],
      ...Object.fromEntries(
        enemies.slice(1).map((id) => [`combat.hit.${id}`, new Array<boolean>(200).fill(false)]),
      ),
    });
    const report = after.world.history.turnReport!;
    expect(report.missions[0]!.killed).toEqual([a2]);
    const combatExhaustion = report.combatReports[0]!.participants.find((x) => x.id === a1)!.final.exhaustion;
    expect(agent(after, a1).state.exactExhaustionHundredths / 100).toBe(combatExhaustion + 55);
    expect(agent(after, a2).state.exactExhaustionHundredths / 100).toBe(
      report.combatReports[0]!.participants.find((x) => x.id === a2)!.final.exhaustion,
    );
    // AGENT, Service record: the Killed Agent records its effective max health and effective weapon damage, and keeps
    // current health 0 as health lost equal to its Final max health.
    expect(agent(after, a2).state).toMatchObject({
      finalMaxHealth: 5,
      finalWeaponDamage: 10,
      healthLostHundredths: 500,
    });
    expect(currentHealthOf(agent(after, a2).state)).toBe(0);
  });

  it('lets an Agent that is not Fit for work be deployed', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member');
    let state = tweak(created.state, (world) => {
      for (const agent of Object.values(world.agents)) {
        agent.state.exactExhaustionHundredths = 9000;
      }
    });
    const [a1] = agentIds(state) as [string];
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1] });
    expect(agent(state, a1).state.assignment?.kind).toBe('Deployed');
  });
});

describe('RECOVER: examples', () => {
  it('Health recovery rate', () => {
    // The percentage and the rate are Decimal quantities in hundredths: p 2.2 is 220, and a rate of 0.60 is 60.
    const rate = (pct: number) => healthRecoveryRateHundredths(30, pct);
    expect([200, 100, 220, 700, 1, 5000, 10000].map(rate)).toEqual([60, 30, 66, 210, 1, 1500, 3000]);
    expect([healthRecoveryRateHundredths(31, 200), healthRecoveryRateHundredths(31, 220)]).toEqual([62, 69]);
    expectDefective((raw) => (raw.get('recovery')['health_recovery_pct_per_turn'] = 0));
    expectDefective((raw) => (raw.get('recovery')['health_recovery_pct_per_turn'] = { $decimal: '0.125' }));
    expectDefective((raw) => (raw.get('recovery')['exhaustion_recovery_per_turn'] = { $decimal: '1.605' }));
    expectDefective((raw) => (raw.get('recovery')['exhaustion_recovery_per_turn'] = -1));
    expectDefective((raw) => (raw.get('recovery')['extra'] = 1));
    expectDefective((raw) =>
      raw.add('agent-recovery/recovery_parameters.yaml', { ...raw.get('recovery'), id: 'two' }),
    );
  });

  it('Returning from a Combat until Standby', () => {
    // The Combat is stipulated to leave a1 with current health 27 and exhaustion 14, on Recovery, In transit; no
    // Agent of its team was Killed, so Mission exhaustion raises its exhaustion by 5, to 19.
    let state = newCampaign({ money: 5000 });
    const [a1] = agentIds(state) as [string];
    expect(missionExhaustion(0, 1, gdrs.agentParameters)).toBe(5);
    state = tweak(state, (world) => {
      const s = world.agents[a1]!.state;
      setCurrentHealth(s, 2700);
      s.exactExhaustionHundredths = (14 + 5) * 100;
      s.assignment = { kind: 'Recovery' };
      s.status = 'InTransit';
    });
    const view = (s: CampaignState) => currentLiveWorldStateView(s, gdrs).agents.find((a) => a.id === a1)!;
    expect(view(state)).toMatchObject({
      healthRecoveryRateHundredths: 60,
      recoveryTurnsRemaining: 5,
      canBeAssigned: false,
    });
    state = advance(state); // arrives; no recovery
    expect(units(agent(state, a1).state)).toMatchObject({
      currentHealthHundredths: 2700,
      exactExhaustionHundredths: 1900,
      status: 'Recovering',
    });
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    // Current health and exhaustion in hundredths, and the Recovery turns remaining after each Advance turn.
    const expected: [number, number, number][] = [
      [2760, 1400, 4],
      [2820, 900, 3],
      [2880, 400, 2],
      [2940, 0, 1],
    ];
    for (const [health, exhaustion, remaining] of expected) {
      state = advance(state);
      expect(units(agent(state, a1).state)).toMatchObject({
        currentHealthHundredths: health,
        exactExhaustionHundredths: exhaustion,
        assignment: { kind: 'Recovery' },
      });
      expect(view(state).recoveryTurnsRemaining).toBe(remaining);
    }
    // 29.40 + 0.60 is exactly base health 30.
    state = advance(state);
    expect(units(agent(state, a1).state)).toMatchObject({
      currentHealthHundredths: 3000,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    expect(view(state)).toMatchObject({ recoveryTurnsRemaining: null, canBeAssigned: true });
  });

  it('Standby recovers exhaustion only; Assignments and phases that do not recover', () => {
    let state = withAgents(newCampaign({ money: 5000 }), 6);
    const [b1, b2, c1, c2, c3, c5] = agentIds(state) as [string, string, string, string, string, string];
    state = setAssignment(state, [c1], 'Contracting');
    state = setAssignment(state, [c2], 'Training');
    state = setAssignment(state, [c3], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      world.agents[b1]!.state.exactExhaustionHundredths = 300;
      for (const id of [b2, c1, c2, c3, c5]) {
        world.agents[id]!.state.exactExhaustionHundredths = 1400;
      }
    });
    const exhaustion = (s: CampaignState) =>
      [b1, b2, c1, c2, c3, c5].map((id) => agent(s, id).state.exactExhaustionHundredths / 100);
    // c1 and c2 do not recover, and their work adds nothing.
    state = advance(state);
    expect(exhaustion(state)).toEqual([0, 9, 14, 14, 14, 9]);
    state = advance(state);
    expect(exhaustion(state)).toEqual([0, 4, 14, 14, 9, 4]);
    state = advance(state);
    expect(exhaustion(state)).toEqual([0, 0, 14, 14, 4, 0]);
    expect(currentHealthOf(agent(state, b2).state) / 100).toBe(30);
  });

  it('Standby recovers exhaustion that is not whole', () => {
    // With the test value exhaustion_recovery_per_turn 1.6, Exact exhaustion keeps its decimal places and exhaustion
    // is its value rounded up.
    const catalog = catalogWith(
      (raw) => (raw.get('recovery')['exhaustion_recovery_per_turn'] = { $decimal: '1.6' }),
    );
    let state = newCampaign({ money: 5000, catalog });
    const [b3] = agentIds(state) as [string];
    state = tweak(state, (world) => (world.agents[b3]!.state.exactExhaustionHundredths = 500));
    const seen: [number, number][] = [];
    for (let i = 0; i < 4; i += 1) {
      state = advance(state, {}, catalog);
      const s = agent(state, b3).state;
      seen.push([s.exactExhaustionHundredths, exhaustionOf(s)]);
    }
    expect(seen).toEqual([
      [340, 4],
      [180, 2],
      [20, 1],
      [0, 0],
    ]);
  });

  it('Current health reaching base health and exhaustion reaching 0 in one step; independence', () => {
    let state = newCampaign({ money: 5000 });
    const [d1, d2, g2] = agentIds(state) as [string, string, string];
    state = tweak(state, (world) => {
      const set = (id: string, health: number, exhaustion: number) => {
        const s = world.agents[id]!.state;
        setCurrentHealth(s, health);
        s.exactExhaustionHundredths = exhaustion * 100;
        s.assignment = { kind: 'Recovery' };
        s.status = 'Recovering';
      };
      set(d1, 2940, 3);
      set(d2, 2940, 8);
      set(g2, 1000, 20);
    });
    const forward = advance(state);
    const reversed = advance(state, {}, gdrs, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect(units(agent(forward, d1).state)).toMatchObject({
      currentHealthHundredths: 3000,
      exactExhaustionHundredths: 0,
      assignment: { kind: 'Standby' },
    });
    expect(units(agent(forward, d2).state)).toMatchObject({
      currentHealthHundredths: 3000,
      exactExhaustionHundredths: 300,
      assignment: { kind: 'Standby' },
    });
    expect(units(agent(forward, g2).state)).toMatchObject({
      currentHealthHundredths: 1060,
      exactExhaustionHundredths: 1500,
      assignment: { kind: 'Recovery' },
    });
    expect(agent(advance(forward), d2).state.exactExhaustionHundredths / 100).toBe(0);
  });

  it('Recovery clamp with a test Health recovery rate', () => {
    expect(healthRecoveryRateHundredths(30, 700)).toBe(210);
    const remaining = (health: number) =>
      recoveryTurnsRemaining({ maxHealth: 30, currentHealthHundredths: health }, 700);
    expect([2200, 2410, 2620, 2830].map(remaining)).toEqual([4, 3, 2, 1]);
    expect(
      recoveryTurnsRemaining(
        { maxHealth: 30, currentHealthHundredths: 3000 },
        gdrs.recoveryParameters.healthRecoveryPctPerTurnHundredths,
      ),
    ).toBe(0);
    const catalog = catalogWith((raw) => (raw.get('recovery')['health_recovery_pct_per_turn'] = 7));
    let state = newCampaign({ money: 5000, catalog });
    const [e1] = agentIds(state) as [string];
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[e1]!.state, 2200);
      world.agents[e1]!.state.assignment = { kind: 'Recovery' };
      world.agents[e1]!.state.status = 'Recovering';
    });
    const healths: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      state = advance(state, {}, catalog);
      healths.push(currentHealthOf(agent(state, e1).state));
    }
    // 28.30 + 2.10 = 30.40 is clamped to base health 30.
    expect(healths).toEqual([2410, 2620, 2830, 3000]);
    expect(agent(state, e1).state.assignment).toEqual({ kind: 'Standby' });
  });
});
