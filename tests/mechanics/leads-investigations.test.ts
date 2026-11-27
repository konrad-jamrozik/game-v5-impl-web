/** Tests, from the former Acceptance examples, of LEAD (Leads and Progression) and INVSTG (Investigations). */
import { describe, expect, it } from 'vite-plus/test';
import { effectiveSkill } from '../../src/engine/mechanics/agents/agents.ts';
import {
  assessmentThreshold,
  progressAfterLoss,
  progressGain,
  requiredProgressRange,
} from '../../src/engine/mechanics/investigations/investigations.ts';
import { missionWonHolds } from '../../src/engine/mechanics/conditions/conditions.ts';
import { leadAvailability } from '../../src/engine/mechanics/leads/leads.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import { isServing, type CampaignState } from '../../src/engine/state/types.ts';
import { isRejection } from '../../src/engine/result.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  estimateTeamProgressGain,
  turnReportView,
} from '../../src/engine/views/views.ts';
import type { GdrCatalog } from '../../src/gdr/index.ts';
import {
  act,
  BOOTSTRAP_GDRS as bootstrap,
  finishingInvestigation,
  addMissionSite,
  advance,
  agent,
  agentIds,
  arriveAgent,
  catalogWith,
  effect,
  expectDefective,
  expectRejected,
  gdrs,
  losing,
  missionAt,
  newCampaign,
  onlyFaction,
  setAssignment,
  tryAct,
  tweak,
  winning,
  withAgents,
  units,
  setCurrentHealth,
  valuesOf,
  useExampleCatalog,
} from '../helpers/game.ts';

// The examples' Retunable values, e.g. the team efficiency exponent, the assessment threshold, and the exhaustion
// penalty to effective skill, are Fixture values of the legacy test Game build (TESTVAL, Expected values).
useExampleCatalog({ legacy: true });

const leads = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  Object.fromEntries(currentRetiredWorldStateView(state, catalog).leads.map((lead) => [lead.id, lead]));
/**
 * The numbers of the conditions of LEAD, Lead availability, that do not hold, for each discovered Lead. They are not
 * Player-visible, so they are read from the engine's own rule, not from Player API.
 */
const blocking = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  Object.fromEntries(
    catalog.leads
      .filter((lead) => state.world.current.discoveredLeads.includes(lead.id))
      .map((lead) => {
        const a = leadAvailability(lead, state.world.current, catalog.missionSiteArchetypes);
        const conditions = [
          a.discovered,
          a.mayBeInvestigatedAgain,
          a.noUnfinishedMissionSite,
          a.missionSiteCanExist,
        ];
        return [lead.id, conditions.flatMap((holds, index) => (holds ? [] : [index + 1]))];
      }),
  );
const statuses = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  Object.fromEntries(
    currentRetiredWorldStateView(state, catalog).leads.map((lead) => [lead.id, lead.status]),
  );
/** LEAD, Turn report: the Leads discovered in the most recent Advance turn, and the same list in its History entry. */
const discovered = (state: CampaignState) => {
  const listed = turnReportView(state)?.discoveredLeads;
  expect(state.world.history.historyEntries.at(-1)?.report.discoveredLeads).toEqual(listed);
  return listed;
};
/** COND, Condition format: a Condition as the GDR build writes a nested map. */
const cond = (key: string, value: unknown) => ({ $entries: [[key, value]] });
const investigations = (state: CampaignState) => Object.values(state.world.current.investigations);
const sites = (state: CampaignState) => Object.values(state.world.current.missionSites);
/** Sets an Investigation's progress just short of its Actual required progress, so that any gain completes it. */
const finishing = (state: CampaignState, id: string) =>
  tweak(state, (world) => {
    const investigation = world.investigations[id]!;
    investigation.state.progress = investigation.constants.actualRequiredProgress * 100 - 1;
  });
/**
 * `startInvestigation` with its Required progress outcome fixed through a random outcome override, the way
 * Developer API fixes it; the override must be consumed by the action.
 */
function start(
  state: CampaignState,
  lead: string,
  agentList: readonly (string | undefined)[],
  required: number,
  catalog: GdrCatalog = gdrs,
): CampaignState {
  const fixed = tweak(state, (world) => {
    world.randomOverrides.push({ outcome: `investigation.requiredProgress.${lead}`, value: required });
  });
  const next = act(fixed, 'startInvestigation', { lead, agents: agentList }, 'player', catalog);
  expect(next.world.current.randomOverrides).toEqual(state.world.current.randomOverrides);
  expect(investigations(next).at(-1)!.constants.actualRequiredProgress).toBe(required);
  return next;
}
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
  next = advance(finishing(arrive(next), investigation));
  const site = sites(next).at(-1)!.id;
  next = act(arrive(next), 'deployAgents', { missionSite: site, agents: ids });
  next = advance(next, winning(next, site));
  expect(next.world.current.missions[missionAt(next, site)]!.state.lifecycle).toBe('Won');
  // The examples read fresh Agents, so the base skill and Experience the Mission gave under AGENT, Mission growth, are
  // set back with health and exhaustion.
  return tweak(arrive(next), (world) => {
    for (const item of Object.values(world.agents)) {
      if (isServing(item.state)) {
        item.state.skillHundredths = 10000;
        item.state.experience = 0;
        setCurrentHealth(item.state, item.state.baseHealth * 100);
        item.state.exactExhaustionHundredths = 0;
        item.state.assignment = { kind: 'Standby' };
      }
    }
  });
}

