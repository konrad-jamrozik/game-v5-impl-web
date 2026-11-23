/**
 * Former Acceptance examples and edge cases that the per-specification conformance reviews found untested or only partly
 * tested. Each test names the Spec ID and the section it checks.
 */
import { describe, expect, it } from 'vite-plus/test';
import { damageBounds, fightCombat } from '../../src/engine/mechanics/combat/combat.ts';
import { eliminateFaction } from '../../src/engine/mechanics/factions/factions.ts';
import { injectedRandom } from '../../src/engine/random.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentLiveWorldStateView, currentRetiredWorldStateView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  agents,
  allHit,
  allMiss,
  catalogWith,
  combatAgent,
  combatEnemyWith,
  expectDefective,
  expectRejected,
  funding,
  gdrs,
  missionAt,
  newCampaign,
  onlyFaction,
  setAssignment,
  tweak,
  winning,
  withAgents,
  units,
  setCurrentHealth,
  effectiveValuesOf,
  useExampleCatalog,
} from '../helpers/game.ts';

// The values of the examples, e.g. `upkeep_per_agent` 10, are Fixture values; see EXAMPLE_VALUES.
useExampleCatalog({ legacy: true });

const invalid = (state: CampaignState, change: Parameters<typeof tweak>[1]) =>
  expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);

describe('AGENT: gaps', () => {
  it('Adding Agents: no upper limit applies, and it succeeds above the Agent cap', () => {
    const roster = agents(newCampaign()).length;
    const state = act(newCampaign(), 'addAgents', { count: 10_001 }, 'developer');
    expect(agents(state)).toHaveLength(roster + 10_001);
    expect(currentLiveWorldStateView(state, gdrs).agency.agentCap).toBe(gdrs.economy.baseAgentCap);
  });

  it('Transit: Investigation started and completed (destination ends)', () => {
    let state = newCampaign({ money: 5000 });
    const [a1, a3] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a1] });
    const i2 = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[a1]!.state.status = 'AtAssignment';
      world.investigations[i2]!.state.progress = 200;
      (world.investigations[i2]!.constants as { actualRequiredProgress: number }).actualRequiredProgress = 3;
    });
    state = act(state, 'assignAgentsToInvestigation', { investigation: i2, agents: [a3] });
    state = advance(state);
    // a3 is still In transit, adds no progress, and leaves with the other member when the Investigation completes.
    expect(state.world.history.turnReport!.investigations[0]).toMatchObject({
      progressGain: 100,
      completed: true,
    });
    // TURN, Transit across the steps, Departure: the redirect starts a new transit, which does not arrive in the
    // Previous turn transit arrivals step of this Advance turn.
    expect(state.world.history.turnReport!.transit.arrived).toEqual([]);
    for (const id of [a1, a3]) {
      expect(units(agent(state, id).state)).toMatchObject({
        assignment: { kind: 'Standby' },
        status: 'InTransit',
        participationHistory: [{ kind: 'Investigation', id: i2 }],
      });
    }
    state = advance(state);
    expect(agent(state, a3).state.status).toBe('AtAssignment');
    expect(state.world.history.turnReport!.transit.arrived).toEqual([a1, a3]);
  });

  it('Agent status and Assignment structure: a Deployed Agent In transit is invalid', () => {
    const site = addMissionSite(newCampaign(), 'apprehend_member');
    const [a2] = agentIds(site.state) as [string];
    const state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a2] });
    invalid(state, (world) => (world.agents[a2]!.state.status = 'InTransit'));
    invalid(state, (world) => {
      world.agents[a2]!.state.status = 'Killed';
      setCurrentHealth(world.agents[a2]!.state, 0);
    });
  });
});

