/** Acceptance examples of LEAD (Leads and Progression) and INVSTG (Investigations). */
import { describe, expect, it } from 'vitest';
import { completionProbability } from '../../src/engine/mechanics/investigations/investigations.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import { isServing, type CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView, historyView } from '../../src/engine/views/views.ts';
import type { GdrCatalog } from '../../src/gdr/index.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  arriveAgent,
  catalogWith,
  expectDefective,
  expectRejected,
  gdrs,
  losing,
  missionAt,
  newCampaign,
  onlyFaction,
  setAssignment,
  tweak,
  winning,
  withAgents,
} from '../helpers/game.ts';

const leads = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  Object.fromEntries(currentStateView(state, catalog).leads.map((lead) => [lead.id, lead]));
const blocking = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  Object.fromEntries(
    currentStateView(state, catalog).leads.map((lead) => [lead.id, lead.blockingConditions]),
  );
const investigations = (state: CampaignState) => Object.values(state.world.current.investigations);
const sites = (state: CampaignState) => Object.values(state.world.current.missionSites);
const completes = (id: string, value: boolean) => ({ [`investigation.completion.${id}`]: [value] });
const arrive = (state: CampaignState) =>
  tweak(state, (world) => {
    for (const item of Object.values(world.agents)) {
      arriveAgent(item.state);
    }
  });
const MEMBER = 'locate_red_dawn_member';
const SAFEHOUSE = 'locate_red_dawn_safehouse';
const HQ = 'locate_red_dawn_hq';

/** Plays the Victory path up to a Won Mission from the given Lead, with every outcome injected. */
function winLead(state: CampaignState, lead: string): CampaignState {
  const ids = agentIds(state).filter((id) => isServing(agent(state, id).state));
  let next = act(arrive(state), 'startInvestigation', { lead, agents: ids.slice(0, 1) });
  const investigation = investigations(next).at(-1)!.id;
  next = tweak(arrive(next), (world) => {
    world.investigations[investigation]!.state.progress = 5000;
    world.investigations[investigation]!.state.progress = 0;
  });
  next = advance(arrive(next), completes(investigation, true));
  const site = sites(next).at(-1)!.id;
  next = act(arrive(next), 'deployAgents', { missionSite: site, agents: ids });
  next = advance(next, winning(next, site));
  expect(next.world.current.missions[missionAt(next, site)]!.state.lifecycle).toBe('Won');
  return tweak(arrive(next), (world) => {
    for (const item of Object.values(world.agents)) {
      if (isServing(item.state)) {
        item.state.currentHealth = item.state.baseHealth;
        item.state.exhaustion = 0;
        item.state.assignment = { kind: 'Standby' };
      }
    }
  });
}