describe('LEAD: examples', () => {
  it('Campaign creation', () => {
    const state = newCampaign();
    // LEAD, Lead discovery: the set of discovered Leads is stored; member, without `discovered_when`, is in it from
    // campaign creation.
    expect(state.world.current.discoveredLeads).toEqual([MEMBER]);
    // Only member is discovered: the query returns nothing about safehouse or hq, not even that they exist.
    expect(blocking(state)).toEqual({ [MEMBER]: [] });
    const view = leads(state);
    expect(view[MEMBER]).toMatchObject({
      available: true,
      canBeInvestigatedNow: true,
      investigateAgain: 'until_mission_won',
      completionCount: 0,
      status: 'Available',
    });
    // LEAD, Player-visible information: neither `discovered_when` nor the conditions of Lead availability.
    expect(Object.keys(view[MEMBER]!)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/discovered|condition|blocking|requires/i)]),
    );
    expect(JSON.stringify(currentLiveWorldStateView(state, gdrs))).not.toMatch(
      /safehouse|locate_red_dawn_hq/,
    );
    expect(turnReportView(state)).toBeNull();
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
    state = advance(finishing(state, i1));
    const s1 = sites(state)[0]!;
    expect(s1).toMatchObject({ archetype: 'apprehend_member', state: { lifecycle: 'Active' } });
    expect(s1.constants.targetFaction).toBe(onlyFaction(state).id);
    expect(blocking(state)).toEqual({ [MEMBER]: [3] });
    expect(statuses(state)).toEqual({ [MEMBER]: 'Inactive' });
    expect(discovered(state)).toEqual([]);

    state = act(arrive(state), 'deployAgents', { missionSite: s1.id, agents: ids });
    expect(blocking(state)[MEMBER]).toEqual([3]);
    state = advance(state, winning(state, s1.id));
    const m1 = missionAt(state, s1.id);
    expect(state.world.current.missions[m1]!.state.lifecycle).toBe('Won');
    expect(blocking(state)).toEqual({ [MEMBER]: [2], [SAFEHOUSE]: [] });
    expect(statuses(state)).toEqual({ [MEMBER]: 'Archived', [SAFEHOUSE]: 'Available' });
    expect(leads(state)[MEMBER]).toMatchObject({ available: false, completionCount: 1 });
    expect(discovered(state)).toEqual([SAFEHOUSE]);
    expect(state.world.current.discoveredLeads).toEqual([MEMBER, SAFEHOUSE]);
    // Player-visible information: exactly member and safehouse, with the Player-visible properties of safehouse and
    // without its `discovered_when`; nothing of hq.
    expect(leads(state)[SAFEHOUSE]).toEqual({
      id: SAFEHOUSE,
      name: expect.any(String),
      description: expect.any(String),
      factionArchetype: 'red_dawn',
      faction: onlyFaction(state).id,
      assessed: false,
      requiredProgress: 'unknown',
      requiredProgressRange: 'unknown',
      investigateAgain: 'until_mission_won',
      createsMissionSite: 'raid_safehouse',
      eliminatesFaction: false,
      unlocksContracting: false,
      winsCampaign: false,
      completionCount: 0,
      initiativeOperationLevel: 2,
      available: true,
      status: 'Available',
      canBeInvestigatedNow: true,
      activeInvestigation: null,
    });
    expect(JSON.stringify(currentLiveWorldStateView(state, gdrs))).not.toContain(HQ);
    // member is a Completed Lead, whose Completed Investigation revealed its Required progress.
    expect(leads(state)[MEMBER]).toMatchObject({
      assessed: true,
      requiredProgress: 3,
      requiredProgressRange: { min: 3, max: 5 },
    });
    expectRejected(
      arrive(state),
      'startInvestigation',
      { lead: MEMBER, agents: [ids[0]] },
      'lead_not_available',
    );
    // LEAD, Player-visible information: the rejection says only that the Lead is not available, never why.
    const rejection = tryAct(arrive(state), 'startInvestigation', { lead: MEMBER, agents: [ids[0]] });
    expect(JSON.stringify(rejection)).not.toMatch(/condition|won|eliminat/i);
  });

  it('A Lost Mission and an Expired Mission site, then a Won Mission', () => {
    let state = winLead(newCampaign({ money: 100_000 }), MEMBER);
    const ids = agentIds(state);
    // Lost: nothing is recorded and the Lead is available again.
    state = act(state, 'startInvestigation', { lead: SAFEHOUSE, agents: [ids[0]] });
    state = advance(finishing(arrive(state), investigations(state).at(-1)!.id));
    const s2 = sites(state).at(-1)!.id;
    expect(blocking(state)[SAFEHOUSE]).toEqual([3]);
    expect(statuses(state)[SAFEHOUSE]).toBe('Inactive');
    state = act(arrive(state), 'deployAgents', { missionSite: s2, agents: [ids[1]] });
    state = advance(state, losing(state, s2));
    expect(state.world.current.missions[missionAt(state, s2)]!.state.lifecycle).toBe('Lost');
    expect(blocking(state)).toEqual({ [MEMBER]: [2], [SAFEHOUSE]: [] });
    expect(statuses(state)[SAFEHOUSE]).toBe('Available');
    expect(discovered(state)).toEqual([]);

    // Expired: the new Mission site does not count down in the Advance turn that creates it.
    state = tweak(arrive(state), (world) => {
      for (const item of Object.values(world.agents)) {
        if (isServing(item.state)) {
          setCurrentHealth(item.state, item.state.baseHealth * 100);
          item.state.assignment = { kind: 'Standby' };
        }
      }
    });
    const serving = agentIds(state).filter((id) => isServing(agent(state, id).state));
    state = act(state, 'startInvestigation', { lead: SAFEHOUSE, agents: [serving[0]] });
    state = advance(finishing(arrive(state), investigations(state).at(-1)!.id));
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
    expect(statuses(state)).toEqual({ [MEMBER]: 'Archived', [SAFEHOUSE]: 'Archived', [HQ]: 'Available' });
    expect(discovered(state)).toEqual([HQ]);
  });

  it('The last Lead and the elimination of Red Dawn', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    for (let i = 0; i < 4; i += 1) {
      state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    }
    state = winLead(winLead(winLead(state, MEMBER), SAFEHOUSE), HQ);
    expect(onlyFaction(state).state.eliminated).toBe(true);
    expect(blocking(state)).toEqual({ [MEMBER]: [2, 4], [SAFEHOUSE]: [2, 4], [HQ]: [2, 4] });
    expect(statuses(state)).toEqual({ [MEMBER]: 'Archived', [SAFEHOUSE]: 'Archived', [HQ]: 'Archived' });
    // A discovered Lead stays discovered when its Faction is Eliminated.
    expect(state.world.current.discoveredLeads).toEqual([MEMBER, SAFEHOUSE, HQ]);
    // ENDING, Victory: every Faction being Eliminated does not by itself win the Campaign.
    expect(state.world.current.ending).toBeNull();
  });

  it('An Abandoned Investigation', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] });
    const i1 = investigations(state)[0]!.id;
    expect(blocking(state)[MEMBER]).toEqual([]);
    state = act(arrive(state), 'assignAgents', { agents: [a1], assignment: 'Standby' });
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
        required_progress: 1,
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
    state = advance(finishing(state, i7), winning(state, hq.site), catalog);
    const s7 = sites(state).at(-1)!;
    expect(s7).toMatchObject({ archetype: 'apprehend_member', state: { lifecycle: 'Cancelled' } });
    expect(blocking(state, catalog)['test_lead']).toEqual([4]);
    expect(statuses(state, catalog)['test_lead']).toBe('Archived');
    expect(state.world.current.missions[missionAt(state, hq.site)]!.state.lifecycle).toBe('Won');
    expect(currentLiveWorldStateView(state, catalog).missionSites).toHaveLength(0);
  });

  it('Faction Eliminated in the Advance turn that discovers a Lead', () => {
    const catalog = catalogWith((raw) => {
      raw.add('missions/mission_site_archetypes.yaml', { ...raw.get('raid_safehouse'), id: 'test_site' });
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_lead',
        discovered_when: { $entries: [['mission_won', 'raid_hq']] },
        on_completion: [effect('create_mission_site', 'test_site')],
      });
    });
    let state = withAgents(newCampaign({ money: 100_000, catalog }), 12);
    state = tweak(state, (world) => {
      world.agency.state.acquisitions['transport_cap'] = 4;
    });
    const hq = addMissionSite(state, 'raid_hq', { catalog });
    state = act(
      hq.state,
      'deployAgents',
      { missionSite: hq.site, agents: agentIds(hq.state).slice(0, 8) },
      'player',
      catalog,
    );
    state = advance(state, winning(state, hq.site), catalog);
    expect(onlyFaction(state).state.eliminated).toBe(true);
    // The win discovers test_lead and eliminates its Faction in the same Advance turn: it is discovered, Archived.
    expect(discovered(state)).toEqual(['test_lead']);
    expect(blocking(state, catalog)).toEqual({ [MEMBER]: [4], test_lead: [4] });
    expect(statuses(state, catalog)).toEqual({ [MEMBER]: 'Archived', test_lead: 'Archived' });
    // safehouse and hq stay undiscovered: no Mission against Red Dawn can be Won any more.
    expect(JSON.stringify(currentLiveWorldStateView(state, catalog))).not.toMatch(
      /locate_red_dawn_(safehouse|hq)/,
    );
  });

  it('Two Leads requiring the same MissionSiteArchetype', () => {
    const catalog = catalogWith((raw) => {
      for (const id of ['test_lead_a', 'test_lead_b']) {
        raw.add('leads-and-progression/leads.yaml', { ...raw.get(SAFEHOUSE), id, required_progress: 1 });
      }
    });
    let state = newCampaign({ catalog });
    expect(blocking(state, catalog)).toEqual({ [MEMBER]: [] });
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
    expect([...(discovered(state) ?? [])].sort()).toEqual([SAFEHOUSE, 'test_lead_a', 'test_lead_b'].sort());
    const [, , a3, a4] = agentIds(state) as [string, string, string, string];
    state = act(state, 'startInvestigation', { lead: 'test_lead_a', agents: [a3] }, 'player', catalog);
    expect(blocking(state, catalog)['test_lead_b']).toEqual([]);
    state = act(state, 'startInvestigation', { lead: 'test_lead_b', agents: [a4] }, 'player', catalog);
    expect(checkInvariants(state, catalog)).toEqual([]);
  });

  it('mission_won Condition: a Won Response Mission counts; a Mission site of another Faction does not', () => {
    const catalog = catalogWith((raw) =>
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_lead',
        discovered_when: cond('mission_won', 'foil_sabotage'),
      }),
    );
    let state = withAgents(newCampaign({ catalog }), 4);
    expect(leads(state, catalog)['test_lead']).toBeUndefined();
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
    expect(discovered(state)).toEqual(['test_lead']);
    // MISSION, Mission won Condition kind: the same Won Mission at a Mission site that targets another Faction does not
    // make it hold. LEAD, Lead discovery: the Lead stays discovered all the same, because discovery is stored.
    const faction = onlyFaction(state).id;
    expect(missionWonHolds('foil_sabotage', faction, state.world.current)).toBe(true);
    const elsewhere = tweak(state, (world) => {
      (world.missionSites[site.site]!.constants as { targetFaction: string }).targetFaction =
        'no_such_faction';
    });
    expect(missionWonHolds('foil_sabotage', faction, elsewhere.world.current)).toBe(false);
    expect(leads(elsewhere, catalog)['test_lead']).toBeDefined();
  });

  it('Turn report: a Lead discovered by a Won Mission is credited to it, and one under not is not', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_credited',
        discovered_when: cond('any', [cond('mission_won', 'foil_sabotage'), cond('lead_completed', MEMBER)]),
      });
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_not_credited',
        discovered_when: cond('not', cond('mission_won', 'raid_hq')),
      });
    });
    let state = withAgents(newCampaign({ catalog }), 4);
    const site = addMissionSite(state, 'foil_sabotage', { catalog });
    state = act(
      site.state,
      'deployAgents',
      { missionSite: site.site, agents: agentIds(site.state).slice(0, 4) },
      'player',
      catalog,
    );
    state = advance(state, winning(state, site.site), catalog);
    const report = state.world.history.turnReport!;
    expect(report.discoveredLeads).toContain('test_credited');
    // LEAD, Turn report: credited through `mission_won` inside `any`; a Lead discovered through `not` is credited to
    // no Mission.
    expect(report.missions.map((mission) => mission.discoveredLeads)).toEqual([['test_credited']]);
  });

  it('lead_completed with all, any, and not: discovery from the World state an Advance turn produces', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_lead',
        discovered_when: cond('all', [
          cond('lead_completed', MEMBER),
          cond('not', cond('mission_won', 'raid_hq')),
          cond('any', [cond('lead_completed', MEMBER), cond('mission_won', 'raid_hq')]),
        ]),
      });
      // COND, Condition format: an empty `any` does not hold, so this Lead is never discovered.
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(SAFEHOUSE),
        id: 'test_never',
        discovered_when: cond('any', []),
      });
    });
    let state = newCampaign({ catalog });
    const [a1] = agentIds(state) as [string];
    expect(state.world.current.discoveredLeads).toEqual([MEMBER]);
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] }, 'player', catalog);
    const i1 = investigations(state)[0]!.id;
    state = advance(finishing(arrive(state), i1), {}, catalog);
    expect(state.world.current.investigations[i1]!.state.lifecycle).toBe('Completed');
    // The Investigation completed in step 4; the Lead is discovered from the World state the Advance turn produces.
    expect(discovered(state)).toEqual(['test_lead']);
    expect(state.world.current.discoveredLeads).toEqual([MEMBER, 'test_lead']);
    expect(leads(state, catalog)['test_never']).toBeUndefined();
    // LEAD, Turn report: credited to the completed Investigation through a `lead_completed` outside any `not`; the
    // History entry holds no credits.
    expect(state.world.history.turnReport!.investigationsCompleted).toEqual([
      expect.objectContaining({ investigation: i1, discoveredLeads: ['test_lead'] }),
    ]);
    expect(state.world.history.historyEntries.at(-1)!.report.investigationsCompleted[0]).not.toHaveProperty(
      'discoveredLeads',
    );
  });

  it('investigate_again: never Archives a Lead at its completion; always keeps it after a win', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(MEMBER),
        id: 'test_once',
        investigate_again: 'never',
      });
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(MEMBER),
        id: 'test_always',
        investigate_again: 'always',
      });
    });
    let state = withAgents(newCampaign({ money: 100_000, catalog }), 8, catalog);
    const ids = agentIds(state);
    expect(leads(state, catalog)['test_once']).toMatchObject({
      investigateAgain: 'never',
      status: 'Available',
    });
    state = act(state, 'startInvestigation', { lead: 'test_once', agents: [ids[0]] }, 'player', catalog);
    state = act(state, 'startInvestigation', { lead: 'test_always', agents: [ids[1]] }, 'player', catalog);
    const [once, always] = investigations(state).map((item) => item.id) as [string, string];
    state = advance(finishing(finishing(arrive(state), once), always), {}, catalog);
    const onceSite = sites(state)[0]!;
    const alwaysSite = sites(state)[1]!;
    // One attempt: Archived at once, while the Mission site it created is still Active.
    expect(onceSite.state.lifecycle).toBe('Active');
    expect(blocking(state, catalog)['test_once']).toEqual([2, 3]);
    expect(statuses(state, catalog)).toMatchObject({ test_once: 'Archived', test_always: 'Inactive' });
    state = act(
      arrive(state),
      'deployAgents',
      { missionSite: alwaysSite.id, agents: ids.slice(2, 4) },
      'player',
      catalog,
    );
    state = advance(state, winning(state, alwaysSite.id), catalog);
    expect(state.world.current.missions[missionAt(state, alwaysSite.id)]!.state.lifecycle).toBe('Won');
    expect(blocking(state, catalog)['test_always']).toEqual([]);
    expect(leads(state, catalog)['test_always']).toMatchObject({ status: 'Available', completionCount: 1 });
  });

  it('can_exist_when: a Mission site that cannot exist is Cancelled, and its Lead is Inactive', () => {
    const catalog = catalogWith((raw) => {
      raw.add('missions/mission_site_archetypes.yaml', {
        ...raw.get('apprehend_member'),
        id: 'test_site',
        can_exist_when: cond('not', cond('lead_completed', MEMBER)),
      });
      raw.add('leads-and-progression/leads.yaml', {
        ...raw.get(MEMBER),
        id: 'test_lead',
        on_completion: [effect('create_mission_site', 'test_site')],
      });
    });
    let state = withAgents(newCampaign({ catalog }), 4, catalog);
    const [a1, a2] = agentIds(state) as [string, string];
    expect(blocking(state, catalog)['test_lead']).toEqual([]);
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] }, 'player', catalog);
    state = act(state, 'startInvestigation', { lead: 'test_lead', agents: [a2] }, 'player', catalog);
    const [i1, i2] = investigations(state).map((item) => item.id) as [string, string];
    state = advance(finishing(finishing(arrive(state), i1), i2), {}, catalog);
    // Both complete in step 4; member's completion means test_site cannot exist, so it is Cancelled in step 5.
    const created = sites(state).find((site) => site.archetype === 'test_site')!;
    expect(created.state.lifecycle).toBe('Cancelled');
    expect(turnReportView(state)!.cancelledMissionSites).toEqual([created.id]);
    expect(state.world.current.investigations[i2]!.state.lifecycle).toBe('Completed');
    // Condition 4 does not hold, which never ends in practice, yet the Lead is only Inactive, and why is not shown.
    expect(blocking(state, catalog)['test_lead']).toEqual([4]);
    expect(statuses(state, catalog)['test_lead']).toBe('Inactive');
  });

  it('GDR validation', () => {
    expectDefective((raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('mission_won', 'no_such_site')));
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('lead_completed', 'no_such_lead')),
    );
    expectDefective((raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('mission_won_from_lead', MEMBER)));
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('mission_lost', 'apprehend_member')),
    );
    expectDefective((raw) => (raw.get(SAFEHOUSE)['discovered_when'] = { $entries: [] }));
    expectDefective(
      (raw) =>
        (raw.get(SAFEHOUSE)['discovered_when'] = {
          $entries: [
            ['mission_won', 'apprehend_member'],
            ['lead_completed', MEMBER],
          ],
        }),
    );
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('all', cond('lead_completed', MEMBER))),
    );
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('not', [cond('lead_completed', MEMBER)])),
    );
    expectDefective((raw) => (raw.get(SAFEHOUSE)['discovered_when'] = [cond('lead_completed', MEMBER)]));
    expectDefective((raw) => (raw.get(SAFEHOUSE)['investigate_again'] = 'twice'));
    expectDefective((raw) => (raw.get(SAFEHOUSE)['requires'] = []));
    // A Condition that can never hold is valid, e.g. one that requires the Lead itself to be a Completed Lead.
    expect(
      catalogWith(
        (raw) => (raw.get(SAFEHOUSE)['discovered_when'] = cond('lead_completed', SAFEHOUSE)),
      ).leads.find((lead) => lead.id === SAFEHOUSE)?.discoveredWhen,
    ).toEqual({ kind: 'lead_completed', lead: SAFEHOUSE });
    // MISSION, MissionSiteArchetype: Existence Condition only for Initiative, and valid.
    expectDefective((raw) => (raw.get('foil_sabotage')['can_exist_when'] = cond('lead_completed', MEMBER)));
    expectDefective((raw) => (raw.get('raid_hq')['can_exist_when'] = cond('mission_won', 'no_such_site')));
    expectDefective((raw) => (raw.get('raid_hq')['can_exist_when'] = cond('panic_below', 50)));
    expect(
      catalogWith(
        (raw) => (raw.get('raid_hq')['can_exist_when'] = cond('mission_won', 'foil_sabotage')),
      ).missionSiteArchetypes.find((site) => site.id === 'raid_hq')?.canExistWhen,
    ).toEqual({ kind: 'mission_won', missionSiteArchetype: 'foil_sabotage' });
    expectDefective((raw) => (raw.get(MEMBER)['faction'] = 'apprehend_member'));
    expectDefective((raw) => (raw.get(MEMBER)['required_progress'] = 0));
    expectDefective((raw) => (raw.get(MEMBER)['required_progress'] = { $decimal: '2.5' }));
    expectDefective((raw) => (raw.get(MEMBER)['difficulty'] = 3));
    // LEAD, Lead, and MISSION, Mission site Effect kind: the Completion effect is valid: exactly one Effect, of the
    // Effect kind `create_mission_site`, naming a MissionSiteArchetype of kind initiative, in a valid Effect list
    // (EFFECT, Effect list format).
    expectDefective((raw) => (raw.get(MEMBER)['on_completion'][0].$entries[0][1] = 'foil_sabotage'));
    expectDefective((raw) => raw.get(MEMBER)['on_completion'].push(effect('money', 1)));
    expectDefective((raw) => raw.get(MEMBER)['on_completion'].push(effect('create_mission_site', 'raid_hq')));
    expectDefective((raw) => (raw.get(MEMBER)['on_completion'][0].$entries[0][0] = 'create_mission'));
    expectDefective((raw) => raw.get(MEMBER)['on_completion'][0].$entries.push(['money', 1]));
    // LEAD, Lead: an empty or omitted `on_completion` is valid, and such a Lead has `never` by default.
    const empty = catalogWith((raw) => (raw.get(MEMBER)['on_completion'] = []));
    expect(empty.leads.find((lead) => lead.id === MEMBER)).toMatchObject({
      investigateAgain: 'never',
      onCompletion: {
        createMissionSite: null,
        eliminateFaction: false,
        unlockContracting: false,
        winCampaign: false,
      },
    });
    expect(catalogWith((raw) => delete raw.get(MEMBER)['on_completion']).leads[0]!.onCompletion).toEqual({
      createMissionSite: null,
      eliminateFaction: false,
      unlockContracting: false,
      winCampaign: false,
    });
    // LEAD, Lead, and EFFECT, Effect list format: one Effect of each of `create_mission_site`, `eliminate_faction`,
    // and `win_campaign`; a Lead that creates a Mission site or eliminates a Faction has `faction`.
    expect(
      catalogWith((raw) => {
        const completion = raw.get(MEMBER)['on_completion'];
        completion.push(effect('eliminate_faction', true), effect('win_campaign', true));
      }).leads[0]!.onCompletion,
    ).toEqual({
      createMissionSite: 'apprehend_member',
      eliminateFaction: true,
      unlockContracting: false,
      winCampaign: true,
    });
    expectDefective((raw) => raw.get(MEMBER)['on_completion'].push(effect('eliminate_faction', false)));
    expectDefective((raw) => delete raw.get(MEMBER)['faction']);
    expectDefective((raw) => {
      delete raw.get(MEMBER)['faction'];
      raw.get(MEMBER)['on_completion'] = [effect('eliminate_faction', true)];
    });
    // LEAD, Lead: a Lead without `faction`, and with no Effect that needs one, is valid.
    expect(
      catalogWith((raw) => {
        delete raw.get(MEMBER)['faction'];
        raw.get(MEMBER)['on_completion'] = [effect('win_campaign', true)];
      }).leads[0]!.faction,
    ).toBeNull();
    // LEAD, Lead: the `discovered_when` of a Lead without `faction` uses no `mission_won` Condition.
    expectDefective((raw) => {
      delete raw.get(SAFEHOUSE)['faction'];
      raw.get(SAFEHOUSE)['on_completion'] = [];
    });
    // LEAD, Lead: `until_mission_won` only for a Lead that creates a Mission site.
    expectDefective((raw) => {
      raw.get(MEMBER)['on_completion'] = [];
      raw.get(MEMBER)['investigate_again'] = 'until_mission_won';
    });
    expect(
      catalogWith((raw) => {
        raw.get(MEMBER)['on_completion'] = [];
        raw.get(MEMBER)['investigate_again'] = 'always';
      }).leads[0]!.investigateAgain,
    ).toBe('always');
    expectDefective(
      (raw) => (raw.get(MEMBER)['on_completion'] = { $entries: [['create_mission_site', 'raid_hq']] }),
    );
    expect(
      catalogWith(() => undefined).leads.find((lead) => lead.id === MEMBER)?.onCompletion.createMissionSite,
    ).toBe('apprehend_member');
    expectDefective(
      (raw) => (raw.get(SAFEHOUSE)['requires'] = [{ $entries: [['mission_lost', 'apprehend_member']] }]),
    );
    expectDefective((raw) => (raw.get(MEMBER)['repeatable'] = true));
  });
});