describe('DOM: former Acceptance examples B and D', () => {
  function fixture(): {
    state: CampaignState;
    a1: string;
    a2: string;
    i1: string;
    s1: string;
    m1: string;
    e1: string;
  } {
    let state = newCampaign();
    const [a1, a2] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a1] });
    const i1 = Object.keys(state.world.current.investigations)[0]!;
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a2] });
    const e1 = state.world.current.missionSites[site.site]!.state.enemies[0]!;
    return { state, a1, a2, i1, s1: site.site, m1: missionAt(state, site.site), e1 };
  }

  it('B. Each invalid variant is rejected', () => {
    const { state, a1, s1, m1, e1 } = fixture();
    invalid(state, (world) => {
      world.enemies[a1] = { ...world.enemies[e1]!, id: a1 };
    });
    invalid(state, (world) => {
      world.missions[s1] = { ...world.missions[m1]!, id: s1 };
    });
    invalid(state, (world) => world.missions[m1]!.state.currentTeam.push(a1));
    invalid(state, (world) => (world.missions[m1]!.state.lifecycle = 'Won'));
    invalid(state, (world) => {
      const site = world.missionSites[s1]!;
      world.missionSites[s1] = { ...site, constants: { ...site.constants, kind: 'Response' } };
    });
    invalid(state, (world) => {
      world.missions['mission-second'] = { ...world.missions[m1]!, id: 'mission-second' };
    });
    invalid(state, (world) => {
      const mission = world.missions[m1]!;
      world.missions[m1] = { ...mission, constants: { ...mission.constants, missionSite: 'nowhere' } };
    });
    invalid(state, (world) => {
      const enemy = world.enemies[e1]!;
      world.enemies[e1] = { ...enemy, constants: { missionSite: 'elsewhere' } };
    });
  });

  it('D. Initial Campaign state', () => {
    const state = newCampaign();
    const world = state.world.current;
    expect(Object.keys(world.factions)).toHaveLength(gdrs.factionArchetypes.length);
    expect(
      [world.missionSites, world.missions, world.enemies, world.investigations].map(
        (x) => Object.keys(x).length,
      ),
    ).toEqual([0, 0, 0, 0]);
    invalid(state, (w) => {
      const faction = onlyFaction(state);
      w.factions['faction-extra'] = { ...faction, id: 'faction-extra' };
    });
    invalid(state, (w) => {
      const faction = onlyFaction(state);
      w.factions[faction.id] = { ...faction, archetype: 'unknown_archetype' };
    });
  });
});

describe('COMBAT: gaps', () => {
  /** An Initiate of the examples of COMBAT, as Fixture values. */
  const initiate = (id: string) => combatEnemyWith(id, { skill: 40, health: 20, weaponDamage: 8, armor: 0 });
  const fight = (
    agentsSide: ReturnType<typeof combatAgent>[],
    enemies: ReturnType<typeof combatAgent>[],
    injected: Record<string, (number | boolean)[]>,
    catalog = gdrs,
  ) =>
    fightCombat(
      {
        agents: agentsSide,
        enemies,
        combat: catalog.combatParameters,
        agentParameters: catalog.agentParameters,
      },
      injectedRandom(injected),
    ).report;

  it('Edge cases: Damage of 0 removes no current health but still raises exhaustion', () => {
    const catalog = catalogWith((raw) => (raw.get('combat_parameters')['weapon_damage_range'] = 1));
    expect(damageBounds(10, catalog.combatParameters)).toEqual({ lo: 0, hi: 20 });
    const enemy = initiate('e1');
    const report = fight(
      [combatAgent('a1')],
      [enemy],
      {
        'combat.hit.a1': [true, ...new Array<boolean>(300).fill(false)],
        'combat.damage.a1': [0],
        'combat.hit.e1': new Array<boolean>(300).fill(false),
      },
      catalog,
    );
    expect(report.log[0]).toMatchObject({
      hit: true,
      damage: 0,
      healthRemovedHundredths: 0,
      defenderAfter: { currentHealthHundredths: 2000, exhaustion: 1 },
    });
  });

  it('Edge cases: Enemy already dead at Combat start is not able to fight and not Incapacitated', () => {
    const dead = initiate('e1');
    dead.state.currentHealthHundredths = 0;
    const report = fight([combatAgent('a1')], [dead], {});
    expect(report).toMatchObject({ outcome: 'Won', rounds: 0 });
    expect(report.participants[1]).toMatchObject({
      start: { incapacitated: false },
      final: { condition: 'dead' },
    });
  });

  it('Damage bounds: an injected damage outcome below the range is outside the range', () => {
    // a1's weapon damage is 10; one less than the lowest damage it allows.
    const { lo } = damageBounds(10, gdrs.combatParameters);
    expect(() =>
      fight([combatAgent('a1', { weaponDamage: 10 })], [initiate('e1')], {
        'combat.hit.a1': [true],
        'combat.damage.a1': [lo - 1],
      }),
    ).toThrow();
  });
});

