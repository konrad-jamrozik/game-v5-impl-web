/** Tests, from the former Acceptance examples, of AGENT (Agents). */
import { describe, expect, it } from 'vite-plus/test';
import {
  applyMissionGrowth,
  canBeAssigned,
  clampExhaustion,
  clampHealth,
  effectiveSkill,
  isAway,
  isInBase,
  survivalExperience,
  trainingGainProbability,
} from '../../src/engine/mechanics/agents/agents.ts';
import { ratio } from '../../src/kernel/index.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  agents,
  expectDefective,
  losing,
  expectRejected,
  gdrs,
  missionAt,
  money,
  newCampaign,
  setAssignment,
  tweak,
  units,
  winning,
  withAgents,
  setCurrentHealth,
  valuesOf,
  currentHealthOf,
  useExampleCatalog,
} from '../helpers/game.ts';

// The AgentParameters and the other values of the examples, e.g. `exhaustion_free_points` 30, are Fixture values; see
// EXAMPLE_VALUES. What a test expects is derived from them by the rule it checks.
useExampleCatalog({ legacy: true });

/** A Combatant's values in units, e.g. current health 28.67, held in hundredths as an Agent holds them. */
function values(skill: number, currentHealth: number, baseHealth: number, exhaustion: number) {
  return {
    skillHundredths: Math.round(skill * 100),
    currentHealthHundredths: Math.round(currentHealth * 100),
    maxHealth: baseHealth,
    exactExhaustionHundredths: Math.round(exhaustion * 100),
  };
}

const p = gdrs.agentParameters;
const archetype = gdrs.agentArchetype;
const { economy } = gdrs;
/** The values of a newly created Agent, from its AgentArchetype and the Weapon and Armor it names. */
const newAgent = {
  skill: archetype.skill,
  currentHealth: archetype.baseHealth,
  weapon: archetype.weapon,
  baseWeaponDamage: gdrs.weapons.get(archetype.weapon)!.damage,
  armor: archetype.armor,
  baseArmor: gdrs.armors.get(archetype.armor)!.armor,
};
const trainingGain = p.trainingSkillGainPerTurnHundredths;

describe('AGENT: Agent status', () => {
  it('is Recovering exactly when the Assignment is Recovery and the Agent is not In transit', () => {
    const state = newCampaign();
    const [a1] = agentIds(state) as [string];
    const withStatus = (kind: 'Standby' | 'Recovery', status: 'AtAssignment' | 'InTransit' | 'Recovering') =>
      checkInvariants(
        tweak(state, (world) => {
          // Only an Agent on Recovery may be below its base health.
          if (kind === 'Recovery') {
            setCurrentHealth(world.agents[a1]!.state, 2000);
          }
          world.agents[a1]!.state.assignment = { kind };
          world.agents[a1]!.state.status = status;
        }),
        gdrs,
      );
    expect(withStatus('Recovery', 'Recovering')).toEqual([]);
    expect(withStatus('Recovery', 'InTransit')).toEqual([]);
    expect(withStatus('Standby', 'AtAssignment')).toEqual([]);
    expect(withStatus('Recovery', 'AtAssignment').length).toBeGreaterThan(0);
    expect(withStatus('Standby', 'Recovering').length).toBeGreaterThan(0);
  });

  it('Transit: an In transit Agent on Recovery arrives Recovering', () => {
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = setAssignment(state, [a1], 'Recovery', 'InTransit');
    state = tweak(state, (world) => setCurrentHealth(world.agents[a1]!.state, 2000));
    state = advance(state);
    expect(units(agent(state, a1).state)).toMatchObject({
      currentHealth: 20,
      assignment: { kind: 'Recovery' },
      status: 'Recovering',
    });
  });
});

