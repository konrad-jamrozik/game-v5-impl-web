/**
 * EQUIP (Equipment): Items, the Storage of the Agency, which Items are Unlocked, equipping Agents, buying and selling,
 * Ammo short, and what a resolved Mission does to its team's equipment. Every function reads the World state it is
 * given; those that change it are the Player actions and the Mission resolution step.
 */
import { q, roundDown } from '../../../kernel/index.ts';
import type { ArmorGdr, GdrCatalog, WeaponGdr } from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import {
  isServing,
  type Agent,
  type AgentState,
  type CurrentWorldState,
  type MissionEquipmentRecord,
} from '../../state/types.ts';
import { leadCompletedHolds, type ConditionWorld } from '../conditions/conditions.ts';
import { effectiveSkill, agentCombatantValues, type AgentUpgradeBonus } from '../agents/agents.ts';

/** EQUIP, Item: a Weapon or an Armor that has a price. */
export function isItem(gdr: WeaponGdr | ArmorGdr): boolean {
  return gdr.price !== null;
}

/** The Weapon or Armor GDR an identifier names, or undefined. */
export function equipmentGdr(gdrs: GdrCatalog, id: string): WeaponGdr | ArmorGdr | undefined {
  return gdrs.weapons.get(id) ?? gdrs.armors.get(id);
}

/** EQUIP, Storage: the count of one Item or AmmoType in Storage; absent is 0. */
export function storageCount(world: Pick<CurrentWorldState, 'agency'>, id: string): number {
  return world.agency.state.storage[id] ?? 0;
}

function addToStorage(world: CurrentWorldState, id: string, count: number): void {
  if (count !== 0) {
    world.agency.state.storage[id] = storageCount(world, id) + count;
  }
}

/** EQUIP, Storage: the initial Storage, the rounds `starting_ammo` lists and no Item. */
export function initialStorage(gdrs: GdrCatalog): Record<string, number> {
  return { ...gdrs.equipment.startingAmmo };
}