describe('FACTION: gaps', () => {
  it('Elimination: applying the effect to a Eliminated Faction changes nothing', () => {
    const faction = { ...onlyFaction(newCampaign()).state };
    eliminateFaction(faction, 120);
    eliminateFaction(faction, 130);
    expect(faction).toMatchObject({ eliminated: true, eliminatedTurn: 120 });
  });
});

describe('ECON and MISSION: gaps', () => {
  it('Transport cap: reaching the cap exactly is accepted, and one more is rejected for the cap', () => {
    const cap = gdrs.economy.baseTransportCap;
    let state = withAgents(newCampaign(), cap + 2);
    const ids = agentIds(state);
    const s1 = addMissionSite(state, 'foil_recruitment_push');
    const s2 = addMissionSite(s1.state, 'apprehend_member');
    const s3 = addMissionSite(s2.state, 'apprehend_member', { lead: 'locate_red_dawn_safehouse' });
    state = act(s3.state, 'deployAgents', { missionSite: s1.site, agents: ids.slice(0, cap - 1) });
    state = act(state, 'deployAgents', { missionSite: s2.site, agents: [ids[cap - 1]] });
    expect(currentLiveWorldStateView(state, gdrs).agency).toMatchObject({
      deployedAgents: cap,
      transportCap: cap,
    });
    expectRejected(state, 'deployAgents', { missionSite: s3.site, agents: [ids[cap]] }, 'transport_cap');
  });

  it('Hiring at the Agent cap: Deployed Agents and Agents on Recovery count', () => {
    let state = withAgents(newCampaign({ money: 5000 }), gdrs.economy.baseAgentCap);
    const ids = agentIds(state);
    state = tweak(state, (world) => {
      setCurrentHealth(world.agents[ids[0]!]!.state, 1000);
      world.agents[ids[0]!]!.state.assignment = { kind: 'Recovery' };
      world.agents[ids[0]!]!.state.status = 'Recovering';
    });
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: ids.slice(1, 3) });
    expectRejected(state, 'hireAgents', { count: 1 }, 'agent_cap');
  });

  it('COMBAT, Combat inputs: a Combat reads the effective weapon damage and effective max health of an Agent', () => {
    // No Bootstrap Upgrade is a Max health Upgrade, so the `armor` Upgrade is made one here: an Upgrade's effect is
    // decided only by its `effect` (ECON, Upgrades).
    const catalog = catalogWith((raw) => (raw.get('armor')['effect'] = 'agent_max_health'));
    let state = newCampaign({ money: 5000, catalog });
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' }, 'player', catalog);
    state = act(state, 'purchaseUpgrade', { upgrade: 'armor' }, 'player', catalog);
    const [a1] = agentIds(state) as [string];
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a1] }, 'player', catalog);
    state = advance(state, winning(state, site.site), catalog);
    const participant = state.world.history.turnReport!.combatReports[0]!.participants.find(
      (item) => item.id === a1,
    )!;
    // The `weapon_damage` Upgrade adds its Increment to the base weapon damage, and the `armor` Upgrade, made a Max
    // health Upgrade here, its Increment to the base health.
    const incrementOf = (id: string) =>
      catalog.upgrades.find((item) => item.id === id)!.incrementHundredths / 100;
    const weaponDamage = agent(state, a1).state.baseWeaponDamage + incrementOf('weapon_damage');
    const maxHealth = agent(state, a1).state.baseHealth + incrementOf('armor');
    expect(participant.start).toMatchObject({
      weaponDamage,
      maxHealth,
      currentHealthHundredths: maxHealth * 100,
    });
    // The hardest hit of the effective weapon damage, above the highest that the base weapon damage allows.
    const hits = state.world.history.turnReport!.combatReports[0]!.log.filter((item) => item.attacker === a1);
    expect(hits[0]!.damage).toBe(damageBounds(weaponDamage, gdrs.combatParameters).hi);
    expect(hits[0]!.damage).toBeGreaterThan(
      damageBounds(agent(state, a1).state.baseWeaponDamage, gdrs.combatParameters).hi,
    );
  });

  it('Weapon damage Upgrade: a later purchase also raises Agents created after an earlier one', () => {
    let state = newCampaign({ money: 5000 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    state = act(state, 'hireAgents', { count: 1 });
    state = act(state, 'purchaseUpgrade', { upgrade: 'weapon_damage' });
    // Every Agent, the hired one too, has its base weapon damage plus two Increments.
    const base = gdrs.weapons.get(gdrs.agentArchetype.weapon)!.damage;
    const step = gdrs.upgrades.find((item) => item.id === 'weapon_damage')!.incrementHundredths / 100;
    expect(agentIds(state).map((id) => effectiveValuesOf(state, id).weaponDamage)).toEqual(
      agentIds(state).map(() => base + 2 * step),
    );
    expect(agents(state).map((a) => a.state.baseWeaponDamage)).toEqual(agentIds(state).map(() => base));
  });

  it('Structure of a Deployed Mission site: an Expired Mission site with Turns until expiration 1 is invalid', () => {
    const site = addMissionSite(newCampaign(), 'apprehend_member');
    invalid(site.state, (world) => (world.missionSites[site.site]!.state.lifecycle = 'Expired'));
  });

  it('Funding changes: one Won and one Lost Response Mission in one step are summed before the floor', () => {
    let state = withAgents(newCampaign({ money: 5000, funding: 0 }), 8);
    state = tweak(state, (world) => (world.agency.state.acquisitions['transport_cap'] = 2));
    const ids = agentIds(state);
    const won = addMissionSite(state, 'foil_sabotage');
    const lost = addMissionSite(won.state, 'foil_sabotage');
    state = act(lost.state, 'deployAgents', { missionSite: won.site, agents: ids.slice(0, 7) });
    state = act(state, 'deployAgents', { missionSite: lost.site, agents: ids.slice(7, 8) });
    const lostEnemies = state.world.current.missionSites[lost.site]!.state.enemies;
    state = advance(state, {
      ...winning(state, won.site),
      ...allMiss([ids[7]!]),
      ...allHit(lostEnemies, 15),
    });
    expect(state.world.history.turnReport!.missions.map((m) => m.result)).toEqual(['Won', 'Lost']);
    expect(funding(state)).toBe(4);
  });
});