describe('LEAD: Acceptance examples', () => {
  it('Campaign creation', () => {
    const state = newCampaign();
    // Leads add nothing to Campaign state.
    expect(state.world.current).not.toHaveProperty('leadProgression');
    expect(blocking(state)).toEqual({ [MEMBER]: [], [SAFEHOUSE]: [1], [HQ]: [1] });
    const view = leads(state);
    expect(view[MEMBER]).toMatchObject({
      available: true,
      canBeInvestigatedNow: true,
      requires: [],
    });
    expect(view[HQ]).toMatchObject({
      available: false,
      difficulty: 10,
      factionArchetype: 'red_dawn',
      createsMissionSite: 'raid_hq',
      requires: [{ missionWon: 'raid_safehouse', holds: false }],
      conditions: {
        prerequisitesHold: false,
        noMissionWon: true,
        noMissionSiteInProgress: true,
        factionNotEliminated: true,
      },
    });
  });

  it('The first Mission Won', () => {
    let state = newCampaign();
    const ids = agentIds(state);
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [ids[0]] });
    const i1 = investigations(state)[0]!.id;
    expect(leads(state)[MEMBER]).toMatchObject({
      available: true,
      canBeInvestigatedNow: false,
      activeInvestigation: i1,
    });
    expectRejected(
      state,
      'startInvestigation',
      { lead: MEMBER, agents: [ids[1]] },
      'lead_has_active_investigation',
    );
    state = advance(state);
    state = advance(state, completes(i1, true));
    const s1 = sites(state)[0]!;
    expect(s1).toMatchObject({ archetype: 'apprehend_member', state: { lifecycle: 'Active' } });
    expect(s1.constants.targetFaction).toBe(onlyFaction(state).id);
    expect(blocking(state)).toEqual({ [MEMBER]: [3], [SAFEHOUSE]: [1], [HQ]: [1] });

    state = act(arrive(state), 'deployAgents', { missionSite: s1.id, agents: ids });
    expect(blocking(state)[MEMBER]).toEqual([3]);
    state = advance(state, winning(state, s1.id));
    const m1 = missionAt(state, s1.id);
    expect(state.world.current.missions[m1]!.state.lifecycle).toBe('Won');
    expect(blocking(state)).toEqual({ [MEMBER]: [2], [SAFEHOUSE]: [], [HQ]: [1] });
    expect(leads(state)[MEMBER]).toMatchObject({ available: false, conditions: { noMissionWon: false } });
    expect(leads(state)[HQ]!.requires).toEqual([{ missionWon: 'raid_safehouse', holds: false }]);
    expectRejected(
      arrive(state),
      'startInvestigation',
      { lead: MEMBER, agents: [ids[0]] },
      'lead_not_available',
    );
  });

  it('A Lost Mission and an Expired Mission site, then a Won Mission', () => {
    let state = winLead(newCampaign({ money: 100_000 }), MEMBER);
    const ids = agentIds(state);
    // Lost: nothing is recorded and the Lead is available again.
    state = act(state, 'startInvestigation', { lead: SAFEHOUSE, agents: [ids[0]] });
    state = advance(arrive(state), completes(investigations(state).at(-1)!.id, true));
    const s2 = sites(state).at(-1)!.id;
    expect(blocking(state)[SAFEHOUSE]).toEqual([3]);
    state = act(arrive(state), 'deployAgents', { missionSite: s2, agents: [ids[1]] });
    state = advance(state, losing(state, s2));
    expect(state.world.current.missions[missionAt(state, s2)]!.state.lifecycle).toBe('Lost');
    expect(blocking(state)).toMatchObject({ [SAFEHOUSE]: [], [HQ]: [1] });

    // Expired: the new Mission site does not count down in the Advance turn that creates it.
    state = tweak(arrive(state), (world) => {
      for (const item of Object.values(world.agents)) {
        if (isServing(item.state)) {
          item.state.currentHealth = item.state.baseHealth;
          item.state.assignment = { kind: 'Standby' };
        }
      }
    });
    const serving = agentIds(state).filter((id) => isServing(agent(state, id).state));
    state = act(state, 'startInvestigation', { lead: SAFEHOUSE, agents: [serving[0]] });
    state = advance(arrive(state), completes(investigations(state).at(-1)!.id, true));
    const s3 = sites(state).at(-1)!;
    expect(s3.state.turnsUntilExpiration).toBe(8);
    for (let i = 0; i < 8; i += 1) {
      expect(blocking(state)[SAFEHOUSE]).toEqual([3]);
      state = advance(state);
    }
    expect(state.world.current.missionSites[s3.id]!.state.lifecycle).toBe('Expired');
    expect(blocking(state)[SAFEHOUSE]).toEqual([]);

    // Won: the prerequisite of hq holds; the Lost Mission did not make it hold.
    state = winLead(state, SAFEHOUSE);
    const wins = Object.values(state.world.current.missions).filter(
      (mission) =>
        mission.state.lifecycle === 'Won' &&
        sites(state).find((site) => site.id === mission.constants.missionSite)?.archetype ===
          'raid_safehouse',
    );
    expect(wins).toHaveLength(1);
    expect(wins[0]!.id).not.toBe(missionAt(state, s2));
    expect(blocking(state)).toEqual({ [MEMBER]: [2], [SAFEHOUSE]: [2], [HQ]: [] });
  });

  it('The last Lead and the elimination of Red Dawn', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    for (let i = 0; i < 4; i += 1) {
      state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    }
    state = winLead(winLead(winLead(state, MEMBER), SAFEHOUSE), HQ);
    expect(onlyFaction(state).state.eliminated).toBe(true);
    expect(blocking(state)).toEqual({ [MEMBER]: [2, 4], [SAFEHOUSE]: [2, 4], [HQ]: [2, 4] });
    expect(leads(state)[HQ]!.requires).toEqual([{ missionWon: 'raid_safehouse', holds: true }]);
    expect(state.world.current.ending).toBe('Victory');
  });

  it('An Abandoned Investigation', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] });
    const i1 = investigations(state)[0]!.id;
    expect(blocking(state)[MEMBER]).toEqual([]);
    state = act(arrive(state), 'assignAgents', { agents: [a1], assignment: 'Contracting' });
    expect(state.world.current.investigations[i1]!.state).toMatchObject({
      lifecycle: 'Abandoned',
      currentTeam: [],
    });
    expect(blocking(state)[MEMBER]).toEqual([]);
    expect(sites(state)).toHaveLength(0);
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a2] });
    expect(investigations(state)[1]).toMatchObject({ state: { progress: 0, lifecycle: 'Active' } });
    expect(investigations(state)[1]!.id).not.toBe(i1);
  });

  it('A Mission site Cancelled by the elimination of its Faction', () => {
    const catalog = catalogWith((raw) =>
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(MEMBER),
        id: 'test_lead',
        difficulty: 1,
      }),
    );
    let state = withAgents(newCampaign({ money: 100_000, catalog }), 12);
    state = tweak(state, (world) => {
      world.agency.state.acquisitions['transport_cap'] = 4;
    });
    const ids = agentIds(state);
    const hq = addMissionSite(state, 'raid_hq', { catalog });
    state = act(
      hq.state,
      'deployAgents',
      { missionSite: hq.site, agents: ids.slice(0, 8) },
      'player',
      catalog,
    );
    state = act(state, 'startInvestigation', { lead: 'test_lead', agents: [ids[8]] }, 'player', catalog);
    const i7 = investigations(state).at(-1)!.id;
    state = arrive(state);
    state = advance(state, { ...completes(i7, true), ...winning(state, hq.site) }, catalog);
    const s7 = sites(state).at(-1)!;
    expect(s7).toMatchObject({ archetype: 'apprehend_member', state: { lifecycle: 'Cancelled' } });
    expect(blocking(state, catalog)['test_lead']).toEqual([4]);
    expect(state.world.current.missions[missionAt(state, hq.site)]!.state.lifecycle).toBe('Won');
    expect(currentStateView(state, catalog).missionSites).toHaveLength(0);
  });

  it('Two Leads requiring the same MissionSiteArchetype', () => {
    const catalog = catalogWith((raw) => {
      for (const id of ['test_lead_a', 'test_lead_b']) {
        raw.add('leads-and-progression/leads.yaml', { ...raw.get(SAFEHOUSE), id, difficulty: 1 });
      }
    });
    let state = newCampaign({ catalog });
    expect(blocking(state, catalog)).toMatchObject({ test_lead_a: [1], test_lead_b: [1] });
    const site = addMissionSite(state, 'apprehend_member', { catalog });
    state = act(
      site.state,
      'deployAgents',
      { missionSite: site.site, agents: agentIds(site.state).slice(0, 2) },
      'player',
      catalog,
    );
    state = advance(state, winning(state, site.site), catalog);
    expect(blocking(state, catalog)).toMatchObject({ test_lead_a: [], test_lead_b: [], [SAFEHOUSE]: [] });
    const [, , a3, a4] = agentIds(state) as [string, string, string, string];
    state = act(state, 'startInvestigation', { lead: 'test_lead_a', agents: [a3] }, 'player', catalog);
    expect(blocking(state, catalog)['test_lead_b']).toEqual([]);
    state = act(state, 'startInvestigation', { lead: 'test_lead_b', agents: [a4] }, 'player', catalog);
    expect(checkInvariants(state, catalog)).toEqual([]);
  });

  it('Prerequisites: a Won Response Mission counts; a Mission site of another Faction does not', () => {
    const catalog = catalogWith((raw) =>
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_lead',
        requires: [{ $entries: [['mission_won', 'foil_sabotage']] }],
      }),
    );
    let state = withAgents(newCampaign({ catalog }), 4);
    expect(blocking(state, catalog)['test_lead']).toEqual([1]);
    const site = addMissionSite(state, 'foil_sabotage', { catalog });
    state = act(
      site.state,
      'deployAgents',
      { missionSite: site.site, agents: agentIds(site.state).slice(0, 4) },
      'player',
      catalog,
    );
    state = advance(state, winning(state, site.site), catalog);
    expect(state.world.current.missions[missionAt(state, site.site)]!.state.lifecycle).toBe('Won');
    expect(blocking(state, catalog)['test_lead']).toEqual([]);
    // The same Won Mission at a Mission site that targets another Faction makes no prerequisite hold.
    const elsewhere = tweak(state, (world) => {
      (world.missionSites[site.site]!.constants as { targetFaction: string }).targetFaction =
        'no_such_faction';
    });
    expect(blocking(elsewhere, catalog)['test_lead']).toEqual([1]);
  });

  it('GDR validation', () => {
    const requires = (site: string) => ({ $entries: [['mission_won', site]] });
    expectDefective((raw) => raw.get(MEMBER)['requires'].push(requires('raid_hq')));
    expectDefective((raw) => (raw.get(SAFEHOUSE)['requires'] = [requires('raid_safehouse')]));
    expectDefective((raw) => (raw.get(HQ)['requires'] = [requires('no_such_site')]));
    expectDefective((raw) => raw.get(HQ)['requires'].push(requires('raid_safehouse')));
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['requires'] = [{ $entries: [['mission_won_from_lead', MEMBER]] }]),
    );
    expectDefective((raw) => (raw.get(MEMBER)['faction'] = 'apprehend_member'));
    expectDefective((raw) => (raw.get(MEMBER)['difficulty'] = 0));
    expectDefective((raw) => (raw.get(MEMBER)['difficulty'] = { $decimal: '2.5' }));
    expectDefective((raw) => (raw.get(MEMBER)['on_completion'].$entries[0][1] = 'foil_sabotage'));
    expectDefective((raw) => raw.get(MEMBER)['on_completion'].$entries.push(['second_effect', 1]));
    expectDefective((raw) => (raw.get(MEMBER)['on_completion'].$entries[0][0] = 'create_mission'));
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['requires'] = [{ $entries: [['mission_lost', 'apprehend_member']] }]),
    );
    expectDefective((raw) => (raw.get(MEMBER)['repeatable'] = true));
  });
});

