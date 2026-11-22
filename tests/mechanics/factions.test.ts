/** Tests, from the former Acceptance examples, of FACTION (Factions). */
import { describe, expect, it } from 'vite-plus/test';
import { createFaction } from '../../src/engine/mechanics/factions/factions.ts';
import { injectedRandom } from '../../src/engine/random.ts';
import { createCampaignState } from '../../src/engine/state/create.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  gameDataView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import { RAW_GDR_FILES, buildGdrCatalog } from '../../src/gdr/index.ts';
import {
  addMissionSite,
  advance,
  agentIds,
  catalogWith,
  expectDefective,
  finishingInvestigation,
  gdrs,
  newCampaign,
  onlyFaction,
  tweak,
} from '../helpers/game.ts';

function setFaction(
  state: CampaignState,
  values: { level?: string; untilLevel?: number | null; untilOperation?: number },
): CampaignState {
  return tweak(state, (world) => {
    const faction = Object.values(world.factions)[0]!;
    if (values.level !== undefined) {
      faction.state.activityLevel = values.level;
    }
    if (values.untilLevel !== undefined) {
      faction.state.turnsUntilNextLevel = values.untilLevel;
    }
    if (values.untilOperation !== undefined) {
      faction.state.turnsUntilNextOperation = values.untilOperation;
    }
  });
}

const sites = (state: CampaignState) => Object.values(state.world.current.missionSites);

type RawGdrs = Parameters<Parameters<typeof catalogWith>[0]>[0];

/**
 * Sets the Fixture values the examples state: the Faction activity levels they pass through, with how long each
 * lasts, how often it operates, and the weights of its Faction operation levels; Red Dawn starting at `faint`; and
 * the Response MissionSiteArchetypes they create, of operation level 1 or 2, each expiring in 1 Turn.
 */
function setExampleValues(raw: RawGdrs): void {
  const level = (
    id: string,
    lasts: [number, number] | null,
    every: [number, number] | null,
    weights: [string, number][],
  ) => {
    const gdr = raw.get(id);
    gdr['lasts_turns'] = lasts;
    gdr['operation_every_turns'] = every;
    gdr['operation_level_weights'] = { $entries: weights };
  };
  level('dormant', [10, 20], null, []);
  level(
    'faint',
    [15, 25],
    [10, 20],
    [
      ['1', 80],
      ['2', 20],
    ],
  );
  level(
    'emerging',
    [15, 25],
    [10, 18],
    [
      ['1', 60],
      ['2', 30],
      ['3', 10],
    ],
  );
  level(
    'active',
    [15, 25],
    [8, 18],
    [
      ['1', 40],
      ['2', 40],
    ],
  );
  level(
    'war',
    [15, 25],
    [6, 14],
    [
      ['1', 50],
      ['2', 50],
    ],
  );
  level(
    'total_war',
    null,
    [6, 14],
    [
      ['1', 50],
      ['2', 50],
    ],
  );
  raw.get('red_dawn')['initial_activity_level'] = 'faint';
  for (const [id, operationLevel] of [
    ['foil_recruitment_push', 1],
    ['foil_sabotage', 2],
    ['foil_vip_assassination', 2],
  ] as const) {
    raw.get(id)['operation_level'] = operationLevel;
    raw.get(id)['expires_in_turns'] = 1;
  }
}

/** The test Game build with the Fixture values of the examples. */
const example = catalogWith(setExampleValues);

