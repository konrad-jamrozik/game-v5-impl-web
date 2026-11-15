/** Acceptance examples of AGENT (Agents). */
import { describe, expect, it } from 'vitest';
import {
  canBeOrdered,
  clampExhaustion,
  clampHealth,
  effectiveSkill,
} from '../../src/engine/mechanics/agents/agents.ts';
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

describe('AGENT: Acceptance examples', () => {
  it('Effective skill computations', () => {
    const rows: [number, number, number, number, number?][] = [
      [100, 30, 0, 100],
      [100, 15, 25, 40],
      [100, 30, 5, 100],
      [100, 30, 6, 99],
      [100, 29, 0, 96],
      [130, 22, 40, 61],
      [100, 30, 100, 5],
      [100, 1, 100, 0],
      [100, 0, 0, 0],
      [100, 30, 60, 0, 2],
    ];
    for (const [skill, currentHealth, exhaustion, expected, penalty] of rows) {
      const parameters = penalty === undefined ? p : { ...p, skillPenaltyPctPerExhaustion: penalty };
      expect(effectiveSkill({ skill, currentHealth, baseHealth: 30, exhaustion }, parameters)).toBe(expected);
    }
  });

  it('Exhaustion and current health clamps', () => {
    expect(clampExhaustion(99 + 1 + 1, p)).toBe(100);
    expect(clampExhaustion(-3, p)).toBe(0);
    expect(effectiveSkill({ skill: 100, currentHealth: 30, baseHealth: 30, exhaustion: 100 }, p)).toBe(5);
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
        lifecycle: 'Serving',
        skill: 100,
        currentHealth: 30,
        baseHealth: 30,
        exhaustion: 0,
        weapon: 'sidearm',
        weaponDamage: 10,
        assignment: { kind: 'Standby' },
        taskPhase: 'AtAssignment',
        participationHistory: [],
      });
      expect(effectiveSkill(a.state, p)).toBe(100);
      expect(canBeOrdered(a.state)).toBe(true);
    }
    const view = currentStateView(state, gdrs);
    expect(view.agents.every((a) => a.canBeOrdered && a.effectiveSkill === 100)).toBe(true);
  });

  it('Transit: ordered to Contracting', () => {
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Contracting' });
    expect(agent(state, a1).state).toMatchObject({
      assignment: { kind: 'Contracting' },
      taskPhase: 'InTransit',
    });
    expectRejected(
      state,
      'assignAgents',
      { agents: [a1], assignment: 'Standby' },
      'agents_cannot_be_ordered',
    );
    const before = money(state);
    state = advance(state);
    expect(agent(state, a1).state.taskPhase).toBe('AtAssignment');
    // Income from funding only; upkeep for all 4 Serving Agents.
    expect(money(state)).toBe(before + 20 - 40);
    expect(canBeOrdered(agent(state, a1).state)).toBe(true);
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
      taskPhase: 'InTransit',
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
      taskPhase: 'AtAssignment',
    });
  });

  it('Transit: returning survivors; Deployed at once', () => {
    const created = addMissionSite(newCampaign(), 'apprehend_member', { turnsUntilExpiry: 1 });
    let state = created.state;
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'deployAgents', { missionSite: created.site, agents: [a1, a2] });
    const mission = missionAt(state, created.site);
    for (const id of [a1, a2]) {
      expect(agent(state, id).state).toMatchObject({
        assignment: { kind: 'Deployed', mission },
        taskPhase: 'AtAssignment',
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
    expect(agent(state, a1).state).toMatchObject({ assignment: { kind: 'Standby' }, taskPhase: 'InTransit' });
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Mission', id: mission }]);
    expect(canBeOrdered(agent(state, a1).state)).toBe(false);
    state = advance(state);
    expect(agent(state, a1).state.taskPhase).toBe('AtAssignment');
    expect(canBeOrdered(agent(state, a1).state)).toBe(true);
  });

  it('Training growth', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'assignAgents', { agents: [a1, a2], assignment: 'Training' });
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({ skill: 100, taskPhase: 'AtAssignment' });
    state = advance(state);
    expect([agent(state, a1).state.skill, agent(state, a2).state.skill]).toEqual([101, 101]);
    state = advance(state);
    expect(agent(state, a1).state.skill).toBe(102);
    expect(effectiveSkill(agent(state, a1).state, p)).toBe(102);
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    state = advance(state);
    expect(agent(state, a1).state).toMatchObject({
      skill: 102,
      exhaustion: 0,
      assignment: { kind: 'Standby' },
    });
    expect(agent(state, a2).state.skill).toBe(103);
  });

  it('Assigning Agents: rejections and recall', () => {
    let state = withAgents(newCampaign(), 8);
    const [a1, a2, a3, a4, a6, a7, a8] = agentIds(state) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      world.agents[a3]!.state.currentHealth = 20;
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a6]!.state.lifecycle = 'Killed';
      world.agents[a6]!.state.currentHealth = 0;
      world.agents[a6]!.state.assignment = null;
      world.agents[a6]!.state.taskPhase = null;
    });
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a7, a8] });
    const investigation = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[a7]!.state.taskPhase = 'AtAssignment';
      world.agents[a8]!.state.taskPhase = 'AtAssignment';
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

    const recalled = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(agent(recalled, a1).state).toMatchObject({
      assignment: { kind: 'Standby' },
      taskPhase: 'InTransit',
    });

    const moved = act(state, 'assignAgents', { agents: [a7], assignment: 'Training' });
    expect(agent(moved, a7).state).toMatchObject({
      assignment: { kind: 'Training' },
      taskPhase: 'InTransit',
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
        lifecycle: 'Serving',
        skill: 100,
        currentHealth: 30,
        weaponDamage: 10,
        assignment: { kind: 'Standby' },
        taskPhase: 'InTransit',
      });
    }
    expect(money(next)).toBe(0);
    // It ignores the Agent cap.
    const many = act(next, 'addAgents', { count: 30 }, 'developer');
    expect(agents(many)).toHaveLength(36);
  });

  it('Lifecycle and Current assignment structure: invalid variants', () => {
    const state = newCampaign();
    const [a1] = agentIds(state) as [string];
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.agents[a1]!.state.lifecycle = 'Killed'));
    invalid((world) => (world.agents[a1]!.state.currentHealth = 0));
    invalid((world) => (world.agents[a1]!.state.exhaustion = 101));
    invalid((world) => (world.agents[a1]!.state.assignment = null));
    invalid((world) => (world.agents[a1]!.state.assignment = { kind: 'Deployed', mission: 'nowhere' }));
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
    expectDefective((raw) => delete raw.get('agent_parameters')['exhaustion_cap']);
  });
});