describe('AGENT: examples', () => {
  it('Effective skill computations', () => {
    // With the Fixture values `exhaustion_free_points` 30 and `skill_penalty_pct_per_exhaustion` 1, and 2 in the last
    // row.
    expect([p.exhaustionFreePoints, p.skillPenaltyPctPerExhaustion]).toEqual([30, 1]);
    const rows: [number, number, number, number, number?][] = [
      [100, 30, 0, 100],
      [100, 15, 50, 40],
      [100, 30, 30, 100],
      [100, 30, 31, 99],
      [100, 29, 0, 96],
      [130, 22, 65, 61],
      [100, 30, 47, 83],
      [100, 30, 100, 30],
      [100, 1, 100, 1],
      [100, 30, 130, 0],
      [100, 0, 0, 0],
      [100, 30, 85, 0, 2],
    ];
    for (const [skill, currentHealth, exhaustion, expected, penalty] of rows) {
      const parameters = penalty === undefined ? p : { ...p, skillPenaltyPctPerExhaustion: penalty };
      expect(effectiveSkill(values(skill, currentHealth, 30, exhaustion), parameters)).toBe(expected);
    }
  });

  it('Exhaustion and current health clamps', () => {
    // Exhaustion has no upper clamp: 99 + 1 + 1 is 101.
    expect(clampExhaustion(99 + 1 + 1)).toBe(101);
    expect(effectiveSkill(values(100, 30, 30, 101), p)).toBe(29);
    // An Agent on Standby with exhaustion 3 that recovers 5 has exhaustion 0, not −2.
    expect(clampExhaustion(3 - 5)).toBe(0);
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = tweak(state, (world) => (world.agents[a1]!.state.exactExhaustionHundredths = 300));
    state = advance(state);
    expect(agent(state, a1).state.exactExhaustionHundredths / 100).toBe(0);
    expect(clampHealth(3 - 10, 30)).toBe(0);
    expect(clampHealth(35, 30)).toBe(30);
  });

  it('Initial roster', () => {
    const state = newCampaign();
    const roster = agents(state);
    expect(roster).toHaveLength(p.initialRosterSize);
    expect(new Set(roster.map((a) => a.id)).size).toBe(p.initialRosterSize);
    for (const a of roster) {
      expect(a.archetype).toBe(archetype.id);
      expect(a.constants).toEqual({ agency: state.world.current.agency.id, turnHired: 1 });
      expect(a.state).toEqual({
        skillHundredths: newAgent.skill * 100,
        experience: 0,
        healthLostHundredths: 0,
        baseHealth: archetype.baseHealth,
        exactExhaustionHundredths: 0,
        weapon: newAgent.weapon,
        baseWeaponDamage: newAgent.baseWeaponDamage,
        armor: newAgent.armor,
        baseArmor: newAgent.baseArmor,
        assignment: { kind: 'Standby' },
        status: 'AtAssignment',
        participationHistory: [],
        enemiesKilled: 0,
        turnTerminated: null,
        killedBy: null,
        finalMaxHealth: null,
        finalWeaponDamage: null,
        finalArmor: null,
      });
      expect(currentHealthOf(a.state)).toBe(archetype.baseHealth * 100);
      expect(effectiveSkill(valuesOf(a.state), p)).toBe(newAgent.skill);
      expect(canBeAssigned(a.state)).toBe(true);
    }
    const view = currentLiveWorldStateView(state, gdrs);
    expect(view.agents.every((a) => a.canBeAssigned && a.effectiveSkill === newAgent.skill)).toBe(true);
  });

  it('Transit: ordered to Contracting', () => {
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Contracting' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Contracting' },
      status: 'InTransit',
    });
    // AGENT, Transit rule, No orders in transit: a second order naming a1 is rejected, and so is deploying it.
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    const site = addMissionSite(state, 'apprehend_member');
    expectRejected(
      site.state,
      'deployAgents',
      { missionSite: site.site, agents: [a1] },
      'agents_cannot_be_ordered',
    );
    const before = money(state);
    const upkeep = agentIds(state).length * economy.upkeepPerAgent;
    state = advance(state);
    expect(agent(state, a1).state.status).toBe('AtAssignment');
    // Income from funding 20 only; upkeep for every Serving Agent.
    expect(money(state)).toBe(before + 20 - upkeep);
    expect(canBeAssigned(agent(state, a1).state)).toBe(true);
    const second = money(state);
    state = advance(state);
    // Arrived, a1 earns: with effective skill 100 exactly `contracting_income_per_agent`.
    expect(money(state)).toBe(second + 20 + economy.contractingIncomePerAgent - upkeep);
  });

  it('Transit: hired Agent', () => {
    let state = newCampaign();
    state = act(state, 'hireAgents', { count: 1 });
    const a5 = agentIds(state).at(-1)!;
    expect(agent(state, a5).constants.turnHired).toBe(1);
    expect(units(agent(state, a5).state)).toMatchObject({
      ...newAgent,
      exhaustion: 0,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    // AGENT, Transit rule, No orders in transit: the hired Agent cannot be ordered to Training until it arrives.
    expectRejected(
      state,
      'assignAgents',
      { agents: [a5], assignment: 'Training' },
      'agents_cannot_be_ordered',
    );
    expect(canBeAssigned(agent(state, a5).state)).toBe(false);
    const before = money(state);
    state = advance(state);
    // The hired Agent In transit costs upkeep with the others.
    expect(money(state)).toBe(before + 20 - agentIds(state).length * economy.upkeepPerAgent);
    expect(units(agent(state, a5).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    expect(canBeAssigned(agent(state, a5).state)).toBe(true);
  });

  it('Transit: returning survivors; Deployed at once', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member', { turnsUntilExpiration: 1 });
    let state = created.state;
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    const mission = missionAt(state, created.site);
    for (const id of [a1, a2]) {
      expect(units(agent(state, id).state)).toMatchObject({
        assignment: { kind: 'Deployed', mission },
        status: 'AtAssignment',
      });
    }
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    // Every Enemy attack misses, so both end unharmed.
    state = advance(state, winning(state, created.site));
    expect(state.world.current.missions[mission]!.state.lifecycle).toBe('Won');
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Mission', id: mission }]);
    // AGENT, Agents that can be assigned: In transit to Standby, it cannot be assigned.
    expect(canBeAssigned(agent(state, a1).state)).toBe(false);
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Training' },
      'agents_cannot_be_ordered',
    );
    state = advance(state);
    expect(agent(state, a1).state.status).toBe('AtAssignment');
    expect(canBeAssigned(agent(state, a1).state)).toBe(true);
  });

  it('Training growth', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    // Moving from Standby to Training takes no transit.
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' });
    expect(units(agent(state, a1).state)).toMatchObject({
      skill: newAgent.skill,
      exhaustion: 0,
      status: 'AtAssignment',
    });
    // At exhaustion of at most exhaustion_free_points and full health the Training gain Probability is 1: no injected
    // outcome is needed.
    expect(trainingGainProbability(valuesOf(agent(state, a1).state), p).eq(1)).toBe(true);
    // Base skill, in hundredths, after n Training steps, and the exhaustion each step adds (AGENT, Work exhaustion).
    const trained = (n: number) => newAgent.skill * 100 + n * trainingGain;
    const tired = p.exhaustionPerTrainingTurn;
    state = advance(state);
    expect([agent(state, a1).state.skillHundredths, agent(state, a2).state.skillHundredths]).toEqual([
      trained(1),
      trained(1),
    ]);
    expect(agent(state, a1).state.exactExhaustionHundredths).toBe(tired * 100);
    expect(state.world.history.turnReport?.training).toEqual([
      { agent: a1, gained: true, skillAfterHundredths: trained(1), exhaustionAfter: tired },
      { agent: a2, gained: true, skillAfterHundredths: trained(1), exhaustionAfter: tired },
    ]);
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      skillHundredths: trained(2),
      exactExhaustionHundredths: 2 * tired * 100,
    });
    expect(effectiveSkill(valuesOf(agent(state, a1).state), p)).toBe(Math.floor(trained(2) / 100));
    // Recalled to Standby at once, without transit; it then recovers its exhaustion.
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      skillHundredths: trained(2),
      exactExhaustionHundredths: Math.max(
        0,
        2 * tired * 100 - gdrs.recoveryParameters.exhaustionRecoveryPerTurnHundredths,
      ),
    });
    expect(agent(state, a2).state.skillHundredths).toBe(trained(3));
  });

  it('Training growth: a tired Agent gains with Probability 80 / 100', () => {
    let state = newCampaign();
    const [a2] = agentIds(state) as [string];
    state = setAssignment(state, [a2], 'Training');
    state = tweak(state, (world) => (world.agents[a2]!.state.exactExhaustionHundredths = 5000));
    expect(trainingGainProbability(valuesOf(agent(state, a2).state), p).eq(ratio(80, 100))).toBe(true);
    const outcome = `agent.trainingGain.${a2}`;
    const without = advance(state, { [outcome]: [false] });
    expect(units(agent(without, a2).state)).toMatchObject({ skill: 100, exhaustion: 51 });
    const gains = advance(state, { [outcome]: [true] });
    expect(units(agent(gains, a2).state)).toMatchObject({ skill: 101, exhaustion: 51 });
  });

  it('Turn report: Forced returns are listed in Agent order, whichever step made them', () => {
    let state = withAgents(newCampaign(), 2);
    const [a1, a2] = agentIds(state) as [string, string];
    // a2 returns in the Agency income step, before a1 returns in the later Training step.
    state = setAssignment(state, [a1], 'Training');
    state = setAssignment(state, [a2], 'Contracting');
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exactExhaustionHundredths = 6900;
      world.agents[a2]!.state.exactExhaustionHundredths = 6900;
    });
    state = advance(state, { [`agent.trainingGain.${a1}`]: [false] });
    expect(state.world.history.turnReport?.forcedReturns).toEqual([
      { agent: a1, from: 'Training' },
      { agent: a2, from: 'Contracting' },
    ]);
  });

  it('Start-work gate and Forced return', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Training');
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exactExhaustionHundredths = 6800;
      world.agents[a2]!.state.exactExhaustionHundredths = 6900;
      world.agents[a3]!.state.exactExhaustionHundredths = 3100;
      world.agents[a4]!.state.exactExhaustionHundredths = 3000;
    });
    const view = currentLiveWorldStateView(state, gdrs);
    expect(view.agents.map((a) => a.fitForWork)).toEqual([false, false, false, true]);
    expectRejected(
      state,
      'assignAgents',
      { agents: [a3], assignment: 'Contracting' },
      'agents_not_fit_for_work',
    );
    expectRejected(
      state,
      'assignAgents',
      { agents: [a3, a4], assignment: 'Contracting' },
      'agents_not_fit_for_work',
    );
    expect(
      agent(act(state, 'assignAgents', { agents: [a4], assignment: 'Contracting' }), a4).state.assignment,
    ).toEqual({ kind: 'Contracting' });
    // The gate applies only to Work Assignments: recalling a1 or a2 to Standby is accepted.
    act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    act(state, 'assignAgents', { agents: [a2], assignment: 'Standby' });

    state = advance(state, { [`agent.trainingGain.${a2}`]: [true] });
    // a1 earned with effective skill 62 and then reached 69, below 70: it stays on Contracting.
    expect(units(agent(state, a1).state)).toMatchObject({
      exhaustion: 69,
      assignment: { kind: 'Contracting' },
    });
    // a2 reached 70 in the Training step: Forced return to Standby, At assignment, then recovery to 65.
    expect(units(agent(state, a2).state)).toMatchObject({
      exhaustion: 65,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    expect(agent(state, a3).state.exactExhaustionHundredths / 100).toBe(26);
    expect(state.world.history.turnReport?.forcedReturns).toEqual([{ agent: a2, from: 'Training' }]);

    state = advance(state);
    expect(units(agent(state, a1).state)).toMatchObject({
      exhaustion: 70,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, a2).state.exactExhaustionHundredths / 100).toBe(60);
    expect(agent(state, a3).state.exactExhaustionHundredths / 100).toBe(21);
    // a1 is In transit, so it cannot be assigned at all, whatever its exhaustion.
    expect(canBeAssigned(agent(state, a1).state)).toBe(false);
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Training' },
      'agents_cannot_be_ordered',
    );
    expectRejected(
      state,
      'assignAgents',
      { agents: [a2], assignment: 'Training' },
      'agents_not_fit_for_work',
    );
    expect(currentLiveWorldStateView(state, gdrs).agents.find((a) => a.id === a3)?.fitForWork).toBe(true);
    // a1 arrives in the next Advance turn and then recovers 5 per Advance turn, to 30 after eight of them.
    state = advance(state);
    for (let turn = 0; turn < 8; turn += 1) {
      expect(agent(state, a1).state.exactExhaustionHundredths / 100).toBe(70 - 5 * turn);
      state = advance(state);
    }
    expect(agent(state, a1).state.exactExhaustionHundredths / 100).toBe(30);
  });

  it('Assigning Agents: rejections and recall', () => {
    let state = withAgents(newCampaign(), 8);
    const [a1, a2, a3, a4, a6, a7, a8, a5] = agentIds(state) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a5], 'Training');
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[a3]!.state, 2000);
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'Recovering';
      world.agents[a6]!.state.status = 'Killed';
      world.agents[a6]!.state.turnTerminated = 1;
      world.agents[a6]!.state.finalMaxHealth = world.agents[a6]!.state.baseHealth;
      world.agents[a6]!.state.finalWeaponDamage = world.agents[a6]!.state.baseWeaponDamage;
      world.agents[a6]!.state.finalArmor = world.agents[a6]!.state.baseArmor;
      world.agents[a6]!.state.killedBy = { enemy: 'enemy-1', missionSite: 'mission-site-1' };
      setCurrentHealth(world.agents[a6]!.state, 0);
      world.agents[a6]!.state.assignment = null;
    });
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a7, a8] });
    const investigation = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[a7]!.state.status = 'AtAssignment';
      world.agents[a8]!.state.status = 'AtAssignment';
    });
    const site = addMissionSite(state, 'foil_recruitment_push');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a4] });
    expect(checkInvariants(state, gdrs)).toEqual([]);

    const reject = (list: string[], assignment: string, reason: string) =>
      expectRejected(state, 'assignAgents', { agents: list, assignment }, reason);
    reject([], 'Standby', 'agents_empty');
    reject([a1, a1], 'Standby', 'agents_duplicate');
    reject([a1], 'Contracting', 'already_assigned');
    // a1 is on Contracting, an Away Assignment, which it can leave only for Standby. The [a1, a5] call of the
    // example also names a5, already on Training, so it is rejected as a whole; the error reports a5's failed
    // precondition first, and a1 alone shows a1's.
    reject([a1, a5], 'Training', 'already_assigned');
    reject([a1], 'Training', 'agents_not_in_base');
    reject([a2], 'Standby', 'agents_cannot_be_ordered');
    reject([a3], 'Standby', 'agents_cannot_be_ordered');
    reject([a4], 'Standby', 'agents_cannot_be_ordered');
    reject([a6], 'Standby', 'agents_cannot_be_ordered');
    reject(['nobody'], 'Standby', 'agents_unknown');
    reject([a1], 'Recovery', 'invalid_assignment');

    const withinBase = act(state, 'assignAgents', { agents: [a5], assignment: 'Standby' });
    expect(units(agent(withinBase, a5).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    // At assignment at once, so it can be assigned again in the same Turn.
    const onward = act(withinBase, 'assignAgents', { agents: [a5], assignment: 'Contracting' });
    expect(units(agent(onward, a5).state)).toMatchObject({
      assignment: { kind: 'Contracting' },
      status: 'InTransit',
    });

    const recalled = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(units(agent(recalled, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });

    reject([a7], 'Training', 'agents_not_in_base');
    const moved = act(state, 'assignAgents', { agents: [a7], assignment: 'Standby' });
    expect(units(agent(moved, a7).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(moved, a7).state.participationHistory).toEqual([
      { kind: 'Investigation', id: investigation },
    ]);
    expect(moved.world.current.investigations[investigation]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a8],
    });
  });

  it('Adding Agents', () => {
    let state = newCampaign({ money: 0 });
    state = tweak(state, (world) => {
      world.turn = 3;
    });
    expectRejected(state, 'addAgents', { count: 0 }, 'invalid_count', 'developer');
    expectRejected(state, 'addAgents', { count: -1 }, 'invalid_count', 'developer');
    expectRejected(state, 'addAgents', { count: 1.5 }, 'invalid_count', 'developer');
    const roster = agents(state).length;
    const next = act(state, 'addAgents', { count: 2 }, 'developer');
    const added = agents(next).slice(roster);
    expect(added).toHaveLength(2);
    for (const a of added) {
      expect(a.constants.turnHired).toBe(3);
      expect(units(a.state)).toMatchObject({
        ...newAgent,
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
    }
    expect(money(next)).toBe(0);
    // It ignores the Agent cap.
    const count = economy.baseAgentCap + 10;
    const many = act(next, 'addAgents', { count }, 'developer');
    expect(agents(many)).toHaveLength(roster + 2 + count);
  });

  it('Agent status and Assignment structure: invalid variants', () => {
    const state = newCampaign();
    const [a1] = agentIds(state) as [string];
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.agents[a1]!.state.status = 'Killed'));
    invalid((world) => setCurrentHealth(world.agents[a1]!.state, 0));
    invalid((world) => (world.agents[a1]!.state.exactExhaustionHundredths = -100));
    invalid((world) => (world.agents[a1]!.state.assignment = null));
    invalid((world) => (world.agents[a1]!.state.assignment = { kind: 'Deployed', mission: 'nowhere' }));
    invalid((world) => (world.agents[a1]!.state.status = 'Recovering'));
    expect(checkInvariants(state, gdrs)).toEqual([]);
  });

  it('GDR validation', () => {
    expectDefective((raw) =>
      raw.add('agents/agent_archetypes.yaml', { ...raw.get('field_agent'), id: 'second_agent' }),
    );
    expectDefective((raw) => (raw.get('field_agent')['base_health'] = 0));
    expectDefective((raw) => (raw.get('field_agent')['weapon'] = 'no_such_weapon'));
    expectDefective((raw) => (raw.get('field_agent')['rank'] = 1));
    // training_skill_gain_per_turn is a Decimal quantity: 0.125 has too many digits; every other value is whole.
    expectDefective(
      (raw) => (raw.get('agent_parameters')['training_skill_gain_per_turn'] = { $decimal: '0.125' }),
    );
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_per_attack'] = { $decimal: '0.5' }));
    expectDefective((raw) => delete raw.get('agent_parameters')['exhaustion_work_limit']);
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_cap'] = 100));
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_work_start_max'] = 70));
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_work_limit'] = 120));
    // experience_per_mission_survived is a list of one or more whole numbers of at least 0.
    expectDefective((raw) => (raw.get('agent_parameters')['experience_per_mission_survived'] = []));
    expectDefective((raw) => (raw.get('agent_parameters')['experience_per_mission_survived'] = [30, -1]));
    expectDefective((raw) => (raw.get('agent_parameters')['experience_per_mission_survived'] = 30));
    expectDefective(
      (raw) => (raw.get('agent_parameters')['experience_per_attack_hit'] = { $decimal: '0.5' }),
    );
    expectDefective((raw) => delete raw.get('agent_parameters')['experience_per_defense_miss']);
  });

  it('Mission growth', () => {
    // a1 has base skill 101.10 from Training and Experience 0, and m1 is its first Mission. Against one soldier, a1
    // hits three times and misses once, and is hit once and missed once; a2, the soldier's first target, hits once and
    // is then made dead.
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    const created = addMissionSite(state, 'foil_sabotage');
    state = act(created.state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    const enemies = created.state.world.current.missionSites[created.site]!.state.enemies;
    const soldier = enemies.find((id) => created.state.world.current.enemies[id]!.archetype === 'soldier')!;
    state = tweak(state, (world) => {
      world.agents[a1]!.state.skillHundredths = 10110;
      world.agents[a2]!.state.skillHundredths = 100_000;
      setCurrentHealth(world.agents[a2]!.state, 500);
      // Every other Enemy is dead at Combat start, so it never attacks and is never a target.
      world.enemies[soldier]!.state.healthLost = world.enemies[soldier]!.state.baseHealth - 20;
      // Without its armor, each hit of a1 removes current health, as in this example before Enemies wore armor.
      world.enemies[soldier]!.state.baseArmor = 0;
      for (const id of enemies.filter((item) => item !== soldier)) {
        world.enemies[id]!.state.healthLost = world.enemies[id]!.state.baseHealth;
      }
    });
    const m1 = missionAt(state, created.site);
    state = advance(state, {
      [`combat.hit.${a1}`]: [true, false, true, true],
      [`combat.damage.${a1}`]: [5, 5, 5],
      [`combat.hit.${a2}`]: [true],
      [`combat.damage.${a2}`]: [5],
      [`combat.target.${soldier}`]: [a2],
      [`combat.hit.${soldier}`]: [true, false, true],
      [`combat.damage.${soldier}`]: [7, 7],
    });
    const report = turnReportView(state)!;
    const combat = report.combatReports[0]!;
    const gainOf = (id: string) => combat.participants.find((p) => p.id === id)!.combatExperience;
    expect(combat.outcome).toBe('Won');
    expect(agent(state, a2).state.status).toBe('Killed');
    // a1: three hits and a miss for its attacks, a miss and a hit for those it took, e.g. 4 + 2 + 4 + 4 + 2 + 1 = 17
    // with the values of the example; a2: its hit, and the hit that made it dead, e.g. 4 + 1 = 5.
    const a1Combat =
      3 * p.experiencePerAttackHit +
      p.experiencePerAttackMiss +
      p.experiencePerDefenseMiss +
      p.experiencePerDefenseHit;
    expect(gainOf(a1)).toBe(a1Combat);
    expect(gainOf(a2)).toBe(p.experiencePerAttackHit + p.experiencePerDefenseHit);
    expect(gainOf(soldier)).toBeNull();
    // a1, a survivor, gains its combat skill gain and the survival skill gain of its first Mission; its base skill
    // gained in Training stays out of its Experience. a2, Killed, gains nothing.
    const survival = p.experiencePerMissionSurvived[0]!;
    const a1Gain = a1Combat + survival;
    expect(agent(state, a1).state).toMatchObject({
      skillHundredths: 10110 + a1Gain * 100,
      experience: a1Gain,
    });
    expect(agent(state, a2).state).toMatchObject({ skillHundredths: 100_000, experience: 0 });
    expect(report.missions[0]!.growth).toEqual([
      {
        agent: a1,
        survivalExperience: survival,
        missionExperience: a1Gain,
        skillAfterHundredths: 10110 + a1Gain * 100,
        experienceAfter: a1Gain,
      },
    ]);
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Mission', id: m1 }]);
    expect(currentLiveWorldStateView(state, gdrs).agents.find((item) => item.id === a1)!.experience).toBe(
      a1Gain,
    );
    expect(currentRetiredWorldStateView(state, gdrs).agents.find((item) => item.id === a2)!.experience).toBe(
      0,
    );
  });

  it('Mission growth: the survival skill gain by Missions survived', () => {
    // The example of AGENT, Mission growth, with its list `experience_per_mission_survived` [30, 25, 20, 15] as a
    // Fixture value: the fourth Mission survived gives 15, and so does the seventh, because the list has four entries.
    const q = { ...gdrs.agentParameters, experiencePerMissionSurvived: [30, 25, 20, 15] };
    expect([1, 2, 3, 4, 5, 7].map((n) => survivalExperience(n, q))).toEqual([30, 25, 20, 15, 15, 15]);
    const agentState = { skillHundredths: 10110, experience: 0 };
    expect(applyMissionGrowth(agentState, 13, 1, q)).toEqual({
      survivalExperience: 30,
      missionExperience: 43,
    });
    expect(agentState).toEqual({ skillHundredths: 14410, experience: 43 });
    expect(applyMissionGrowth(agentState, 0, 7, q)).toEqual({
      survivalExperience: 15,
      missionExperience: 15,
    });
    expect(agentState).toEqual({ skillHundredths: 15910, experience: 58 });
  });

  it('Service record: Enemies killed, Turn terminated, and Killed by', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    expect(units(agent(state, a1).state)).toMatchObject({
      enemiesKilled: 0,
      turnTerminated: null,
      killedBy: null,
    });

    // A won Combat: every Enemy a1's attacks leave dead raises its Enemies killed by 1.
    const won = addMissionSite(state, 'apprehend_member');
    state = act(won.state, 'deployAgents', { missionSite: won.site, agents: [a1] });
    state = advance(state, winning(state, won.site));
    const wonLog = turnReportView(state)!.combatReports[0]!.log;
    const kills = wonLog.filter((attack) => attack.attacker === a1 && attack.defenderDead).length;
    expect(kills).toBeGreaterThan(0);
    expect(units(agent(state, a1).state)).toMatchObject({
      enemiesKilled: kills,
      turnTerminated: null,
      killedBy: null,
    });

    // A lost Combat: a2 is Killed, and its Killed by names the attacking Enemy and its Mission site. With base health
    // and current health 5, the first hit makes it dead rather than Incapacitated.
    const lost = addMissionSite(state, 'apprehend_member');
    const weak = tweak(lost.state, (world) => {
      world.agents[a2]!.state.baseHealth = 5;
      setCurrentHealth(world.agents[a2]!.state, 500);
    });
    state = act(weak, 'deployAgents', { missionSite: lost.site, agents: [a2] });
    const fightTurn = state.world.current.turn;
    state = advance(state, losing(state, lost.site));
    const fatal = turnReportView(state)!.combatReports[0]!.log.find(
      (attack) => attack.defender === a2 && attack.defenderDead,
    )!;
    expect(units(agent(state, a2).state)).toMatchObject({
      status: 'Killed',
      enemiesKilled: 0,
      turnTerminated: fightTurn,
      killedBy: { enemy: fatal.attacker, missionSite: lost.site },
    });
    // WHIST: the Killed Agent is Retired and getCurrentRetiredWorldState() returns its Service record.
    expect(currentLiveWorldStateView(state, gdrs).agents.some((a) => a.id === a2)).toBe(false);
    expect(currentRetiredWorldStateView(state, gdrs).agents.find((a) => a.id === a2)).toMatchObject({
      turnTerminated: fightTurn,
      killedBy: { enemy: fatal.attacker, missionSite: lost.site },
    });
  });

  it('Agent statuses: every Serving Agent is In base or Away, whatever its health and exhaustion', () => {
    let state = withAgents(newCampaign(), 7);
    const [a1, a2, a3, a4, a5, a6, a7] = agentIds(state) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state = setAssignment(state, [a2], 'Training');
    state = setAssignment(state, [a3], 'Contracting');
    state = setAssignment(state, [a4], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      // a1 on Standby, At assignment, but too exhausted to start work and hurt: still In base.
      world.agents[a1]!.state.exactExhaustionHundredths = 9000;
      setCurrentHealth(world.agents[a1]!.state, 100);
      world.agents[a5]!.state.assignment = { kind: 'Recovery' };
      world.agents[a5]!.state.status = 'Recovering';
      world.agents[a6]!.state.assignment = { kind: 'Deployed', mission: 'mission-1' };
      world.agents[a7]!.state.status = 'Dismissed';
      world.agents[a7]!.state.assignment = null;
    });
    const where = (id: string) => {
      const found = currentLiveWorldStateView(state, gdrs).agents.find((a) => a.id === id);
      return found === undefined ? null : { inBase: found.inBase, away: found.away };
    };
    expect(where(a1)).toEqual({ inBase: true, away: false });
    expect(where(a2)).toEqual({ inBase: true, away: false });
    expect(where(a3)).toEqual({ inBase: false, away: true });
    expect(where(a4)).toEqual({ inBase: false, away: true });
    expect(where(a5)).toEqual({ inBase: true, away: false });
    expect(where(a6)).toEqual({ inBase: false, away: true });
    expect(isInBase(agent(state, a7).state)).toBe(false);
    expect(isAway(agent(state, a7).state)).toBe(false);
  });
});