/** EQUIP, Equipped count: for each Item, the number of Serving Agents wearing it. */
export function equippedCounts(
  agents: readonly Pick<AgentState, 'status' | 'weapon' | 'armor'>[],
  gdrs: GdrCatalog,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    if (!isServing(agent)) {
      continue;
    }
    for (const id of [agent.weapon, agent.armor]) {
      const gdr = equipmentGdr(gdrs, id);
      if (gdr !== undefined && isItem(gdr)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** EQUIP, Unlocked Items: an Item with no `unlocked_by` is Unlocked, else once any Lead it lists is completed. */
export function itemUnlocked(item: WeaponGdr | ArmorGdr, world: ConditionWorld): boolean {
  return item.unlockedBy === null || item.unlockedBy.some((lead) => leadCompletedHolds(lead, world));
}

/** EQUIP, Unlocked Items: every Unlocked Item and AmmoType, by identifier; an AmmoType with an Unlocked Weapon. */
export function unlockedEquipment(world: ConditionWorld, gdrs: GdrCatalog): Set<string> {
  const unlocked = new Set<string>();
  for (const weapon of gdrs.weapons.values()) {
    if (isItem(weapon) && itemUnlocked(weapon, world)) {
      unlocked.add(weapon.id);
      if (weapon.ammoType !== null) {
        unlocked.add(weapon.ammoType);
      }
    }
  }
  for (const armor of gdrs.armors.values()) {
    if (isItem(armor) && itemUnlocked(armor, world)) {
      unlocked.add(armor.id);
    }
  }
  return unlocked;
}

/** EQUIP, Ammo short: for each AmmoType, its rounds, the Serving Agents whose Weapons use it, and whether it is short. */
export interface AmmoNeed {
  readonly ammoType: string;
  readonly rounds: number;
  readonly agents: number;
  readonly needed: number;
  readonly short: boolean;
}

export function ammoNeeds(world: CurrentWorldState, gdrs: GdrCatalog): AmmoNeed[] {
  return [...gdrs.ammoTypes.values()].map((ammoType) => {
    const agents = Object.values(world.agents).filter(
      (agent) => isServing(agent.state) && gdrs.weapons.get(agent.state.weapon)?.ammoType === ammoType.id,
    ).length;
    const rounds = storageCount(world, ammoType.id);
    const needed = gdrs.equipment.ammoShortRoundsPerAgent * agents;
    return { ammoType: ammoType.id, rounds, agents, needed, short: rounds < needed };
  });
}

/** Puts a Weapon or an Armor on an Agent, setting its equipped values; Storage is the caller's business. */
function wear(agent: AgentState, gdr: WeaponGdr | ArmorGdr): void {
  if (gdr.type === 'Weapon') {
    agent.weapon = gdr.id;
    agent.baseWeaponDamage = gdr.damage;
  } else {
    agent.armor = gdr.id;
    agent.baseArmor = gdr.armor;
  }
}

/** EQUIP, Equipping Agents, steps 1 to 3: swaps what the Agent wears of that kind for `gdr`, through Storage. */
export function equip(
  world: CurrentWorldState,
  agent: AgentState,
  gdr: WeaponGdr | ArmorGdr,
  gdrs: GdrCatalog,
): void {
  const worn = equipmentGdr(gdrs, gdr.type === 'Weapon' ? agent.weapon : agent.armor);
  if (worn !== undefined && isItem(worn)) {
    addToStorage(world, worn.id, 1);
  }
  if (isItem(gdr)) {
    addToStorage(world, gdr.id, -1);
  }
  wear(agent, gdr);
}

/** The Fallback Weapon and the Fallback Armor. */
export function fallbacks(gdrs: GdrCatalog): { weapon: WeaponGdr; armor: ArmorGdr } {
  const weapon = gdrs.weapons.get(gdrs.combatParameters.fallbackWeapon);
  const armor = gdrs.armors.get(gdrs.equipment.fallbackArmor);
  if (weapon === undefined || armor === undefined) {
    throw new Error('The Fallback Weapon and Fallback Armor are validated GDRs');
  }
  return { weapon, armor };
}

/**
 * EQUIP, Equipment of new and departing Agents: a Dismissed Agent's Items go into Storage; it keeps their references.
 */
export function returnItemsOf(world: CurrentWorldState, agent: AgentState, gdrs: GdrCatalog): void {
  for (const id of [agent.weapon, agent.armor]) {
    const gdr = equipmentGdr(gdrs, id);
    if (gdr !== undefined && isItem(gdr)) {
      addToStorage(world, id, 1);
    }
  }
}

/** One entry of `buyItems` or `sellItems`: an Item or an AmmoType and a count. */
export interface ItemEntry {
  readonly id: string;
  readonly count: number;
}

/** The `price` of an Item or an AmmoType; undefined for anything else. */
export function priceOf(gdrs: GdrCatalog, id: string): number | undefined {
  const ammo = gdrs.ammoTypes.get(id);
  if (ammo !== undefined) {
    return ammo.price;
  }
  return equipmentGdr(gdrs, id)?.price ?? undefined;
}

/** EQUIP, Buying Items: the cost, Σ price × count. */
export function buyCost(entries: readonly ItemEntry[], gdrs: GdrCatalog): number {
  return entries.reduce((sum, entry) => sum + (priceOf(gdrs, entry.id) ?? 0) * entry.count, 0);
}

/** EQUIP, Selling Items: the Sale value, round down(sale_price_fraction × Σ price × count), rounded once. */
export function saleValue(entries: readonly ItemEntry[], gdrs: GdrCatalog): number {
  return roundDown(gdrs.equipment.salePriceFraction.mul(q(buyCost(entries, gdrs))));
}

/** EQUIP, Buying Items: the entries go into Storage; the caller has checked and charged the cost. */
export function storeBought(world: CurrentWorldState, entries: readonly ItemEntry[]): void {
  for (const entry of entries) {
    addToStorage(world, entry.id, entry.count);
  }
}

/**
 * EQUIP, Selling Items, step 2: the Serving Agents an Item beyond Storage is taken from, in the order the rule takes
 * them, from the lowest effective skill and, among equal, the higher Instance ID number.
 */
export function agentsToStrip(
  world: CurrentWorldState,
  item: string,
  count: number,
  bonus: AgentUpgradeBonus,
  gdrs: GdrCatalog,
): Agent[] {
  const number = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));
  const skill = (agent: Agent): number =>
    effectiveSkill(agentCombatantValues(agent.state, bonus), gdrs.agentParameters);
  return Object.values(world.agents)
    .filter((agent) => isServing(agent.state) && (agent.state.weapon === item || agent.state.armor === item))
    .sort((x, y) => skill(x) - skill(y) || number(y.id) - number(x.id))
    .slice(0, count);
}

/** EQUIP, Selling Items, steps 1 and 2: takes the entries out of Storage and then off Agents, who get the fallbacks. */
export function takeSold(
  world: CurrentWorldState,
  entries: readonly ItemEntry[],
  bonus: AgentUpgradeBonus,
  gdrs: GdrCatalog,
): void {
  const { weapon, armor } = fallbacks(gdrs);
  for (const entry of entries) {
    const fromStorage = Math.min(entry.count, storageCount(world, entry.id));
    addToStorage(world, entry.id, -fromStorage);
    const rest = entry.count - fromStorage;
    if (rest > 0) {
      for (const agent of agentsToStrip(world, entry.id, rest, bonus, gdrs)) {
        wear(agent.state, agent.state.weapon === entry.id ? weapon : armor);
      }
    }
  }
}

/**
 * EQUIP, Mission equipment losses and Spoils of war: settles the Items of a resolved Mission's Team sent by its Combat
 * outcome, and on a win adds every Enemy Weapon that is an Item and its spoils ammo outcome to Storage.
 */
export function settleMissionEquipment(input: {
  readonly world: CurrentWorldState;
  readonly gdrs: GdrCatalog;
  readonly outcome: 'Won' | 'Retreated' | 'Wiped';
  readonly killed: readonly AgentState[];
  readonly survivors: readonly AgentState[];
  readonly enemyWeapons: readonly { readonly enemy: string; readonly weapon: string }[];
  readonly random: Random;
}): MissionEquipmentRecord {
  const { world, gdrs, outcome, random } = input;
  const lost: Record<string, number> = {};
  const returned: Record<string, number> = {};
  const spoils: Record<string, number> = {};
  const count = (into: Record<string, number>, id: string, n = 1): void => {
    if (n > 0) {
      into[id] = (into[id] ?? 0) + n;
    }
  };
  const items = (agent: AgentState): string[] =>
    [agent.weapon, agent.armor].filter((id) => {
      const gdr = equipmentGdr(gdrs, id);
      return gdr !== undefined && isItem(gdr);
    });
  for (const agent of input.killed) {
    for (const id of items(agent)) {
      if (outcome === 'Won') {
        addToStorage(world, id, 1);
        count(returned, id);
      } else {
        count(lost, id);
      }
    }
  }
  if (outcome === 'Wiped') {
    const { weapon, armor } = fallbacks(gdrs);
    for (const agent of input.survivors) {
      for (const id of items(agent)) {
        count(lost, id);
      }
      wear(agent, weapon);
      wear(agent, armor);
    }
  }
  if (outcome === 'Won') {
    for (const { enemy, weapon: id } of input.enemyWeapons) {
      const weapon = gdrs.weapons.get(id);
      if (weapon === undefined || !isItem(weapon)) {
        continue;
      }
      addToStorage(world, weapon.id, 1);
      count(spoils, weapon.id);
      // EQUIP, Spoils of war, step 2: the spoils ammo outcome, uniform from 0 to spoils_ammo_max.
      const rounds = random.uniform(`equipment.spoilsAmmo.${enemy}`, 0, gdrs.equipment.spoilsAmmoMax);
      if (weapon.ammoType !== null) {
        addToStorage(world, weapon.ammoType, rounds);
        count(spoils, weapon.ammoType, rounds);
      }
    }
  }
  return { lost, returned, spoils };
}