describe('LEAD: Leads that concern no Faction or create no Mission site, with the Bootstrap values', () => {
  const view = (state: CampaignState) => leads(state, bootstrap);
  const arrivedAgent = (state: CampaignState) => agentIds(state)[0]!;

  it('a Lead without a Faction that creates no Mission site is completed once, and its completion discovers', () => {
    let state = newCampaign({ catalog: bootstrap, firstLead: false });
    expect(state.world.current.discoveredLeads).toEqual([
      'contracting_opportunities',
      'criminal_organizations',
    ]);
    expect(view(state)['criminal_organizations']).toMatchObject({
      factionArchetype: null,
      faction: null,
      createsMissionSite: null,
      eliminatesFaction: false,
      winsCampaign: false,
      investigateAgain: 'never',
      status: 'Available',
    });
    const started = finishingInvestigation(state, 'criminal_organizations', arrivedAgent(state), bootstrap);
    state = advance(started.state, {}, bootstrap);
    const report = turnReportView(state)!;
    expect(report.investigations[0]).toMatchObject({ completed: true, createdMissionSite: null });
    expect(report.createdMissionSites).toEqual([]);
    expect(Object.keys(state.world.current.missionSites)).toHaveLength(0);
    // Completed with `never`: Archived at once; the Lead it named is discovered in the same World state.
    expect(view(state)['criminal_organizations']).toMatchObject({ status: 'Archived', completionCount: 1 });
    expect(report.discoveredLeads).toEqual(['locate_red_dawn_member']);
    const availability = leadAvailability(
      bootstrap.leads.find((lead) => lead.id === 'criminal_organizations')!,
      state.world.current,
      bootstrap.missionSiteArchetypes,
    );
    expect(availability).toMatchObject({
      mayBeInvestigatedAgain: false,
      noUnfinishedMissionSite: true,
      missionSiteCanExist: true,
      factionNotEliminated: true,
    });
  });

  it('a Lead of a Faction that creates no Mission site, e.g. a profile, and a Terminate Lead that archives its Faction', () => {
    let state = tweak(newCampaign({ catalog: bootstrap }), (world) => {
      world.discoveredLeads.push('red_dawn_profile', 'terminate_red_dawn');
    });
    const profile = finishingInvestigation(state, 'red_dawn_profile', arrivedAgent(state), bootstrap);
    state = advance(profile.state, {}, bootstrap);
    expect(view(state)['red_dawn_profile']).toMatchObject({ status: 'Archived', createsMissionSite: null });
    expect(turnReportView(state)!.discoveredLeads).toContain('locate_red_dawn_safehouse');
    // `always`: a locate Lead of tiers 1 to 7 stays Available after its completion and a Won Mission.
    expect(view(state)['locate_red_dawn_member']).toMatchObject({
      investigateAgain: 'always',
      status: 'Available',
    });
    const [, second] = agentIds(state) as [string, string];
    state = tweak(state, (world) => {
      world.agents[second]!.state.status = 'AtAssignment';
    });
    const terminate = finishingInvestigation(state, 'terminate_red_dawn', second, bootstrap);
    state = advance(terminate.state, {}, bootstrap);
    expect(onlyFaction(state).state.eliminated).toBe(true);
    // Condition 5: every Lead of an Eliminated Faction is Archived; a Lead without a Faction is not.
    const statusesNow = Object.fromEntries(Object.values(view(state)).map((lead) => [lead.id, lead.status]));
    expect(
      Object.entries(statusesNow)
        .filter(([id]) => bootstrap.leads.find((lead) => lead.id === id)!.faction === 'red_dawn')
        .every(([, status]) => status === 'Archived'),
    ).toBe(true);
    expect(statusesNow['peace_on_earth']).toBe('Available');
    expect(view(state)['terminate_red_dawn']).toMatchObject({ eliminatesFaction: true });
  });
});

