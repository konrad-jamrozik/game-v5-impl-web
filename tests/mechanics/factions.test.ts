/** Acceptance examples of FACTION (Factions). */
import { describe, expect, it } from 'vitest';
import { createFaction } from '../../src/engine/mechanics/factions/factions.ts';
import { injectedRandom } from '../../src/engine/random.ts';
import { createCampaignState } from '../../src/engine/state/create.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agentIds,
  catalogWith,
  expectDefective,
  gdrs,
  newCampaign,
  onlyFaction,
  tweak,
  winning,
  withAgents,
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

describe('FACTION: Acceptance examples', () => {
  it('Campaign creation through the first escalation', () => {
    const levels = (id: string) => gdrs.factionActivityLevels.get(id)!;
    const created = createFaction(
      'faction-1',
      gdrs.factionArchetypes[0]!,
      levels,
      injectedRandom({
        'faction.faction-1.levelDuration': [60],
        'faction.faction-1.operationInterval': [15],
      }),
    );
    expect(created.state).toEqual({
      activityLevel: 'faint',
      turnsUntilNextLevel: 60,
      turnsUntilNextOperation: 15,
      defeated: false,
      defeatedTurn: null,
    });
    expect(created.constants).toEqual({});

    let state = setFaction(newCampaign({ money: 100_000 }), { untilLevel: 60, untilOperation: 15 });
    const f = onlyFaction(state).id;
    for (let turn = 1; turn <= 14; turn += 1) {
      state = advance(state);
    }
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 46, turnsUntilNextOperation: 1 });
    expect(sites(state)).toHaveLength(0);

    // First operation, Advance turn ending turn 15.
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [1],
      [`faction.${f}.operationInterval`]: [25],
      [`mission.archetypeSelection.${f}`]: ['foil_recruitment_push'],
    });
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 45, turnsUntilNextOperation: 25 });
    expect(sites(state)).toHaveLength(1);
    expect(sites(state)[0]).toMatchObject({
      archetype: 'foil_recruitment_push',
      constants: {
        kind: 'Response',
        origin: { kind: 'FactionOperation', initiatingFaction: f, operationLevel: 'operation_level_1' },
        targetFaction: f,
        turnCreated: 15,
      },
      state: { lifecycle: 'Active', turnsUntilExpiry: 3 },
    });

    // Second operation, Advance turn ending turn 40.
    for (let turn = 16; turn <= 39; turn += 1) {
      state = advance(state);
    }
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [2],
      [`faction.${f}.operationInterval`]: [20],
      [`mission.archetypeSelection.${f}`]: ['foil_sabotage'],
    });
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 20, turnsUntilNextOperation: 20 });
    expect(sites(state).map((site) => site.archetype)).toEqual(['foil_recruitment_push', 'foil_sabotage']);

    // First escalation and third operation, Advance turn ending turn 60.
    for (let turn = 41; turn <= 59; turn += 1) {
      state = advance(state);
    }
    expect(onlyFaction(state).state).toMatchObject({ turnsUntilNextLevel: 1, turnsUntilNextOperation: 1 });
    const used = advance(state, {
      [`faction.${f}.levelDuration`]: [90],
      [`faction.${f}.operationLevel`]: [2],
      [`faction.${f}.operationInterval`]: [11],
      [`mission.archetypeSelection.${f}`]: ['foil_sabotage'],
    });
    expect(onlyFaction(used).state).toMatchObject({
      activityLevel: 'active',
      turnsUntilNextLevel: 90,
      turnsUntilNextOperation: 11,
    });
    expect(sites(used)).toHaveLength(3);
    expect(sites(used)[2]!.state.turnsUntilExpiry).toBe(4);
    // An Operation interval of 11 is outside `faint`'s 15 to 25, so it proves the new level was read.
    expect(used.world.current.turn).toBe(61);
  });

  it('A level change does not reset the operation countdown', () => {
    let state = setFaction(newCampaign(), { level: 'active', untilLevel: 1, untilOperation: 5 });
    state = advance(state);
    expect(onlyFaction(state).state).toMatchObject({
      activityLevel: 'war',
      turnsUntilNextLevel: null,
      turnsUntilNextOperation: 4,
    });
    expect(sites(state)).toHaveLength(0);
    for (let i = 0; i < 3; i += 1) {
      state = advance(state);
    }
    const f = onlyFaction(state).id;
    state = advance(state, {
      [`faction.${f}.operationInterval`]: [18],
      [`faction.${f}.operationLevel`]: [2],
    });
    expect(onlyFaction(state).state.turnsUntilNextOperation).toBe(18);
    expect(sites(state)).toHaveLength(1);
  });

  it('Operations at the final level', () => {
    let state = setFaction(newCampaign(), { level: 'war', untilLevel: null, untilOperation: 1 });
    const f = onlyFaction(state).id;
    state = advance(state, { [`faction.${f}.operationLevel`]: [1], [`faction.${f}.operationInterval`]: [8] });
    expect(onlyFaction(state).state).toMatchObject({
      activityLevel: 'war',
      turnsUntilNextLevel: null,
      turnsUntilNextOperation: 8,
    });
    expect(sites(state)[0]!.archetype).toBe('foil_recruitment_push');
    for (let i = 0; i < 7; i += 1) {
      state = advance(state);
      expect(sites(state)).toHaveLength(1);
    }
    state = advance(state);
    expect(sites(state)).toHaveLength(2);
  });

  it('Defeat stops escalation and operations', () => {
    let state = withAgents(newCampaign({ money: 100_000 }), 12);
    for (let i = 0; i < 4; i += 1) {
      state = act(state, 'purchaseUpgrade', { upgrade: 'transport_cap' });
    }
    state = tweak(state, (world) => {
      world.turn = 120;
    });
    state = setFaction(state, { level: 'active', untilLevel: 1, untilOperation: 1 });
    const site = addMissionSite(state, 'raid_hq');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: agentIds(site.state) });
    state = advance(state, winning(state, site.site));
    expect(onlyFaction(state).state).toEqual({
      activityLevel: 'active',
      turnsUntilNextLevel: 1,
      turnsUntilNextOperation: 1,
      defeated: true,
      defeatedTurn: 120,
    });
    expect(sites(state)).toHaveLength(1);
    expect(state.world.current.ending).toBe('Victory');
  });

  it('Several Factions', () => {
    const catalog = catalogWith((raw) =>
      raw.add('factions/faction_archetypes.yaml', {
        id: 'test_faction',
        type: 'FactionArchetype',
        name: 'Test Faction',
        initial_activity_level: 'active',
      }),
    );
    let state = createCampaignState({ startingMoney: 500, startingFunding: 20 }, 'two', catalog);
    const [red, test] = Object.values(state.world.current.factions);
    expect([red!.archetype, red!.state.activityLevel]).toEqual(['red_dawn', 'faint']);
    expect([test!.archetype, test!.state.activityLevel]).toEqual(['test_faction', 'active']);
    expect(test!.state.turnsUntilNextOperation).toBeGreaterThanOrEqual(11);
    expect(test!.state.turnsUntilNextOperation).toBeLessThanOrEqual(21);
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
  });

  it('Player-visible information', () => {
    let state = setFaction(newCampaign(), { untilLevel: 45, untilOperation: 25 });
    const [view] = currentStateView(state, gdrs).factions;
    expect(view).toEqual({
      id: onlyFaction(state).id,
      archetype: 'red_dawn',
      name: 'Red Dawn',
      activityLevel: {
        id: 'faint',
        name: 'Faint',
        lastsTurns: [60, 90],
        operationEveryTurns: [15, 25],
        operationLevelWeights: [
          { level: 1, weight: 80 },
          { level: 2, weight: 20 },
        ],
        next: 'active',
      },
      defeated: false,
      defeatedTurn: null,
    });
    const text = JSON.stringify(currentStateView(state, gdrs));
    expect(text).not.toMatch(/turnsUntilNext|"45"|:45[,}]/);
    state = setFaction(state, { level: 'war', untilLevel: null });
    const final = currentStateView(state, gdrs).factions[0]!;
    expect(final.activityLevel.next).toBeNull();
    expect(Object.keys(final)).toEqual([
      'id',
      'archetype',
      'name',
      'activityLevel',
      'defeated',
      'defeatedTurn',
    ]);
  });

  it('GDR validation', () => {
    expectDefective((raw) => {
      raw.get('war')['next'] = 'faint';
      raw.get('war')['lasts_turns'] = [60, 90];
    });
    expectDefective((raw) => raw.get('faint')['operation_level_weights'].$entries.push(['3', 5]));
    expectDefective((raw) => (raw.get('active')['lasts_turns'] = null));
    expectDefective((raw) => (raw.get('faint')['operation_every_turns'] = [0, 25]));
    expectDefective((raw) => (raw.get('red_dawn')['initial_activity_level'] = 'dormant'));
    expectDefective((raw) => (raw.get('faint')['operation_level_weights'].$entries[1][1] = 0));
    expectDefective((raw) => (raw.get('red_dawn')['description'] = 'x'));
    expectDefective((raw) => delete raw.get('war')['next']);
    expectDefective((raw) => (raw.get('operation_level_2')['level'] = 1));
    // A Game build with no FactionArchetype is valid, apart from the Leads that name one.
    const none = catalogWith((raw) => {
      raw.files.find((file) => file.path.endsWith('faction_archetypes.yaml'))!.gdrs.length = 0;
      raw.files.find((file) => file.path.endsWith('leads.yaml'))!.gdrs.length = 0;
    });
    expect(none.factionArchetypes).toHaveLength(0);
  });
});
