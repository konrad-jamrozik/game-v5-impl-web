/**
 * EQUIP (Equipment) and COMBAT, Ammo in a Combat: Storage, equipping, buying and selling, Unlocked Items, Ammo short,
 * Mission equipment losses, Spoils of war, Missions resolved in deployment order, and the Rested and Equipment Combat
 * ratings.
 */
import { describe, expect, it } from 'vite-plus/test';
import { currentLiveWorldStateView } from '../../src/engine/views/views.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  allHit,
  allMiss,
  completeLead,
  expectRejected,
  gdrs,
  money,
  newCampaign,
  tweak,
  winning,
} from '../helpers/game.ts';

const storage = (state: CampaignState) => state.world.current.agency.state.storage;
const stock = (state: CampaignState, items: Record<string, number>) =>
  tweak(state, (world) => {
    Object.assign(world.agency.state.storage, items);
  });
const view = (state: CampaignState) => currentLiveWorldStateView(state, gdrs);

describe('EQUIP: Storage and equipping', () => {
  it('a new Campaign holds the starting rounds, and every Agent wears the issued kit', () => {
    const state = newCampaign();
    expect(storage(state)).toEqual(gdrs.equipment.startingAmmo);
    for (const id of agentIds(state)) {
      expect(agent(state, id).state).toMatchObject({
        weapon: gdrs.agentArchetype.weapon,
        armor: gdrs.agentArchetype.armor,
      });
    }
  });

  it('equipAgent swaps through Storage, and the fallbacks need no Storage', () => {
    let state = stock(newCampaign(), { rifle: 2 });
    const [a1] = agentIds(state) as [string];
    state = act(state, 'equipAgent', { agent: a1, equipment: 'rifle' });
    expect(agent(state, a1).state).toMatchObject({
      weapon: 'rifle',
      baseWeaponDamage: gdrs.weapons.get('rifle')!.damage,
    });
    expect(storage(state)['rifle']).toBe(1);
    expect(storage(state)['combat_pistol']).toBe(1);
    // EQUIP, Equipping Agents: the Fallback Weapon goes nowhere, and the rifle taken off goes into Storage.
    state = act(state, 'equipAgent', { agent: a1, equipment: gdrs.combatParameters.fallbackWeapon });
    expect(agent(state, a1).state.weapon).toBe(gdrs.combatParameters.fallbackWeapon);
    expect(storage(state)['rifle']).toBe(2);
    expectRejected(state, 'equipAgent', { agent: a1, equipment: 'machine_gun' }, 'not_in_storage');
    expectRejected(
      state,
      'equipAgent',
      { agent: a1, equipment: gdrs.combatParameters.fallbackWeapon },
      'already_equipped',
    );
  });

  it('equipAgents applies its entries in order, so one can take what an earlier one freed, or equips nothing', () => {
    let state = stock(newCampaign(), { rifle: 1 });
    const [a1, a2] = agentIds(state) as [string, string];
    const fallback = gdrs.combatParameters.fallbackWeapon;
    state = act(state, 'equipAgents', { changes: [{ agent: a1, equipment: 'rifle' }] });
    const pistols = storage(state)['combat_pistol'] ?? 0;
    // a1 frees the rifle, then a2 puts it on.
    const swap = [
      { agent: a1, equipment: fallback },
      { agent: a2, equipment: 'rifle' },
    ];
    expectRejected(state, 'equipAgents', { changes: [...swap].reverse() }, 'not_in_storage');
    state = act(state, 'equipAgents', { changes: swap });
    expect(agent(state, a1).state.weapon).toBe(fallback);
    expect(agent(state, a2).state.weapon).toBe('rifle');
    expect(storage(state)['rifle'] ?? 0).toBe(0);
    expect(storage(state)['combat_pistol']).toBe(pistols + 1);
    expectRejected(state, 'equipAgents', { changes: [] }, 'invalid_changes');
  });

  it('a hired Agent wears the Fallback Weapon and the AgentArchetype armor, and brings no Ammo', () => {
    let state = newCampaign({ money: 100 * gdrs.economy.hireCost });
    const before = { ...storage(state) };
    const roster = new Set(Object.keys(state.world.current.agents));
    state = act(state, 'hireAgents', { count: 3 });
    const hired = Object.values(state.world.current.agents).filter((item) => !roster.has(item.id));
    expect(hired).toHaveLength(3);
    for (const item of hired) {
      expect(item.state.weapon).toBe(gdrs.combatParameters.fallbackWeapon);
      expect(item.state.armor).toBe(gdrs.agentArchetype.armor);
    }
    // The Initial roster still wears the issued kit.
    for (const id of roster) {
      expect(agent(state, id).state.weapon).toBe(gdrs.agentArchetype.weapon);
    }
    // EQUIP, Equipment of new and departing Agents: what a new Agent wears comes from no Storage, and it brings no Ammo.
    expect(storage(state)).toEqual(before);
  });

  it('a Dismissed Agent leaves its Items in Storage', () => {
    let state = stock(newCampaign(), { ballistic_vest: 1 });
    const [a1] = agentIds(state) as [string];
    state = act(state, 'equipAgent', { agent: a1, equipment: 'ballistic_vest' });
    state = act(state, 'dismissAgents', { agents: [a1] });
    expect(storage(state)).toMatchObject({ ballistic_vest: 1, combat_pistol: 1 });
  });
});