describe('INVSTG: Acceptance examples', () => {
  const projected = (state: CampaignState) =>
    currentStateView(state, gdrs).investigations[0]?.projectedCompletionProbability;

  it('One Agent on a difficulty 3 Lead', () => {
    let state = newCampaign();
    const [a1] = agentIds(state) as [string];
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] });
    const i1 = investigations(state)[0]!;
    expect(i1).toMatchObject({
      archetype: 'standard_investigation',
      constants: { lead: MEMBER, turnStarted: 1 },
      state: { lifecycle: 'Active', progress: 0, currentTeam: [a1] },
    });
    expect(agent(state, a1).state).toMatchObject({
      assignment: { kind: 'Investigation', investigation: i1.id },
      status: 'InTransit',
    });
    expect(projected(state)).toEqual({ n: '0', d: '1' });
    state = advance(state);
    expect(investigations(state)[0]!.state).toMatchObject({ progress: 0, lifecycle: 'Active' });
    expect(projected(state)).toEqual({ n: '1', d: '3' });
    state = advance(state, completes(i1.id, false));
    expect(investigations(state)[0]!.state.progress).toBe(100);
    expect(projected(state)).toEqual({ n: '2', d: '3' });
    state = advance(state, completes(i1.id, false));
    expect(investigations(state)[0]!.state.progress).toBe(200);
    // Progress 300 of 300: the completion probability is 1 and needs no injection.
    state = advance(state);
    expect(investigations(state)[0]!.state).toEqual({
      lifecycle: 'Completed',
      progress: 300,
      currentTeam: [],
    });
    expect(sites(state)[0]!.archetype).toBe('apprehend_member');
    expect(agent(state, a1).state).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
      exhaustion: 0,
      participationHistory: [{ kind: 'Investigation', id: i1.id }],
    });
    expect(historyView(state, gdrs).retained.investigations[0]).toMatchObject({
      id: i1.id,
      projectedCompletionProbability: null,
      currentTeam: [],
    });
    expect(completionProbability(100, 3).toString()).toBe('1/3');
    expect(completionProbability(1200, 10).toString()).toBe('1');
    expect(completionProbability(0, 3).toString()).toBe('0');
  });

  it('Four Agents on a difficulty 10 Lead; Trained and exhausted Agents', () => {
    let state = winLead(winLead(newCampaign({ money: 100_000 }), MEMBER), SAFEHOUSE);
    const ids = agentIds(state);
    state = act(state, 'startInvestigation', { lead: HQ, agents: ids });
    const i3 = investigations(state).at(-1)!.id;
    const progress = () => state.world.current.investigations[i3]!.state.progress;
    state = advance(state);
    expect(progress()).toBe(0);
    state = advance(state, completes(i3, false));
    expect(progress()).toBe(400);
    state = advance(state, completes(i3, false));
    expect(progress()).toBe(800);
    state = advance(state);
    expect(state.world.current.investigations[i3]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 1200,
    });
    expect(sites(state).at(-1)!.archetype).toBe('raid_hq');

    // An exhausted member adds its effective skill, 40, and a trained one its skill of 130.
    let tired = winLead(newCampaign({ money: 100_000 }), MEMBER);
    const [a5, a6] = agentIds(tired) as [string, string];
    tired = tweak(tired, (world) => {
      world.agents[a5]!.state.exhaustion = 65;
      world.agents[a5]!.state.assignment = { kind: 'Contracting' };
    });
    tired = arrive(act(tired, 'startInvestigation', { lead: SAFEHOUSE, agents: [a5, a6] }));
    const i2 = investigations(tired).at(-1)!.id;
    const seen: number[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      tired = advance(tired, completes(i2, false));
      seen.push(tired.world.current.investigations[i2]!.state.progress);
    }
    expect(seen).toEqual([140, 280, 420, 560]);
    expect(agent(tired, a5).state.exhaustion).toBe(65);
    tired = advance(tired);
    expect(tired.world.current.investigations[i2]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 700,
    });
  });

  it('A member leaves and another joins', () => {
    let state = winLead(newCampaign({ money: 100_000 }), MEMBER);
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    state = act(state, 'startInvestigation', { lead: SAFEHOUSE, agents: [a1, a2] });
    const i4 = investigations(state).at(-1)!.id;
    const investigation = () => state.world.current.investigations[i4]!.state;
    const view = () => currentStateView(state, gdrs).investigations.find((item) => item.id === i4)!;
    state = advance(state);
    state = advance(state, completes(i4, false));
    expect(investigation().progress).toBe(200);
    state = act(state, 'assignAgents', { agents: [a2], assignment: 'Contracting' });
    expect(investigation()).toMatchObject({ progress: 200, currentTeam: [a1], lifecycle: 'Active' });
    expect(agent(state, a2).state.participationHistory.at(-1)).toEqual({ kind: 'Investigation', id: i4 });
    expect(view().projectedCompletionProbability).toEqual({ n: '1', d: '2' });
    state = advance(state, completes(i4, false));
    expect(investigation().progress).toBe(300);
    state = act(state, 'assignAgentsToInvestigation', { investigation: i4, agents: [a3] });
    expect(view().currentTeam).toEqual([
      { agent: a1, agentStatus: 'AtAssignment' },
      { agent: a3, agentStatus: 'InTransit' },
    ]);
    expect(view().projectedCompletionProbability).toEqual({ n: '2', d: '3' });
    state = advance(state, completes(i4, true));
    expect(investigation()).toEqual({ lifecycle: 'Completed', progress: 400, currentTeam: [] });
    expect(sites(state).at(-1)!.archetype).toBe('raid_safehouse');
    for (const id of [a1, a3]) {
      expect(agent(state, id).state).toMatchObject({
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
      expect(agent(state, id).state.participationHistory.at(-1)).toEqual({ kind: 'Investigation', id: i4 });
    }
  });

  it('Abandoned and started again; Agents taken from another Investigation', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l1', difficulty: 2 });
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l2', difficulty: 4 });
    });
    const run = (state: CampaignState, name: string, args: Record<string, unknown>) =>
      act(state, name, args, 'player', catalog);
    let state = newCampaign({ catalog });
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(run(state, 'startInvestigation', { lead: 'l1', agents: [a1, a2] }));
    const i6 = investigations(state)[0]!.id;
    state = tweak(state, (world) => (world.investigations[i6]!.state.progress = 199));
    expectRejected(
      state,
      'startInvestigation',
      { lead: 'l1', agents: [a1, a2] },
      'lead_has_active_investigation',
      'player',
      catalog,
    );

    state = run(state, 'startInvestigation', { lead: 'l2', agents: [a1] });
    const i7 = investigations(state)[1]!.id;
    expect(state.world.current.investigations[i6]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a2],
      progress: 199,
    });
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Investigation', id: i6 }]);
    expectRejected(
      state,
      'startInvestigation',
      { lead: 'l2', agents: [a2] },
      'lead_has_active_investigation',
      'player',
      catalog,
    );
    state = run(state, 'assignAgentsToInvestigation', { investigation: i7, agents: [a2] });
    expect(state.world.current.investigations[i6]!.state).toEqual({
      lifecycle: 'Abandoned',
      progress: 199,
      currentTeam: [],
    });
    expect(state.world.current.investigations[i7]!.state).toMatchObject({
      currentTeam: [a1, a2],
      progress: 0,
    });
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i7, agents: [a1] },
      'agents_cannot_be_ordered',
      'player',
      catalog,
    );
    expectRejected(
      arrive(state),
      'assignAgentsToInvestigation',
      { investigation: i7, agents: [a1] },
      'already_in_current_team',
      'player',
      catalog,
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i6, agents: [agentIds(state)[2]] },
      'investigation_not_active',
      'player',
      catalog,
    );
    // The Lead of the Abandoned Investigation can be investigated again, from progress 0.
    state = run(state, 'startInvestigation', { lead: 'l1', agents: [agentIds(state)[2]] });
    expect(investigations(state)[2]!.state.progress).toBe(0);
    expect(checkInvariants(state, catalog)).toEqual([]);
  });

  it('Two Investigations in one step', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l1', difficulty: 2 });
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l2', difficulty: 4 });
    });
    let state = newCampaign({ catalog });
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: 'l1', agents: [a1] }, 'player', catalog);
    state = act(state, 'startInvestigation', { lead: 'l2', agents: [a2] }, 'player', catalog);
    const [i8, i9] = investigations(state).map((item) => item.id) as [string, string];
    state = tweak(arrive(state), (world) => {
      world.investigations[i8]!.state.progress = 100;
      world.investigations[i9]!.state.progress = 100;
    });
    const injected = completes(i9, false);
    const forward = advance(state, injected, catalog);
    const reversed = advance(state, injected, catalog, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.world.current.investigations[i8]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 200,
    });
    expect(forward.world.current.investigations[i9]!.state).toMatchObject({
      lifecycle: 'Active',
      progress: 200,
    });
    expect(sites(forward)).toHaveLength(1);
  });

  it('An Investigation whose Faction is Eliminated', () => {
    let state = newCampaign({ money: 100_000 });
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] }));
    const i10 = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      const faction = Object.values(world.factions)[0]!;
      faction.state.eliminated = true;
      faction.state.eliminatedTurn = 1;
    });
    expect(state.world.current.investigations[i10]!.state.lifecycle).toBe('Active');
    expectRejected(state, 'startInvestigation', { lead: MEMBER, agents: [a2] }, 'lead_not_available');
    state = act(state, 'assignAgentsToInvestigation', { investigation: i10, agents: [a2] });
    const next = tweak(advance(state, completes(i10, true)), (world) => {
      world.ending = null;
    });
    const created = sites(next)[0]!;
    expect(created.state.lifecycle).toBe('Cancelled');
    expect(next.world.current.investigations[i10]!.state.lifecycle).toBe('Completed');
  });

  it('Rejections', () => {
    let state = withAgents(winLead(newCampaign({ money: 100_000 }), MEMBER), 6);
    const [a1, a2, a3, a4, a7] = agentIds(state) as [string, string, string, string, string];
    state = arrive(act(state, 'startInvestigation', { lead: HQ.replace(HQ, SAFEHOUSE), agents: [a7] }));
    const i11 = investigations(state).at(-1)!.id;
    const i12 = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      // Use another available Lead for the calls: free the safehouse Lead by moving i11 to a test position.
      world.investigations[i11]!.state.progress = 10;
    });
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      world.agents[a3]!.state.currentHealth = 5;
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'Recovering';
    });
    const site = addMissionSite(state, 'foil_recruitment_push');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a4] });
    const reject = (lead: string, list: string[], reason: string) =>
      expectRejected(state, 'startInvestigation', { lead, agents: list }, reason);
    reject('no_such_lead', [a1], 'unknown_lead');
    reject(SAFEHOUSE, [a1], 'lead_has_active_investigation');
    reject(HQ, [a1], 'lead_not_available');
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i12, agents: [a1] },
      'investigation_not_active',
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a7] },
      'already_in_current_team',
    );
    expectRejected(state, 'assignAgentsToInvestigation', { investigation: i11, agents: [] }, 'agents_empty');
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a1, a1] },
      'agents_duplicate',
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a1, a2] },
      'agents_cannot_be_ordered',
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a3] },
      'agents_cannot_be_ordered',
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a4] },
      'agents_cannot_be_ordered',
    );
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: 'nothing', agents: [a1] },
      'unknown_investigation',
    );
    const joined = act(state, 'assignAgentsToInvestigation', { investigation: i11, agents: [a1] });
    expect(joined.world.current.investigations[i11]!.state).toMatchObject({
      currentTeam: [a7, a1],
      progress: 10,
    });
  });

  it('GDR validation', () => {
    expectDefective((raw) =>
      raw.add('investigations/investigation_archetypes.yaml', {
        ...raw.get('standard_investigation'),
        id: 'second',
      }),
    );
    expectDefective((raw) => {
      raw.files.find((file) => file.path.endsWith('investigation_archetypes.yaml'))!.gdrs.length = 0;
    });
    expectDefective((raw) => (raw.get('standard_investigation')['name'] = ''));
    expectDefective((raw) => (raw.get('standard_investigation')['skill_scaling_exponent'] = 2));
  });
});