describe('INVSTG: examples', () => {
  const view = (state: CampaignState, id: string, catalog: GdrCatalog = gdrs) =>
    currentLiveWorldStateView(state, catalog).investigations.find((item) => item.id === id)!;
  const progressOf = (state: CampaignState, id: string) =>
    state.world.current.investigations[id]!.state.progress;
  const parameters = gdrs.investigationParameters;

  it('Example values: Required progress ranges, assessment thresholds, and team efficiency', () => {
    // INVSTG, Required progress range and outcome: the greatest value is rounded up, e.g. 3 to 5 for 3.
    expect([3, 6, 10, 30].map((r) => requiredProgressRange(r, parameters))).toEqual([
      { min: 3, max: 5 },
      { min: 6, max: 9 },
      { min: 10, max: 15 },
      { min: 30, max: 45 },
    ]);
    expect([3, 6, 10, 30].map((r) => assessmentThreshold(r, parameters))).toEqual([75, 150, 250, 750]);
    // Working members of effective skill 100 each.
    expect([1, 2, 3, 4, 5, 10].map((n) => progressGain(n, 100 * n, parameters))).toEqual([
      100, 174, 240, 303, 362, 630,
    ]);
    // 449^5 × 5 ≤ 620^5 < 450^5 × 5.
    expect(progressGain(5, 620, parameters)).toBe(449);
    expect(progressGain(0, 0, parameters)).toBe(0);
    expect(progressGain(3, 0, parameters)).toBe(0);
    expect(progressAfterLoss(707, 161, 100)).toBe(439);
    expect(progressAfterLoss(361, 61, 0)).toBe(0);
    expect(progressAfterLoss(200, 0, 0)).toBe(200);
  });

  it('One Agent on the member Lead', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1, a2] = agentIds(state) as [string, string];
    state = start(state, MEMBER, [a1], 4);
    const i1 = investigations(state)[0]!;
    expect(i1).toMatchObject({
      archetype: 'standard_investigation',
      constants: { lead: MEMBER, turnStarted: 1, actualRequiredProgress: 4 },
      state: { lifecycle: 'Active', progress: 0, assessed: false, currentTeam: [a1] },
    });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Investigation', investigation: i1.id },
      status: 'InTransit',
    });
    // The Actual required progress is hidden; the Lead's Required progress is unknown before Assessment.
    expect(view(state, i1.id)).toMatchObject({ projectedProgressGain: 0, actualRequiredProgress: 'unknown' });
    expect(leads(state)[MEMBER]).toMatchObject({
      assessed: false,
      requiredProgress: 'unknown',
      requiredProgressRange: 'unknown',
    });
    expect(JSON.stringify(currentLiveWorldStateView(state, gdrs).investigations)).not.toMatch(
      /"actualRequiredProgress":4/,
    );
    const rows: [number, boolean, string, string][] = [];
    const completedLists: unknown[] = [];
    const record = () => {
      const lead = leads(state)[MEMBER]!;
      completedLists.push(turnReportView(state)!.investigationsCompleted);
      rows.push([
        progressOf(state, i1.id),
        state.world.current.investigations[i1.id]!.state.assessed,
        String(lead.requiredProgress),
        state.world.current.investigations[i1.id]!.state.lifecycle,
      ]);
    };
    state = advance(state);
    record();
    expect(view(state, i1.id).projectedProgressGain).toBe(100);
    for (let turn = 2; turn <= 5; turn += 1) {
      state = advance(state);
      record();
    }
    expect(rows).toEqual([
      [0, false, 'unknown', 'Active'],
      [100, true, '3', 'Active'],
      [200, true, '3', 'Active'],
      [300, true, '3', 'Active'],
      [400, true, '3', 'Completed'],
    ]);
    // INVSTG, Turn report: only the Advance turn ending Turn 5 lists i1, with the gain 100 of its last Progress gain;
    // its History entry keeps the same list.
    expect(completedLists).toEqual([
      [],
      [],
      [],
      [],
      [{ investigation: i1.id, gain: 100, discoveredLeads: [] }],
    ]);
    expect(state.world.history.historyEntries.at(-1)!.report.investigationsCompleted).toEqual([
      { investigation: i1.id, gain: 100 },
    ]);
    expect(turnReportView(state)!.createdMissionSites).toEqual([sites(state)[0]!.id]);
    expect(state.world.current.investigations[i1.id]!.state).toEqual({
      lifecycle: 'Completed',
      progress: 400,
      assessed: true,
      currentTeam: [],
    });
    expect(sites(state)[0]!.archetype).toBe('apprehend_member');
    expect(leads(state)[MEMBER]!.requiredProgressRange).toEqual({ min: 3, max: 5 });
    // a1 gained 1 exhaustion in each of the four Advance turns in which it worked, including the completing one.
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
      exhaustion: 4,
      participationHistory: [{ kind: 'Investigation', id: i1.id }],
    });
    expect(effectiveSkill(valuesOf(agent(state, a1).state), gdrs.agentParameters)).toBe(100);
    expect(currentRetiredWorldStateView(state, gdrs).investigations[0]).toMatchObject({
      id: i1.id,
      projectedProgressGain: null,
      actualRequiredProgress: 'unknown',
      currentTeam: [],
    });
    // The Mission site Expires; a later Investigation of the same Lead starts with Assessed no and its own Actual
    // required progress, but the range 3 to 4 is shown from the moment it is created.
    state = tweak(state, (world) => {
      const site = world.missionSites[sites(state)[0]!.id]!;
      site.state.lifecycle = 'Expired';
      site.state.turnsUntilExpiration = 0;
    });
    state = start(arrive(state), MEMBER, [a2], 3);
    const i2 = investigations(state).at(-1)!;
    expect(i2.state.assessed).toBe(false);
    expect(leads(state)[MEMBER]).toMatchObject({ assessed: true, requiredProgressRange: { min: 3, max: 5 } });
  });

  it('Five trained Agents on a Required progress of 30', () => {
    const catalog = catalogWith((raw) =>
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l4', required_progress: 30 }),
    );
    let state = withAgents(newCampaign({ catalog }), 5, catalog);
    const team = agentIds(state).slice(0, 5);
    state = arrive(start(state, 'l4', team, 37, catalog));
    const i3 = investigations(state).at(-1)!.id;
    state = tweak(state, (world) => {
      [140, 130, 120, 120, 110].forEach((skill, index) => {
        world.agents[team[index]!]!.state.skillHundredths = skill * 100;
      });
    });
    expect(view(state, i3, catalog).projectedProgressGain).toBe(449);
    const rows: [number, boolean, string, string][] = [];
    for (let turn = 1; turn <= 9; turn += 1) {
      state = advance(state, {}, catalog);
      const range = leads(state, catalog)['l4']!.requiredProgressRange;
      rows.push([
        progressOf(state, i3),
        state.world.current.investigations[i3]!.state.assessed,
        range === 'unknown' ? 'unknown' : `${range.min} to ${range.max}`,
        state.world.current.investigations[i3]!.state.lifecycle,
      ]);
    }
    expect(rows).toEqual([
      [449, false, 'unknown', 'Active'],
      [898, true, '30 to 45', 'Active'],
      [1347, true, '30 to 45', 'Active'],
      [1796, true, '30 to 45', 'Active'],
      [2245, true, '30 to 45', 'Active'],
      [2694, true, '30 to 45', 'Active'],
      [3143, true, '30 to 45', 'Active'],
      [3592, true, '30 to 45', 'Active'],
      [4041, true, '30 to 45', 'Completed'],
    ]);
  });

  it('Trained and exhausted Agents', () => {
    const run = (required: number) => {
      let state = winLead(newCampaign({ money: 100_000 }), MEMBER);
      const [a5, a6] = agentIds(state) as [string, string];
      state = arrive(start(state, SAFEHOUSE, [a5, a6], required));
      state = tweak(state, (world) => (world.agents[a5]!.state.exactExhaustionHundredths = 6500));
      return { state, a5, a6, i2: investigations(state).at(-1)!.id };
    };
    let { state, a5, a6, i2 } = run(8);
    const seen: [number, number, boolean][] = [];
    for (let turn = 0; turn < 5; turn += 1) {
      state = advance(state);
      seen.push([
        progressOf(state, i2),
        agent(state, a5).state.exactExhaustionHundredths / 100,
        state.world.current.investigations[i2]!.state.assessed,
      ]);
    }
    // a5's effective skill 65, 64, 63, 62, 61 is read before its exhaustion rises; the gains are 143, 142, 141, 141,
    // and 140. In the fifth, 707 < 800, then a5's Forced return costs round down(707 × 100 / 161) = 439.
    expect(seen).toEqual([
      [143, 66, false],
      [285, 67, true],
      [426, 68, true],
      [567, 69, true],
      [439, 70, true],
    ]);
    expect(units(agent(state, a5).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    const report = state.world.history.turnReport!;
    expect(report.forcedReturns).toEqual([{ agent: a5, from: 'Investigation' }]);
    expect(report.investigations.find((item) => item.investigation === i2)).toMatchObject({
      progressGain: 140,
      becameAssessed: false,
      completed: false,
      progressLost: 268,
      progressAfter: 439,
      abandoned: false,
    });
    expect(state.world.current.investigations[i2]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a6],
    });
    const after: number[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      state = advance(state);
      after.push(progressOf(state, i2));
    }
    expect(after).toEqual([539, 639, 739, 839]);
    expect(state.world.current.investigations[i2]!.state.lifecycle).toBe('Completed');

    // Had the Actual required progress been 7, i2 would have completed in the fifth Advance turn at 707, before
    // a5's exhaustion rose, and a5 would have gone to Standby with the others and no Forced return.
    ({ state, a5, a6, i2 } = run(7));
    for (let turn = 0; turn < 5; turn += 1) {
      state = advance(state);
    }
    expect(state.world.current.investigations[i2]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 707,
    });
    expect([units(agent(state, a5).state), units(agent(state, a6).state)]).toMatchObject([
      { exhaustion: 70, assignment: { kind: 'Standby' }, status: 'InTransit' },
      { exhaustion: 5, assignment: { kind: 'Standby' }, status: 'InTransit' },
    ]);
    expect(state.world.history.turnReport?.forcedReturns).toEqual([]);

    // One Agent with base skill 130 alone on member with Actual required progress 3 completes in the third.
    let alone = newCampaign();
    const [a1] = agentIds(alone) as [string];
    alone = arrive(start(alone, MEMBER, [a1], 3));
    alone = tweak(alone, (world) => (world.agents[a1]!.state.skillHundredths = 13000));
    const i = investigations(alone)[0]!.id;
    const gains: number[] = [];
    for (let turn = 0; turn < 3; turn += 1) {
      alone = advance(alone);
      gains.push(progressOf(alone, i));
    }
    expect(gains).toEqual([130, 260, 390]);
    expect(alone.world.current.investigations[i]!.state.lifecycle).toBe('Completed');
  });

  it('A Forced return abandons an Investigation', () => {
    let state = winLead(winLead(newCampaign({ money: 100_000 }), MEMBER), SAFEHOUSE);
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(start(state, HQ, [a1], 12));
    const i13 = investigations(state).at(-1)!.id;
    state = tweak(state, (world) => {
      world.investigations[i13]!.state.progress = 300;
      world.investigations[i13]!.state.assessed = true;
      world.agents[a1]!.state.exactExhaustionHundredths = 6900;
    });
    // Had a2 joined in the Turn before, it would be In transit to i13 and keep it Active, but with progress 0.
    const joined = act(state, 'assignAgentsToInvestigation', { investigation: i13, agents: [a2] });
    const kept = advance(joined);
    expect(kept.world.current.investigations[i13]!.state).toEqual({
      lifecycle: 'Active',
      progress: 0,
      assessed: true,
      currentTeam: [a2],
    });

    state = advance(state);
    expect(state.world.current.investigations[i13]!.state).toEqual({
      lifecycle: 'Abandoned',
      progress: 0,
      assessed: true,
      currentTeam: [],
    });
    expect(units(agent(state, a1).state)).toMatchObject({
      exhaustion: 70,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, a1).state.participationHistory.at(-1)).toEqual({ kind: 'Investigation', id: i13 });
    const report = state.world.history.turnReport!;
    expect(report.forcedReturns).toEqual([{ agent: a1, from: 'Investigation' }]);
    expect(report.investigations.find((item) => item.investigation === i13)).toMatchObject({
      progressGain: 61,
      completed: false,
      progressLost: 361,
      progressAfter: 0,
      abandoned: true,
    });
  });

  it('Starting and joining require Agents that are Fit for work', () => {
    let state = newCampaign();
    const [a1, a2, a5] = agentIds(state) as [string, string, string];
    state = tweak(state, (world) => (world.agents[a5]!.state.exactExhaustionHundredths = 3100));
    expectRejected(state, 'startInvestigation', { lead: MEMBER, agents: [a5] }, 'agents_not_fit_for_work');
    expectRejected(
      state,
      'startInvestigation',
      { lead: MEMBER, agents: [a1, a5] },
      'agents_not_fit_for_work',
    );
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [a1] });
    const i11 = investigations(state).at(-1)!.id;
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a5] },
      'agents_not_fit_for_work',
    );
    state = tweak(state, (world) => (world.agents[a2]!.state.exactExhaustionHundredths = 3000));
    act(state, 'assignAgentsToInvestigation', { investigation: i11, agents: [a2] });
  });

  it('A member leaves and another joins', () => {
    let state = winLead(newCampaign({ money: 100_000 }), MEMBER);
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    state = start(state, SAFEHOUSE, [a1, a2], 6);
    const i4 = investigations(state).at(-1)!.id;
    const investigation = () => state.world.current.investigations[i4]!.state;
    state = advance(state);
    expect(investigation().progress).toBe(0);
    state = advance(state);
    expect(investigation()).toMatchObject({ progress: 174, assessed: true });
    state = act(state, 'assignAgents', { agents: [a2], assignment: 'Standby' });
    expect(units(agent(state, a2).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    // a2 takes half of the effective skill At assignment with it: round down(174 × 100 / 200) = 87.
    expect(investigation()).toMatchObject({
      progress: 87,
      assessed: true,
      currentTeam: [a1],
      lifecycle: 'Active',
    });
    expect(agent(state, a2).state.participationHistory.at(-1)).toEqual({ kind: 'Investigation', id: i4 });
    expect(view(state, i4).projectedProgressGain).toBe(100);
    state = advance(state);
    expect(investigation().progress).toBe(187);
    state = act(state, 'assignAgentsToInvestigation', { investigation: i4, agents: [a3] });
    // Joining costs nothing, and an Agent In transit counts in neither n nor S.
    expect(investigation().progress).toBe(187);
    expect(view(state, i4).currentTeam).toEqual([
      { agent: a1, agentStatus: 'AtAssignment' },
      { agent: a3, agentStatus: 'InTransit' },
    ]);
    expect(view(state, i4).projectedProgressGain).toBe(100);
    state = advance(state);
    expect(investigation().progress).toBe(287);
    expect(view(state, i4).projectedProgressGain).toBe(174);
    state = advance(state);
    expect(investigation().progress).toBe(461);
    state = advance(state);
    expect(investigation()).toEqual({
      lifecycle: 'Completed',
      progress: 635,
      assessed: true,
      currentTeam: [],
    });
    expect(sites(state).at(-1)!.archetype).toBe('raid_safehouse');
    for (const id of [a1, a3]) {
      expect(units(agent(state, id).state)).toMatchObject({
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
      expect(agent(state, id).state.participationHistory.at(-1)).toEqual({ kind: 'Investigation', id: i4 });
    }
  });

  it('Abandoned and started again', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(start(state, MEMBER, [a1], 4));
    const i1 = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      world.investigations[i1]!.state.progress = 200;
      world.investigations[i1]!.state.assessed = true;
    });
    expectRejected(
      state,
      'startInvestigation',
      { lead: MEMBER, agents: [a2] },
      'lead_has_active_investigation',
    );
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(state.world.current.investigations[i1]!.state).toEqual({
      lifecycle: 'Abandoned',
      progress: 0,
      assessed: true,
      currentTeam: [],
    });
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i1, agents: [a2] },
      'investigation_not_active',
    );
    state = start(state, MEMBER, [a2], 3);
    const i5 = investigations(state).at(-1)!;
    expect(i5.id).not.toBe(i1);
    expect(i5).toMatchObject({ constants: { turnStarted: 1 }, state: { progress: 0, assessed: false } });
    expect(leads(state)[MEMBER]).toMatchObject({ assessed: true, requiredProgressRange: { min: 3, max: 5 } });
  });

  it('Moving a member to another Investigation', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l1', required_progress: 2 });
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l2', required_progress: 4 });
    });
    const run = (state: CampaignState, name: string, args: Record<string, unknown>) =>
      act(state, name, args, 'player', catalog);
    let state = newCampaign({ catalog });
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(start(state, 'l1', [a1, a2], 2, catalog));
    const i6 = investigations(state)[0]!.id;
    state = tweak(state, (world) => (world.investigations[i6]!.state.progress = 150));

    // a1 is on i6, an Away Assignment, which it can leave only for Standby.
    expectRejected(
      state,
      'startInvestigation',
      { lead: 'l2', agents: [a1] },
      'agents_not_in_base',
      'player',
      catalog,
    );
    state = run(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, a1).state.participationHistory).toEqual([{ kind: 'Investigation', id: i6 }]);
    expect(state.world.current.investigations[i6]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a2],
      progress: 75,
    });
    // a1 is In transit and cannot be assigned.
    expectRejected(
      state,
      'startInvestigation',
      { lead: 'l2', agents: [a1] },
      'agents_cannot_be_ordered',
      'player',
      catalog,
    );

    // In the Advance turn ending Turn 30, a1 arrives on Standby; in Turn 31 it can start the new Investigation.
    state = advance(state, {}, catalog);
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
    state = start(state, 'l2', [a1], 5, catalog);
    const i7 = investigations(state)[1]!.id;
    expect(state.world.current.investigations[i7]!.state).toMatchObject({ currentTeam: [a1], progress: 0 });
    expect(units(agent(state, a1).state)).toMatchObject({
      assignment: { kind: 'Investigation', investigation: i7 },
      status: 'InTransit',
    });
    // Rejected both because l2 has an Active Investigation and because a2 is on i6; either error is reported.
    const second = tryAct(state, 'startInvestigation', { lead: 'l2', agents: [a2] }, 'player', catalog);
    expect(isRejection(second) ? second.reason : 'accepted').toMatch(
      /^(lead_has_active_investigation|agents_not_in_base)$/,
    );
    // Rejected both because a1 already belongs to i7's Current team and because it is In transit.
    const again = tryAct(
      state,
      'assignAgentsToInvestigation',
      { investigation: i7, agents: [a1] },
      'player',
      catalog,
    );
    expect(isRejection(again) ? again.reason : 'accepted').toMatch(
      /^(already_in_current_team|agents_cannot_be_ordered)$/,
    );
    expect(state.world.current.investigations[i6]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a2],
    });
    expect(checkInvariants(state, catalog)).toEqual([]);
  });

  it('Members of effective skill 0 cost no progress when every member At assignment has it', () => {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(start(state, MEMBER, [a1, a2], 4));
    const i = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      world.investigations[i]!.state.progress = 50;
      world.agents[a1]!.state.skillHundredths = 0;
      world.agents[a2]!.state.skillHundredths = 0;
    });
    expect(view(state, i).projectedProgressGain).toBe(0);
    state = act(state, 'assignAgents', { agents: [a1], assignment: 'Standby' });
    expect(progressOf(state, i)).toBe(50);
  });

  it('Two Investigations in one step', () => {
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l1', required_progress: 2 });
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l2', required_progress: 4 });
    });
    let state = newCampaign({ catalog });
    const [a1, a2] = agentIds(state) as [string, string];
    state = start(state, 'l1', [a1], 2, catalog);
    state = start(state, 'l2', [a2], 5, catalog);
    const [i8, i9] = investigations(state).map((item) => item.id) as [string, string];
    state = tweak(arrive(state), (world) => {
      world.investigations[i8]!.state.progress = 100;
      world.investigations[i9]!.state.progress = 100;
    });
    const forward = advance(state, {}, catalog);
    const reversed = advance(state, {}, catalog, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.world.current.investigations[i8]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 200,
      assessed: true,
    });
    expect(forward.world.current.investigations[i9]!.state).toMatchObject({
      lifecycle: 'Active',
      progress: 200,
      assessed: true,
    });
    expect(sites(forward)).toHaveLength(1);
  });

  it('Mission sites of several completions follow the Investigations’ Instance IDs', () => {
    // INVSTG, Completion and Turn report; MISSION, Mission site Effect kind: the Mission sites are
    // created, and the Turn report lists the Investigations, in the order of their Instance IDs, whatever their order
    // in Campaign state.
    const catalog = catalogWith((raw) => {
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l1', required_progress: 2 });
      raw.add('leads-and-progression/leads.yaml', { ...raw.get(MEMBER), id: 'l2', required_progress: 2 });
    });
    let state = newCampaign({ catalog });
    const [a1, a2] = agentIds(state) as [string, string];
    state = start(state, 'l1', [a1], 2, catalog);
    state = start(state, 'l2', [a2], 2, catalog);
    const [first, second] = investigations(state).map((item) => item.id) as [string, string];
    state = tweak(arrive(state), (world) => {
      world.investigations[first]!.state.progress = 100;
      world.investigations[second]!.state.progress = 100;
      world.investigations = Object.fromEntries(Object.entries(world.investigations).reverse());
    });
    const next = advance(state, {}, catalog);
    const origin = (id: string) => next.world.current.missionSites[id]?.constants.origin;
    expect(origin('mission-site-1')).toEqual({ kind: 'Investigation', investigation: first });
    expect(origin('mission-site-2')).toEqual({ kind: 'Investigation', investigation: second });
    expect(turnReportView(next)?.investigations.map((item) => [item.investigation, item.completed])).toEqual([
      [first, true],
      [second, true],
    ]);
  });

  it('Lead no longer available: an Active Investigation is interrupted at the end of Mission resolution', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    state = tweak(state, (world) => {
      world.agency.state.acquisitions['transport_cap'] = 4;
    });
    const ids = agentIds(state);
    const hq = addMissionSite(state, 'raid_hq');
    state = act(hq.state, 'deployAgents', { missionSite: hq.site, agents: ids.slice(0, 8) });
    state = act(state, 'startInvestigation', { lead: MEMBER, agents: [ids[8], ids[9]] });
    const i1 = investigations(state).at(-1)!.id;
    // ids[9] is still In transit toward the Investigation when it is interrupted.
    state = tweak(state, (world) => {
      arriveAgent(world.agents[ids[8]!]!.state);
    });
    state = tweak(advance(state, winning(state, hq.site)), (world) => {
      world.ending = null;
    });
    expect(onlyFaction(state).state.eliminated).toBe(true);
    // It made its progress in step 4 first, and loses it.
    expect(
      turnReportView(state)!.investigations.find((item) => item.investigation === i1)!.progressGain,
    ).toBe(100);
    expect(state.world.current.investigations[i1]!.state).toMatchObject({
      lifecycle: 'Abandoned',
      currentTeam: [],
      progress: 0,
    });
    for (const member of [ids[8]!, ids[9]!]) {
      expect(agent(state, member).state).toMatchObject({
        assignment: { kind: 'Standby' },
        status: 'InTransit',
      });
      expect(agent(state, member).state.participationHistory.at(-1)).toMatchObject({ id: i1 });
    }
    // TURN, Transit across the steps, Destination ends during transit: ids[9]'s transit was redirected, so it does
    // not arrive in the Previous turn transit arrivals step of this Advance turn.
    expect(state.world.history.turnReport!.transit.arrived).not.toContain(ids[9]);
    // It creates no Mission site, and the Turn report and History entry list it with its Lead.
    expect(sites(state).filter((site) => site.archetype === 'apprehend_member')).toHaveLength(0);
    expect(turnReportView(state)!.investigationsInterrupted).toEqual([{ investigation: i1, lead: MEMBER }]);
    expect(state.world.history.historyEntries.at(-1)!.report.investigationsInterrupted).toEqual([
      { investigation: i1, lead: MEMBER },
    ]);
    expect(statuses(state)[MEMBER]).toBe('Archived');
    // An Advance turn that interrupts none lists none.
    const next = advance(state);
    expect(turnReportView(next)!.investigationsInterrupted).toEqual([]);
    expect(agent(next, ids[9]!).state).toMatchObject({
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
  });

  it('An Investigation whose Faction is Eliminated completes when it completes in the same Advance turn', () => {
    let state = newCampaign({ money: 100_000 });
    const [a1, a2] = agentIds(state) as [string, string];
    state = arrive(start(state, MEMBER, [a1], 4));
    const i10 = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      world.investigations[i10]!.state.progress = 300;
      world.investigations[i10]!.state.assessed = true;
      const faction = Object.values(world.factions)[0]!;
      faction.state.eliminated = true;
      faction.state.eliminatedTurn = 1;
    });
    expect(state.world.current.investigations[i10]!.state.lifecycle).toBe('Active');
    expect(view(state, i10).projectedProgressGain).toBe(100);
    expectRejected(state, 'startInvestigation', { lead: MEMBER, agents: [a2] }, 'lead_not_available');
    state = act(state, 'assignAgentsToInvestigation', { investigation: i10, agents: [a2] });
    const next = tweak(advance(state), (world) => {
      world.ending = null;
    });
    const created = sites(next)[0]!;
    expect(created.state.lifecycle).toBe('Cancelled');
    expect(next.world.current.investigations[i10]!.state).toMatchObject({
      lifecycle: 'Completed',
      progress: 400,
    });
  });

  it('Rejections', () => {
    let state = withAgents(winLead(newCampaign({ money: 100_000 }), MEMBER), 6);
    const [a1, a2, a3, a4, a7] = agentIds(state) as [string, string, string, string, string];
    state = arrive(start(state, SAFEHOUSE, [a7], 6));
    const i11 = investigations(state).at(-1)!.id;
    const i12 = investigations(state)[0]!.id;
    state = tweak(state, (world) => {
      world.investigations[i11]!.state.progress = 100;
    });
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[a3]!.state, 500);
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'Recovering';
    });
    const site = addMissionSite(state, 'foil_recruitment_push');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a4] });
    const reject = (lead: string, list: string[], reason: string) =>
      expectRejected(state, 'startInvestigation', { lead, agents: list }, reason);
    reject('no_such_lead', [a1], 'unknown_lead');
    reject(SAFEHOUSE, [a1], 'lead_has_active_investigation');
    reject(MEMBER, [a1], 'lead_not_available');
    // hq is not discovered: it is rejected with the same error as an unknown Lead, revealing nothing of it.
    reject(HQ, [a1], 'unknown_lead');
    const unknown = tryAct(state, 'startInvestigation', { lead: 'no_such_lead', agents: [a1] });
    expect(tryAct(state, 'startInvestigation', { lead: HQ, agents: [a1] })).toEqual(unknown);
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
    // AGENT, Transit rule, No orders in transit: a2 must arrive first.
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a2] },
      'agents_cannot_be_ordered',
    );
    // a1 is on Contracting, an Away Assignment, which it can leave only for Standby.
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a1] },
      'agents_not_in_base',
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
    // a6, on Training At assignment, joins without changing i11's progress.
    const a6 = agentIds(state)[5]!;
    const training = setAssignment(state, [a6], 'Training');
    const joined = act(training, 'assignAgentsToInvestigation', { investigation: i11, agents: [a6] });
    expect(joined.world.current.investigations[i11]!.state).toMatchObject({
      currentTeam: [a7, a6],
      progress: 100,
    });
    expect(joined.world.current.agents[a6]!.state).toMatchObject({
      assignment: { kind: 'Investigation', investigation: i11 },
      status: 'InTransit',
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
    expectDefective((raw) => {
      raw.files.find((file) => file.path.endsWith('investigation_parameters.yaml'))!.gdrs.length = 0;
    });
    const set = (key: string, value: unknown) => (raw: Parameters<Parameters<typeof catalogWith>[0]>[0]) => {
      raw.get('investigation_parameters')[key] = value;
    };
    expectDefective(set('team_efficiency_exponent', 0));
    expectDefective(set('team_efficiency_exponent', { $decimal: '1.2' }));
    expectDefective(set('team_efficiency_exponent', { $decimal: '0.875' }));
    expectDefective(set('required_progress_max_pct', 90));
    expectDefective(set('assessment_threshold_pct', 0));
    expectDefective(set('assessment_threshold_pct', 101));
    expectDefective(set('unknown_property', 1));
    // An exponent of 1 is valid and removes the diminishing returns.
    const linear = catalogWith(set('team_efficiency_exponent', 1)).investigationParameters;
    expect(progressGain(5, 500, linear)).toBe(500);
  });
});