describe('FACTION: examples', () => {
  it('Campaign creation through the first escalation', () => {
    const catalog = example;
    const levels = (id: string) => catalog.factionActivityLevels.get(id)!;
    const created = createFaction(
      'faction-1',
      catalog.factionArchetypes.find((item) => item.id === 'red_dawn')!,
      levels,
      injectedRandom({
        'faction.faction-1.levelDuration': [20],
        'faction.faction-1.operationInterval': [10],
      }),
    );
    expect(created.state).toEqual({
      activityLevel: 'faint',
      turnsUntilNextLevel: 20,
      turnsUntilNextOperation: 10,
      eliminated: false,
      eliminatedTurn: null,
    });
    expect(created.constants).toEqual({});

    let state = setFaction(newCampaign({ money: 100_000, catalog }), { untilLevel: 20, untilOperation: 10 });
    const f = onlyFaction(state).id;
    for (let turn = 1; turn <= 9; turn += 1) {
      state = advance(state, {}, catalog);
    }
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 11, turnsUntilNextOperation: 1 });
    expect(sites(state)).toHaveLength(0);

    // First operation, Advance turn ending turn 10.
    state = advance(
      state,
      {
        [`faction.${f}.operationLevel`]: [1],
        [`faction.${f}.operationInterval`]: [10],
        [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
      },
      catalog,
    );
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 10, turnsUntilNextOperation: 10 });
    expect(sites(state)).toHaveLength(1);
    expect(sites(state)[0]).toMatchObject({
      archetype: 'foil_recruitment_push',
      constants: {
        kind: 'Response',
        origin: { kind: 'FactionOperation', initiatingFaction: f, operationLevel: 'operation_level_1' },
        targetFaction: f,
        turnCreated: 10,
      },
      state: { lifecycle: 'Active', turnsUntilExpiration: 1 },
    });

    // First escalation and second operation, Advance turn ending turn 20.
    for (let turn = 11; turn <= 19; turn += 1) {
      state = advance(state, {}, catalog);
    }
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 1, turnsUntilNextOperation: 1 });
    expect(sites(state)[0]!.state.lifecycle).toBe('Expired');
    const escalation = {
      [`faction.${f}.levelDuration`]: [20],
      [`faction.${f}.operationLevel`]: [2],
      [`mission.archetypeSelection.${f}`]: ['foil_vip_assassination'],
    };
    // An Operation interval of 19 is inside `faint`'s 10 to 20 but outside `emerging`'s 10 to 18, so its rejection
    // proves the new level was read.
    expect(() =>
      advance(state, { ...escalation, [`faction.${f}.operationInterval`]: [19] }, catalog),
    ).toThrow(/outside 10 to 18/);
    const used = advance(state, { ...escalation, [`faction.${f}.operationInterval`]: [13] }, catalog);
    expect(onlyFaction(used).state).toMatchObject({
      activityLevel: 'emerging',
      turnsUntilNextLevel: 20,
      turnsUntilNextOperation: 13,
    });
    expect(sites(used).map((site) => site.archetype)).toEqual([
      'foil_recruitment_push',
      'foil_vip_assassination',
    ]);
    expect(sites(used)[1]!.state.turnsUntilExpiration).toBe(1);
    expect(used.world.current.turn).toBe(21);
    // FACTION, Turn report: the Turn report holds the operation, never the escalation.
    expect(turnReportView(used)?.factionActivity).toEqual([
      { faction: f, createdMissionSite: sites(used)[1]!.id, operationLevel: 'operation_level_2' },
    ]);
    expect(JSON.stringify(used.world.history.historyEntries.at(-1))).not.toMatch(/escalat|emerging/);
  });

  it('A level without operations: no countdown and no operation; waking draws one and does not count it down', () => {
    // Campaign creation at `dormant`, a level without operations, e.g. the initial level of Exalt and Black Lotus.
    const catalog = example;
    const levels = (id: string) => catalog.factionActivityLevels.get(id)!;
    const sleeper = { ...catalog.factionArchetypes[0]!, initialActivityLevel: 'dormant' };
    const created = createFaction(
      'faction-2',
      sleeper,
      levels,
      injectedRandom({ 'faction.faction-2.levelDuration': [20] }),
    );
    expect(created.state).toEqual({
      activityLevel: 'dormant',
      turnsUntilNextLevel: 20,
      turnsUntilNextOperation: null,
      eliminated: false,
      eliminatedTurn: null,
    });
    let state = tweak(newCampaign({ catalog }), (world) => {
      const faction = Object.values(world.factions)[0]!;
      faction.state.activityLevel = 'dormant';
      faction.state.turnsUntilNextLevel = 2;
      faction.state.turnsUntilNextOperation = null;
    });
    const f = onlyFaction(state).id;
    state = advance(state, {}, catalog);
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 1, turnsUntilNextOperation: null });
    // Waking: the countdown is drawn over `faint` and is not counted down in the same Advance turn.
    state = advance(
      state,
      {
        [`faction.${f}.levelDuration`]: [20],
        [`faction.${f}.operationInterval`]: [15],
      },
      catalog,
    );
    expect(onlyFaction(state).state).toMatchObject({
      activityLevel: 'faint',
      turnsUntilNextLevel: 20,
      turnsUntilNextOperation: 15,
    });
    for (let i = 0; i < 14; i += 1) {
      state = advance(state, {}, catalog);
    }
    expect(sites(state)).toHaveLength(0);
    state = advance(
      state,
      {
        [`faction.${f}.operationLevel`]: [1],
        [`faction.${f}.operationInterval`]: [20],
      },
      catalog,
    );
    expect(sites(state)).toHaveLength(1);
    // A move to a level without operations makes the countdown absent.
    const quietCatalog = catalogWith((raw) => {
      setExampleValues(raw);
      raw.get('emerging')['operation_every_turns'] = null;
      raw.get('emerging')['operation_level_weights'] = { $entries: [] };
    });
    let quiet = tweak(newCampaign({ catalog: quietCatalog }), (world) => {
      const faction = Object.values(world.factions)[0]!;
      faction.state.turnsUntilNextLevel = 1;
      faction.state.turnsUntilNextOperation = 1;
    });
    quiet = advance(quiet, { [`faction.${f}.levelDuration`]: [20] }, quietCatalog);
    expect(onlyFaction(quiet).state).toMatchObject({
      activityLevel: 'emerging',
      turnsUntilNextOperation: null,
    });
    expect(sites(quiet)).toHaveLength(0);
    expect(checkInvariants(quiet, quietCatalog)).toEqual([]);
  });

  it('A level change does not reset the operation countdown', () => {
    const catalog = example;
    let state = setFaction(newCampaign({ catalog }), { level: 'war', untilLevel: 1, untilOperation: 5 });
    state = advance(state, {}, catalog);
    expect(onlyFaction(state).state).toMatchObject({
      activityLevel: 'total_war',
      turnsUntilNextLevel: null,
      turnsUntilNextOperation: 4,
    });
    expect(sites(state)).toHaveLength(0);
    for (let i = 0; i < 3; i += 1) {
      state = advance(state, {}, catalog);
    }
    const f = onlyFaction(state).id;
    state = advance(
      state,
      {
        [`faction.${f}.operationInterval`]: [12],
        [`faction.${f}.operationLevel`]: [2],
      },
      catalog,
    );
    expect(onlyFaction(state).state.turnsUntilNextOperation).toBe(12);
    expect(sites(state)).toHaveLength(1);
  });

  it('Operations at the final level', () => {
    const catalog = example;
    let state = setFaction(newCampaign({ catalog }), {
      level: 'total_war',
      untilLevel: null,
      untilOperation: 1,
    });
    const f = onlyFaction(state).id;
    state = advance(
      state,
      {
        [`faction.${f}.operationLevel`]: [1],
        [`faction.${f}.operationInterval`]: [8],
        [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
      },
      catalog,
    );
    expect(onlyFaction(state).state).toMatchObject({
      activityLevel: 'total_war',
      turnsUntilNextLevel: null,
      turnsUntilNextOperation: 8,
    });
    expect(sites(state)[0]!.archetype).toBe('foil_recruitment_push');
    for (let i = 0; i < 7; i += 1) {
      state = advance(state, {}, catalog);
      expect(sites(state)).toHaveLength(1);
    }
    state = advance(state, {}, catalog);
    expect(sites(state)).toHaveLength(2);
  });

  it('Elimination by a Lead stops escalation and operations in the same Advance turn', () => {
    let state = tweak(newCampaign(), (world) => {
      world.turn = 120;
      world.discoveredLeads.push('terminate_red_dawn');
    });
    state = setFaction(state, { level: 'active', untilLevel: 1, untilOperation: 1 });
    const site = addMissionSite(state, 'raid_safehouse');
    const terminate = finishingInvestigation(site.state, 'terminate_red_dawn', agentIds(state)[0]!);
    state = advance(terminate.state);
    expect(onlyFaction(state).state).toEqual({
      activityLevel: 'active',
      turnsUntilNextLevel: 1,
      turnsUntilNextOperation: 1,
      eliminated: true,
      eliminatedTurn: 120,
    });
    // Its Active Mission site is Cancelled, it creates no Response Mission site, and it does not win the Campaign.
    expect(sites(state).map((item) => item.state.lifecycle)).toEqual(['Cancelled']);
    expect(state.world.current.ending).toBeNull();
    expect(
      currentRetiredWorldStateView(state, gdrs).leads.find((lead) => lead.id === 'terminate_red_dawn')!
        .status,
    ).toBe('Archived');
  });

  it('Several Factions', () => {
    const catalog = catalogWith((raw) => {
      setExampleValues(raw);
      raw.add('factions/faction_archetypes.yaml', {
        id: 'test_faction',
        type: 'FactionArchetype',
        name: 'Test Faction',
        initial_activity_level: 'active',
      });
    });
    let state = createCampaignState({ startingMoney: 500, startingFunding: 20 }, 'two', catalog);
    const [red, test] = Object.values(state.world.current.factions);
    expect([red!.archetype, red!.state.activityLevel]).toEqual(['red_dawn', 'faint']);
    expect([test!.archetype, test!.state.activityLevel]).toEqual(['test_faction', 'active']);
    expect(test!.state.turnsUntilNextOperation).toBeGreaterThanOrEqual(8);
    expect(test!.state.turnsUntilNextOperation).toBeLessThanOrEqual(18);
    state = tweak(state, (world) => {
      for (const faction of Object.values(world.factions)) {
        faction.state.turnsUntilNextOperation = 1;
      }
    });
    const injected = {
      [`faction.${red!.id}.operationLevel`]: [1],
      [`faction.${red!.id}.operationInterval`]: [20],
      [`faction.${test!.id}.operationLevel`]: [2],
      [`faction.${test!.id}.operationInterval`]: [11],
      [`mission.archetypeSelection.${red!.id}`]: ['foil_recruitment_push'],
      [`mission.archetypeSelection.${test!.id}`]: ['foil_sabotage'],
    };
    const forward = advance(state, injected, catalog);
    const reversed = advance(state, injected, catalog, (items) => [...items].reverse());
    expect(reversed).toEqual(forward);
    expect(sites(forward).map((site) => [site.archetype, site.constants.targetFaction])).toEqual([
      ['foil_recruitment_push', red!.id],
      ['foil_sabotage', test!.id],
    ]);
    expect(Object.values(forward.world.current.factions).map((x) => x.state.turnsUntilNextOperation)).toEqual(
      [20, 11],
    );
    expect(checkInvariants(forward, catalog)).toEqual([]);
    // FACTION, Several Factions and Turn report: the Response Mission sites are created, and the Turn report lists
    // the Factions, in the order of the Factions' Instance IDs, whatever their order in Campaign state.
    const shuffled = tweak(state, (world) => {
      world.factions = Object.fromEntries(Object.entries(world.factions).reverse());
    });
    const fromShuffled = advance(shuffled, injected, catalog);
    const created = fromShuffled.world.current.missionSites;
    expect(created['mission-site-1']?.constants.targetFaction).toBe(red!.id);
    expect(created['mission-site-2']?.constants.targetFaction).toBe(test!.id);
    expect(turnReportView(fromShuffled)?.factionActivity.map((item) => item.faction)).toEqual([
      red!.id,
      test!.id,
    ]);
  });

  it('Initial Factions are created in the authored order of their FactionArchetypes', () => {
    // FACTION, Initial Factions; GDR, GDR authoring format: the first FactionArchetype's Faction is faction-1.
    const bootstrap = buildGdrCatalog(RAW_GDR_FILES);
    const authored = RAW_GDR_FILES.flatMap((file) => file.gdrs as readonly Record<string, unknown>[])
      .filter((gdr) => gdr['type'] === 'FactionArchetype')
      .map((gdr) => gdr['id'] as string);
    expect(authored.length).toBeGreaterThan(1);
    expect(bootstrap.factionArchetypes.map((archetype) => archetype.id)).toEqual(authored);
    const state = createCampaignState({ startingMoney: 500, startingFunding: 20 }, 'order', bootstrap);
    expect(
      Object.values(state.world.current.factions).map((faction) => [faction.id, faction.archetype]),
    ).toEqual(authored.map((id, index) => [`faction-${index + 1}`, id]));
    const reordered = catalogWith((raw) => {
      raw.add('factions/faction_archetypes.yaml', {
        id: 'test_faction',
        type: 'FactionArchetype',
        name: 'Test Faction',
        initial_activity_level: 'active',
      });
      raw.files.find((file) => file.path === 'factions/faction_archetypes.yaml')!.gdrs.reverse();
    });
    const first = createCampaignState({ startingMoney: 500, startingFunding: 20 }, 'order', reordered);
    expect(first.world.current.factions['faction-1']?.archetype).toBe('test_faction');
  });

  it('Player-visible information', () => {
    let state = setFaction(newCampaign(), { untilLevel: 45, untilOperation: 25 });
    const faction = onlyFaction(state);
    const [view] = currentLiveWorldStateView(state, gdrs).factions;
    // FACTION, Player-visible information: neither the Faction activity level nor either countdown.
    expect(view).toEqual({
      id: faction.id,
      archetype: faction.archetype,
      name: gdrs.factionArchetypes.find((item) => item.id === faction.archetype)!.name,
      eliminated: false,
      eliminatedTurn: null,
    });
    const level = faction.state.activityLevel;
    const text = JSON.stringify(currentLiveWorldStateView(state, gdrs));
    expect(text).not.toMatch(/turnsUntilNext|"45"|:45[,}]|activityLevel/i);
    expect(text.toLowerCase()).not.toContain(level.toLowerCase());
    expect(text.toLowerCase()).not.toContain(gdrs.factionActivityLevels.get(level)!.name.toLowerCase());
    state = setFaction(state, { level: 'total_war', untilLevel: null });
    const final = currentLiveWorldStateView(state, gdrs).factions[0]!;
    expect(Object.keys(final)).toEqual(['id', 'archetype', 'name', 'eliminated', 'eliminatedTurn']);
    // No FactionActivityLevel GDR is Player-visible.
    const gameData = JSON.stringify(gameDataView(gdrs));
    expect(gameData).not.toMatch(/activityLevel|operationEveryTurns/i);
    expect(gameData.toLowerCase()).not.toContain(
      gdrs.factionActivityLevels.get('total_war')!.name.toLowerCase(),
    );
  });

  it('GDR validation', () => {
    expectDefective((raw) => {
      raw.get('war')['next'] = 'faint';
      raw.get('war')['lasts_turns'] = [60, 90];
    });
    expectDefective((raw) => raw.get('faint')['operation_level_weights'].$entries.push(['7', 5]));
    expectDefective((raw) => (raw.get('active')['lasts_turns'] = null));
    expectDefective((raw) => (raw.get('faint')['operation_every_turns'] = [0, 25]));
    expectDefective((raw) => (raw.get('red_dawn')['initial_activity_level'] = 'missing_level'));
    // Rule 8: weights exactly when the level has operations.
    expectDefective((raw) => (raw.get('dormant')['operation_every_turns'] = [10, 20]));
    expectDefective((raw) => (raw.get('faint')['operation_every_turns'] = null));
    expectDefective((raw) => raw.get('dormant')['operation_level_weights'].$entries.push(['1', 5]));
    expect(catalogWith((raw) => (raw.get('red_dawn')['initial_activity_level'] = 'dormant'))).toBeDefined();
    expectDefective((raw) => (raw.get('faint')['operation_level_weights'].$entries[0][1] = 0));
    expectDefective((raw) => (raw.get('red_dawn')['description'] = 'x'));
    expectDefective((raw) => delete raw.get('war')['next']);
    expectDefective((raw) => (raw.get('operation_level_2')['level'] = 1));
    // A Game build with no FactionArchetype is valid, apart from the Leads and the Subject articles about one.
    const none = catalogWith((raw) => {
      raw.files.find((file) => file.path.endsWith('/faction_archetypes.yaml'))!.gdrs.length = 0;
      raw.files.find((file) => file.path.endsWith('/leads.yaml'))!.gdrs.length = 0;
      raw.pruneArticles();
    });
    expect(none.factionArchetypes).toHaveLength(0);
  });
});