describe('EQUIP: Buying and selling', () => {
  it('buys only Unlocked Items, and an interrogation of the rank unlocks them', () => {
    let state = newCampaign({ money: 1000 });
    expectRejected(state, 'buyItems', { items: [{ id: 'rifle', count: 1 }] }, 'not_unlocked');
    state = act(state, 'buyItems', {
      items: [
        { id: 'combat_pistol', count: 2 },
        { id: 'pistol_ammo', count: 30 },
      ],
    });
    const cost =
      2 * gdrs.weapons.get('combat_pistol')!.price! + 30 * gdrs.ammoTypes.get('pistol_ammo')!.price;
    expect(money(state)).toBe(1000 - cost);
    expect(storage(state)).toMatchObject({
      combat_pistol: 2,
      pistol_ammo: gdrs.equipment.startingAmmo['pistol_ammo']! + 30,
    });
    // EQUIP, Unlocked Items: any one Lead of `unlocked_by`, once completed.
    state = completeLead(state, gdrs.weapons.get('rifle')!.unlockedBy![0]!);
    state = act(state, 'buyItems', {
      items: [
        { id: 'rifle', count: 1 },
        { id: 'rifle_ammo', count: 10 },
      ],
    });
    expect(storage(state)).toMatchObject({ rifle: 1, rifle_ammo: 10 });
    expectRejected(state, 'buyItems', { items: [{ id: 'rifle', count: 1000 }] }, 'not_enough_money');
  });

  it('sells for the Sale value rounded down once, and takes equipped Items from the weakest Agents only when allowed', () => {
    let state = stock(newCampaign({ money: 0 }), { rifle: 1 });
    const [a1, a2, a3] = agentIds(state) as [string, string, string];
    state = tweak(state, (world) => {
      for (const [id, skill] of [
        [a1, 8000],
        [a2, 5500],
        [a3, 5500],
      ] as const) {
        world.agents[id]!.state.weapon = 'rifle';
        world.agents[id]!.state.baseWeaponDamage = gdrs.weapons.get('rifle')!.damage;
        world.agents[id]!.state.skillHundredths = skill;
      }
    });
    expectRejected(
      state,
      'sellItems',
      { items: [{ id: 'rifle', count: 3 }], takeEquipped: false },
      'items_equipped',
    );
    state = act(state, 'sellItems', {
      items: [
        { id: 'rifle', count: 3 },
        { id: 'pistol_ammo', count: 51 },
      ],
      takeEquipped: true,
    });
    // EQUIP, Selling Items: e.g. 3 rifles at 30 and 51 rounds at 1, round down(0.5 × 141) = 70.
    const priced = 3 * gdrs.weapons.get('rifle')!.price! + 51 * gdrs.ammoTypes.get('pistol_ammo')!.price;
    expect(money(state)).toBe(
      Math.floor(
        (priced * Number(gdrs.equipment.salePriceFraction.n)) / Number(gdrs.equipment.salePriceFraction.d),
      ),
    );
    // The one in Storage first, then the lowest effective skill, ties by the higher Instance ID number.
    expect(agent(state, a1).state.weapon).toBe('rifle');
    expect(agent(state, a2).state.weapon).toBe(gdrs.combatParameters.fallbackWeapon);
    expect(agent(state, a3).state.weapon).toBe(gdrs.combatParameters.fallbackWeapon);
  });
});

describe('EQUIP: Ammo short and Combat ratings', () => {
  it('marks an AmmoType short below ammo_short_rounds_per_agent per Agent, and reports the Equipment Combat rating', () => {
    const agents = (state: CampaignState) => view(state).agents;
    let state = newCampaign();
    const users = agentIds(state).length;
    const needed = gdrs.equipment.ammoShortRoundsPerAgent * users;
    state = tweak(state, (world) => {
      world.agency.state.storage['pistol_ammo'] = needed;
    });
    expect(agents(state).every((item) => !item.ammoShort)).toBe(true);
    state = tweak(state, (world) => {
      world.agency.state.storage['pistol_ammo'] = needed - 1;
    });
    expect(agents(state).every((item) => item.ammoShort)).toBe(true);
    // COMBAT, Equipment Combat rating: 0 in the issued kit, below 0 with the Fallback Weapon.
    const [a1] = agentIds(state) as [string];
    expect(agents(state).find((item) => item.id === a1)!.equipmentCombatRating).toBe(0);
    state = act(state, 'equipAgent', { agent: a1, equipment: gdrs.combatParameters.fallbackWeapon });
    const after = agents(state).find((item) => item.id === a1)!;
    expect(after.equipmentCombatRating).toBeLessThan(0);
    expect(after.restedCombatRating).toBeGreaterThanOrEqual(after.combatRating!);
  });
});