describe('INVSTG: Team progress estimate', () => {
  let state = withAgents(newCampaign(), 4);
  const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
  state = tweak(state, (world) => {
    for (const id of [a1, a2, a3]) {
      world.agents[id]!.state.skillHundredths = 10000;
      world.agents[id]!.state.exactExhaustionHundredths = 0;
    }
  });

  it('is the Progress gain of the listed Agents as working members, before they arrive', () => {
    // INVSTG example: two Agents of effective skill 100 on Standby give 174.
    expect(estimateTeamProgressGain(state, gdrs, [a1, a2])).toBe(174);
    const started = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a1, a2] });
    // The Investigation they start has a projected progress gain of 0 until they arrive.
    expect(currentLiveWorldStateView(started, gdrs).investigations[0]?.projectedProgressGain).toBe(0);
    expect(estimateTeamProgressGain(started, gdrs, [a1, a2])).toBe(174);
    // A Current team together with Agents to add.
    expect(estimateTeamProgressGain(started, gdrs, [a1, a2, a3])).toBe(
      progressGain(3, 300, gdrs.investigationParameters),
    );
  });

  it('counts each distinct Agent once and gives 0 for no Agent', () => {
    expect(estimateTeamProgressGain(state, gdrs, [a1, a1])).toBe(100);
    expect(estimateTeamProgressGain(state, gdrs, [])).toBe(0);
  });

  it('rejects an Instance ID that is not of a Serving Agent, and changes nothing', () => {
    const dismissed = act(state, 'dismissAgents', { agents: [a4] });
    const result = estimateTeamProgressGain(dismissed, gdrs, [a1, a4]);
    expect(isRejection(result) ? result.reason : result).toBe('agents_not_serving');
    const unknown = estimateTeamProgressGain(state, gdrs, ['nobody']);
    expect(isRejection(unknown) ? unknown.reason : unknown).toBe('agents_not_serving');
  });
});
