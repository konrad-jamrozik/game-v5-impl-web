/**
 * BASICAI, Equipping: which Weapon and Armor each Serving Agent is to wear. The best gear goes to the strongest Agents,
 * and an Agent gets a Weapon only while Storage has `ammo_short_rounds_per_agent` rounds of its AmmoType for it on top
 * of those of the Agents before it, because a Combat rating reads the Weapon, never the Ammo.
 */
import type { AgentView, EquipmentView } from '../../engine/player-api.ts';

/** How rounds limit the plan: as in Storage, with unlimited rounds of every Unlocked AmmoType, or unlimited. */
export type AmmoMode = 'storage' | 'buying' | 'unlimited';

export interface Kit {
  readonly weapon: string;
  readonly armor: string;
}

export interface EquipmentPlan {
  /** By Agent ID. */
  readonly kit: ReadonlyMap<string, Kit>;
  /** The Agents the plan gives each Item, by Item ID. */
  readonly wearers: ReadonlyMap<string, number>;
  /** The Agents the plan gives a Weapon of each AmmoType, by AmmoType ID. */
  readonly carriers: ReadonlyMap<string, number>;
}

/** The number of an Instance ID, e.g. 12 for `agent-12`. */
export const instanceNumber = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));

/** BASICAI, Glossary, Agent order: the highest base skill first, ties by the lower Instance ID. */
export const byAgentOrder = (a: AgentView, b: AgentView): number =>
  b.skillHundredths - a.skillHundredths || instanceNumber(a.id) - instanceNumber(b.id);

/** BASICAI, Equipping: the Deployed Agents first, then the others, each in Agent order. */
export const byDeployedFirst = (a: AgentView, b: AgentView): number =>
  Number(b.assignment?.kind === 'Deployed') - Number(a.assignment?.kind === 'Deployed') || byAgentOrder(a, b);

/** The Equipping plan of `agents`, which are given out in Agent order, or in the order `compare` gives. */
export function planEquipment(
  agents: readonly AgentView[],
  equipment: EquipmentView,
  mode: AmmoMode,
  compare: (a: AgentView, b: AgentView) => number = byAgentOrder,
): EquipmentPlan {
  const ordered = [...agents].sort(compare);
  const rounds = new Map<string, number>();
  for (const item of equipment.items) {
    if (item.kind === 'ammo') {
      const unlimited = mode === 'unlimited' || (mode === 'buying' && item.unlocked);
      rounds.set(item.id, unlimited ? Infinity : item.available);
    }
  }
  const per = equipment.ammoShortRoundsPerAgent;
  const pool = (kind: 'weapon' | 'armor') =>
    equipment.items
      .filter((item) => item.kind === kind && item.owned > 0)
      .map((item, index) => ({ item, index, left: item.owned }))
      .sort((a, b) => (b.item.stat ?? 0) - (a.item.stat ?? 0) || a.index - b.index);
  const weapons = pool('weapon');
  const armors = pool('armor');
  const kit = new Map<string, Kit>();
  const wearers = new Map<string, number>();
  const carriers = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const agent of ordered) {
    let weapon = equipment.fallbackWeapon;
    for (const entry of weapons) {
      const ammoType = entry.item.ammoType;
      if (entry.left === 0 || (ammoType !== null && (rounds.get(ammoType) ?? 0) < per)) {
        continue;
      }
      entry.left -= 1;
      weapon = entry.item.id;
      bump(wearers, weapon);
      if (ammoType !== null) {
        rounds.set(ammoType, (rounds.get(ammoType) ?? 0) - per);
        bump(carriers, ammoType);
      }
      break;
    }
    let armor = equipment.fallbackArmor;
    const best = armors.find((entry) => entry.left > 0);
    if (best !== undefined) {
      best.left -= 1;
      armor = best.item.id;
      bump(wearers, armor);
    }
    kit.set(agent.id, { weapon, armor });
  }
  return { kit, wearers, carriers };
}

/** The `base_weapon_damage` or `base_armor` of an Item, or of the Fallback Weapon or Fallback Armor. */
export function statOf(equipment: EquipmentView, id: string): number {
  if (id === equipment.fallbackWeapon) {
    return equipment.fallbackWeaponDamage;
  }
  if (id === equipment.fallbackArmor) {
    return equipment.fallbackArmorValue;
  }
  return equipment.items.find((item) => item.id === id)?.stat ?? 0;
}