describe('MISSION and COMBAT: Ammo across the Missions of one Advance turn', () => {
  it('each attack spends a round, an Agent with none left fights with the Fallback Weapon, and the Missions share Storage in deployment order', () => {
    let state = newCampaign({ money: 5000 });
    const [a1, a2] = agentIds(state) as [string, string];
    state = tweak(state, (world) => {
      world.agency.state.storage['pistol_ammo'] = 1;
    });
    const first = addMissionSite(state, 'apprehend_member');
    state = act(first.state, 'deployAgents', { missionSite: first.site, agents: [a1] });
    const second = addMissionSite(state, 'apprehend_member');
    state = act(second.state, 'deployAgents', { missionSite: second.site, agents: [a2] });
    const enemies = [
      ...state.world.current.missionSites[first.site]!.state.enemies,
      ...state.world.current.missionSites[second.site]!.state.enemies,
    ];
    // Every Agent attack hits for 5, a damage both the pistol and the Fallback Weapon allow, and every Enemy misses.
    // No spoils ammo, so that the second Combat starts with exactly what the first left (EQUIP, Spoils of war).
    const noSpoils = Object.fromEntries(enemies.map((id) => [`equipment.spoilsAmmo.${id}`, [0]]));
    state = advance(state, { ...allHit([a1, a2], 5), ...allMiss(enemies), ...noSpoils });
    const [one, two] = state.world.history.turnReport!.combatReports as [
      (typeof state.world.history.turnReport & object)['combatReports'][number],
      (typeof state.world.history.turnReport & object)['combatReports'][number],
    ];
    expect(one.ammo).toEqual([{ ammoType: 'pistol_ammo', start: 1, end: 0 }]);
    const firstAttacks = one.log.filter((attack) => attack.attacker === a1);
    expect(firstAttacks[0]).toMatchObject({ ammoSpent: 'pistol_ammo', outOfAmmo: null });
    expect(firstAttacks.slice(1).every((attack) => attack.outOfAmmo === 'pistol_ammo')).toBe(true);
    // The second Mission deployed starts with what the first left: nothing.
    expect(two.ammo).toEqual([{ ammoType: 'pistol_ammo', start: 0, end: 0 }]);
    expect(
      two.log.filter((attack) => attack.attacker === a2).every((attack) => attack.outOfAmmo !== null),
    ).toBe(true);
    expect(storage(state)['pistol_ammo']).toBe(0);
  });
});

describe('EQUIP: Mission equipment losses and Spoils of war', () => {
  it('a Won Mission adds every Enemy Weapon and its spoils ammo outcome to Storage', () => {
    let state = newCampaign({ money: 5000 });
    const [a1] = agentIds(state) as [string];
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a1] });
    const enemies = state.world.current.missionSites[site.site]!.state.enemies;
    const spoils = Object.fromEntries(enemies.map((id) => [`equipment.spoilsAmmo.${id}`, [2]]));
    const before = { ...storage(state) };
    state = advance(state, { ...winning(state, site.site), ...spoils });
    const mission = state.world.history.turnReport!.missions[0]!;
    expect(mission.result).toBe('Won');
    const weapons = enemies.map((id) => state.world.current.enemies[id]?.state.weapon ?? '');
    for (const weapon of new Set(weapons)) {
      const count = weapons.filter((item) => item === weapon).length;
      expect(mission.equipment.spoils[weapon]).toBe(count);
      expect(storage(state)[weapon]).toBe((before[weapon] ?? 0) + count);
    }
    expect(mission.equipment.spoils['pistol_ammo']).toBe(2 * enemies.length);
  });

  it('a wiped team loses its Items, and its survivors wear the fallbacks', () => {
    let state = stock(newCampaign({ money: 5000 }), { ballistic_vest: 1 });
    const [a1] = agentIds(state) as [string];
    state = act(state, 'equipAgent', { agent: a1, equipment: 'ballistic_vest' });
    // Exhaustion at the incapacitation threshold leaves the Agent alive but unable to fight: Wiped at Combat start.
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exactExhaustionHundredths =
        gdrs.agentParameters.exhaustionIncapacitation * 100 - 100;
    });
    const site = addMissionSite(state, 'apprehend_member');
    state = act(site.state, 'deployAgents', { missionSite: site.site, agents: [a1] });
    state = tweak(state, (world) => {
      world.agents[a1]!.state.exactExhaustionHundredths = gdrs.agentParameters.exhaustionIncapacitation * 100;
    });
    state = advance(state);
    const report = state.world.history.turnReport!;
    expect(report.combatReports[0]!.outcome).toBe('Wiped');
    expect(report.missions[0]!.equipment.lost).toEqual({ combat_pistol: 1, ballistic_vest: 1 });
    expect(agent(state, a1).state).toMatchObject({
      weapon: gdrs.combatParameters.fallbackWeapon,
      armor: gdrs.equipment.fallbackArmor,
    });
  });
});