describe('RECOVER: gaps', () => {
  it('Assignments and phases that do not recover: the team of a completed Investigation; a Deployed Agent', () => {
    let state = newCampaign({ money: 5000 });
    const [c4, deployed] = agentIds(state) as [string, string];
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [c4] });
    const investigation = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[c4]!.state.status = 'AtAssignment';
      world.agents[c4]!.state.exactExhaustionHundredths = 1400;
      world.agents[deployed]!.state.exactExhaustionHundredths = 1400;
      world.investigations[investigation]!.state.progress = 250;
      (
        world.investigations[investigation]!.constants as { actualRequiredProgress: number }
      ).actualRequiredProgress = 3;
    });
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [deployed] });
    const enemies = state.world.current.missionSites[site.site]!.state.enemies;
    state = advance(state, { ...allMiss([deployed, ...enemies]) });
    // The Investigation completed, after which c4's work added 1: In transit at the Agent recovery step.
    expect(units(agent(state, c4).state)).toMatchObject({
      exhaustion: 15,
      assignment: { kind: 'Standby' },
      status: 'InTransit',
    });
    expect(agent(state, deployed).state.exactExhaustionHundredths / 100).toBeGreaterThanOrEqual(14);
  });

  it('Recovery with current health already at base health', () => {
    let state = setAssignment(newCampaign(), [agentIds(newCampaign())[0]!], 'Recovery');
    const [f1] = agentIds(state) as [string];
    state = tweak(state, (world) => (world.agents[f1]!.state.exactExhaustionHundredths = 1200));
    expect(currentLiveWorldStateView(state, gdrs).agents[0]!.recoveryTurnsRemaining).toBe(0);
    state = advance(state);
    // It returns to Standby at once, still recovering its exhaustion in the same Agent recovery step.
    const recovery = gdrs.recoveryParameters.exhaustionRecoveryPerTurnHundredths;
    expect(units(agent(state, f1).state)).toMatchObject({
      currentHealth: agent(state, f1).state.baseHealth,
      exactExhaustionHundredths: Math.max(0, 1200 - recovery),
      assignment: { kind: 'Standby' },
      status: 'AtAssignment',
    });
  });

  it('Recovery GDR validation: a missing property is rejected', () => {
    expectDefective((raw) => delete raw.get('recovery')['exhaustion_recovery_per_turn']);
  });
});

