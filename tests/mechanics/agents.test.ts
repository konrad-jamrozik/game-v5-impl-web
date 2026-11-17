/** Acceptance examples of AGENT (Agents). */
import { describe, expect, it } from 'vitest';
import {
  canBeAssigned,
  clampExhaustion,
  clampHealth,
  effectiveSkill,
  trainingGainProbability,
} from '../../src/engine/mechanics/agents/agents.ts';
import { ratio } from '../../src/kernel/index.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import { currentStateView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  agents,
  expectDefective,
  expectRejected,
  gdrs,
  missionAt,
  money,
  newCampaign,
  setAssignment,
  tweak,
  winning,
  withAgents,
} from '../helpers/game.ts';

const p = gdrs.agentParameters;

describe('AGENT: Agent status', () => {
  it('is Recovering exactly when the Assignment is Recovery and the Agent is not In transit', () => {
    const state = newCampaign();
    const [a1] = agentIds(state) as [string];
    const withStatus = (kind: 'Standby' | 'Recovery', status: 'AtAssignment' | 'InTransit' | 'Recovering') =>
      checkInvariants(
        tweak(state, (world) => {
          world.agents[a1]!.state.currentHealth = 20;
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
    state = tweak(state, (world) => (world.agents[a1]!.state.currentHealth = 20));
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      currentHealth: 20,
      assignment: { kind: 'Recovery' },
      status: 'Recovering',
    });
  });
});

describe('AGENT: Acceptance examples', () => {
  it('Effective skill computations', () => {
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
      expect(effectiveSkill({ skill, currentHealth, baseHealth: 30, exhaustion }, parameters)).toBe(expected);
    }
  });

  it('Exhaustion and current health clamps', () => {
    // Exhaustion has no upper clamp: 99 + 1 + 1 is 101.
    expect(clampExhaustion(99 + 1 + 1)).toBe(101);
    expect(effectiveSkill({ skill: 100, currentHealth: 30, baseHealth: 30, exhaustion: 101 }, p)).toBe(29);
    // An Agent on Standby with exhaustion 3 that recovers 5 has exhaustion 0, not −2.
    expect(clampExhaustion(3 - 5)).toBe(0);
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = tweak(state, (world) => (world.agents[a1]!.state.exhaustion = 3));
    state = advance(state);
    expect(agent(state, a1).state.exhaustion).toBe(0);
    expect(clampHealth(3 - 10, 30)).toBe(0);
    expect(clampHealth(35, 30)).toBe(30);
  });

  it('Initial roster', () => {
    const state = newCampaign();
    const roster = agents(state);
    expect(roster).toHaveLength(4);
    expect(new Set(roster.map((a) => a.id)).size).toBe(4);
    for (const a of roster) {
      expect(a.archetype).toBe('field_agent');
      expect(a.constants).toEqual({ agency: state.world.current.agency.id, turnHired: 1 });
      expect(a.state).toEqual({
        skill: 100,
        currentHealth: 30,
        baseHealth: 30,
        exhaustion: 0,
        weapon: 'sidearm',
        weaponDamage: 10,
        assignment: { kind: 'Standby' },
        status: 'AtAssignment',
        participationHistory: [],
      });
      expect(effectiveSkill(a.state, p)).toBe(100);
      expect(canBeAssigned(a.state)).toBe(true);
    }
    const view = currentStateView(state, gdrs);
    expect(view.agents.every((a) => a.canBeAssigned && a.effectiveSkill === 100)).toBe(true);
  });

  it('Transit: ordered to Contracting', () => {
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Contracting' });
    expect(agent(state, a1).state).toMatchObject({
      assignment: { kind: 'Contracting' },
      status: 'InTransit',
    });
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    const before = money(state);
    state = advance(state);
    expect(agent(state, a1).state.status).toBe('AtAssignment');
    // Income from funding only; upkeep for all 4 Serving Agents.
    expect(money(state)).toBe(before + 20 - 40);
    expect(canBeAssigned(agent(state, a1).state)).toBe(true);
    const second = money(state);
    state = advance(state);
    expect(money(state)).toBe(second + 20 + 30 - 40);
  });

  it('Transit: hired Agent', () => {
    let state = newCampaign();
    state = act(state, 'hireAgent');
    const a5 = agentIds(state)[4]!;
    expect(agent(state, a5).constants.turnHired).toBe(1);
    expect(agent(state, a5).state).toMatchObject({
      skill: 100,
      currentHealth: 30,
      exhaustion: 0,
      weapon: 'sidearm',
      weaponDamage: 10,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expectRejected(
      state,
      'assignAgents',
      { agents: [a5], assignment: 'Training' },
      'agents_cannot_be_ordered',
    );
    const before = money(state);
    state = advance(state);
    expect(money(state)).toBe(before + 20 - 50);
    expect(agent(state, a5).state).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
  });

  it('Transit: returning survivors; Deployed at once', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member', { turnsUntilExpiration: 1 });
    let state = created.state;
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    const mission = missionAt(state, created.site);
    for (const id of [a1, a2]) {
      expect(agent(state, id).state).toMatchObject({
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
    // a1 ends unharmed; a2 takes one hit of 12.
    const enemies = state.world.current.missionSites[created.site]!.state.enemies;
    state = advance(state, {
      ...winning(state, created.site),
      [`combat.hit.${enemies[0]}`]: [false],
      [`combat.hit.${enemies[1]}`]: [false],
      [`combat.hit.${enemies[2]}`]: [false],
    });
    expect(state.world.current.missions[mission]!.state.lifecycle).toBe('Won');
    expect(agent(state, a1).state).toMatchObject({ assignment: { kind: 'Standby' }, status: 'InTransit' });
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Mission', id: mission }]);
    expect(canBeAssigned(agent(state, a1).state)).toBe(false);
    state = advance(state);
    expect(agent(state, a1).state.status).toBe('AtAssignment');
    expect(canBeAssigned(agent(state, a1).state)).toBe(true);
  });

  it('Training growth', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    // Moving from Standby to Training takes no transit.
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' });
    expect(agent(state, a1).state).toMatchObject({ skill: 100, exhaustion: 0, status: 'AtAssignment' });
    // At exhaustion of at most 30 and full health the Training gain Probability is 1: no injected outcome is needed.
    expect(trainingGainProbability(agent(state, a1).state, p).eq(1)).toBe(true);
    state = advance(state);
    expect([agent(state, a1).state.skill, agent(state, a2).state.skill]).toEqual([101, 101]);
    expect(agent(state, a1).state.exhaustion).toBe(1);
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({ skill: 102, exhaustion: 2 });
    expect(effectiveSkill(agent(state, a1).state, p)).toBe(102);
    // Recalled to Standby at once, without transit; it recovers its exhaustion of 2.
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(agent(state, a1).state).toMatchObject({ assignment: { kind: 'Standby' }, status: 'AtAssignment' });
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      skill: 102,
      exhaustion: 0,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    expect(agent(state, a2).state.skill).toBe(103);
  });

  it('Training growth: a tired Agent gains with Probability 80 / 100', () => {
    let state = newCampaign();
    const [a2] = agentIds(state) as [string];
    state = setAssignment(state, [a2], 'Training');
    state = tweak(state, (world) => (world.agents[a2]!.state.exhaustion = 50));
    expect(trainingGainProbability(agent(state, a2).state, p).eq(ratio(80, 100))).toBe(true);
    const outcome = `agent.trainingGain.${a2}`;
    const without = advance(state, { [outcome]: [false] });
    expect(agent(without, a2).state).toMatchObject({ skill: 100, exhaustion: 51 });
    const gains = advance(state, { [outcome]: [true] });
    expect(agent(gains, a2).state).toMatchObject({ skill: 101, exhaustion: 51 });
  });

  it('Start-work gate and Forced return', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Training');
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exhaustion = 68;
      world.agents[a2]!.state.exhaustion = 69;
      world.agents[a3]!.state.exhaustion = 31;
      world.agents[a4]!.state.exhaustion = 30;
    });
    const view = currentStateView(state, gdrs);
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
    expect(agent(state, a1).state).toMatchObject({ exhaustion: 69, assignment: { kind: 'Contracting' } });
    // a2 reached 70 in the Training step: Forced return to Standby, At assignment, then recovery to 65.
    expect(agent(state, a2).state).toMatchObject({
      exhaustion: 65,
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    expect(agent(state, a3).state.exhaustion).toBe(26);
    expect(state.world.history.turnReport?.forcedReturns).toEqual([{ agent: a2, from: 'Training' }]);

    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      exhaustion: 70,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, a2).state.exhaustion).toBe(60);
    expect(agent(state, a3).state.exhaustion).toBe(21);
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    expectRejected(
      state,
      'assignAgents',
      { agents: [a2], assignment: 'Training' },
      'agents_not_fit_for_work',
    );
    expect(currentStateView(state, gdrs).agents.find((a) => a.id === a3)?.fitForWork).toBe(true);
    // a1 arrives in the next Advance turn and then recovers 5 per Advance turn, to 30 after eight of them.
    state = advance(state);
    for (let turn = 0; turn < 8; turn += 1) {
      expect(agent(state, a1).state.exhaustion).toBe(70 - 5 * turn);
      state = advance(state);
    }
    expect(agent(state, a1).state.exhaustion).toBe(30);
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
      world.agents[a3]!.state.currentHealth = 20;
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'Recovering';
      world.agents[a6]!.state.status = 'Killed';
      world.agents[a6]!.state.currentHealth = 0;
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
    reject([a1, a2], 'Training', 'agents_cannot_be_ordered');
    reject([a3], 'Standby', 'agents_cannot_be_ordered');
    reject([a4], 'Standby', 'agents_cannot_be_ordered');
    reject([a6], 'Standby', 'agents_cannot_be_ordered');
    reject(['nobody'], 'Standby', 'agents_unknown');
    reject([a1], 'Recovery', 'invalid_assignment');

    const withinBase = act(state, 'assignAgents', { agents: [a5], assignment: 'Standby' });
    expect(agent(withinBase, a5).state).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    // At assignment at once, so it can be assigned again in the same Turn.
    const onward = act(withinBase, 'assignAgents', { agents: [a5], assignment: 'Contracting' });
    expect(agent(onward, a5).state).toMatchObject({
      assignment: { kind: 'Contracting' },
      status: 'InTransit',
    });

    const recalled = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(agent(recalled, a1).state).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });

    const moved = act(state, 'assignAgents', { agents: [a7], assignment: 'Training' });
    expect(agent(moved, a7).state).toMatchObject({
      assignment: { kind: 'Training' },
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
    const next = act(state, 'addAgents', { count: 2 }, 'developer');
    const added = agents(next).slice(4);
    expect(added).toHaveLength(2);
    for (const a of added) {
      expect(a.constants.turnHired).toBe(3);
      expect(a.state).toMatchObject({
        skill: 100,
        currentHealth: 30,
        weaponDamage: 10,
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
    }
    expect(money(next)).toBe(0);
    // It ignores the Agent cap.
    const many = act(next, 'addAgents', { count: 30 }, 'developer');
    expect(agents(many)).toHaveLength(36);
  });

  it('Agent status and Assignment structure: invalid variants', () => {
    const state = newCampaign();
    const [a1] = agentIds(state) as [string];
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.agents[a1]!.state.status = 'Killed'));
    invalid((world) => (world.agents[a1]!.state.currentHealth = 0));
    invalid((world) => (world.agents[a1]!.state.exhaustion = -1));
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
    expectDefective(
      (raw) => (raw.get('agent_parameters')['training_skill_gain_per_turn'] = { $decimal: '0.5' }),
    );
    expectDefective((raw) => delete raw.get('agent_parameters')['exhaustion_work_limit']);
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_cap'] = 100));
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_work_start_max'] = 70));
    expectDefective((raw) => (raw.get('agent_parameters')['exhaustion_work_limit'] = 120));
  });
});