describe('INVSTG and LEAD: gaps', () => {
  it('Rejections of startInvestigation, and Agents of another Investigation', () => {
    // LEAD, Lead discovery: the set of discovered Leads is stored at campaign creation, so the Campaign is created
    // from the catalog that holds other_lead.
    const catalog = catalogWith((raw) =>
      raw.add('leads-and-progression/leads.yaml', { ...raw.get('locate_red_dawn_member'), id: 'other_lead' }),
    );
    let state = withAgents(newCampaign({ catalog }), 7, catalog);
    const [a1, a2, a3, a4, a7, a6] = agentIds(state) as [string, string, string, string, string, string];
    const run = (s: CampaignState, name: string, args: Record<string, unknown>) =>
      act(s, name, args, 'player', catalog);
    state = run(state, 'startInvestigation', { lead: 'other_lead', agents: [a7] });
    const i11 = Object.keys(state.world.current.investigations)[0]!;
    state = tweak(state, (world) => {
      world.agents[a7]!.state.status = 'AtAssignment';
      setCurrentHealth(world.agents[a3]!.state, 500);
      world.agents[a3]!.state.assignment = { kind: 'Recovery' };
      world.agents[a3]!.state.status = 'Recovering';
    });
    state = setAssignment(state, [a1], 'Contracting');
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    const site = addMissionSite(state, 'foil_recruitment_push', { catalog });
    state = run(site.state, 'deployAgents', { missionSite: site.site, agents: [a4] });
    const lead = 'locate_red_dawn_member';
    const reject = (list: string[], reason: string) =>
      expectRejected(state, 'startInvestigation', { lead, agents: list }, reason, 'player', catalog);
    reject([], 'agents_empty');
    reject([a1, a1], 'agents_duplicate');
    // a1 is on Contracting, an Away Assignment, which it can leave only for Standby.
    reject([a1], 'agents_not_in_base');
    // AGENT, Transit rule, No orders in transit: a2 must arrive first.
    reject([a2], 'agents_cannot_be_ordered');
    reject([a3], 'agents_cannot_be_ordered');
    reject([a4], 'agents_cannot_be_ordered');
    expectRejected(
      state,
      'assignAgentsToInvestigation',
      { investigation: i11, agents: [a1] },
      'agents_not_in_base',
      'player',
      catalog,
    );
    // startInvestigation never takes an Agent off another Investigation: i11 keeps a7.
    reject([a7], 'agents_not_in_base');
    expect(state.world.current.investigations[i11]!.state).toMatchObject({
      lifecycle: 'Active',
      currentTeam: [a7],
    });
    // a6, on Training At assignment, can join i11 or start a new Investigation.
    state = setAssignment(state, [a6], 'Training');
    const joined = run(state, 'assignAgentsToInvestigation', { investigation: i11, agents: [a6] });
    expect(joined.world.current.investigations[i11]!.state.currentTeam).toEqual([a7, a6]);
    expect(joined.world.current.agents[a6]!.state).toMatchObject({
      assignment: { kind: 'Investigation', investigation: i11 },
      status: 'InTransit',
    });
    const started = run(state, 'startInvestigation', { lead, agents: [a6] });
    expect(Object.values(started.world.current.investigations)[1]!.state.currentTeam).toEqual([a6]);
    expect(started.world.current.investigations[i11]!.state.currentTeam).toEqual([a7]);
  });

  it('Game build without a Lead: a Campaign is created', () => {
    const catalog = catalogWith((raw) => {
      raw.files.find((file) => file.path.endsWith('/leads.yaml'))!.gdrs.length = 0;
      raw.pruneArticles();
    });
    const state = advance(newCampaign({ catalog }), {}, catalog);
    expect(currentRetiredWorldStateView(state, catalog).leads).toEqual([]);
  });
});
