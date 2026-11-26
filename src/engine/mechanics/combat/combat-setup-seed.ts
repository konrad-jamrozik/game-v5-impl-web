/**
 * COMBAT, Combat setup seed: one line of text from which a Detached Combat fights again exactly the Combat it was taken
 * from. It holds both sides' Combatants as explicit values in their fixed order, with an Agent's Weapon and Armor and
 * an Enemy's EnemyArchetype, the rounds at hand of each AmmoType, the Detached seed, and the Game build. Its encoding
 * is this Implementation's: `cs1-` followed by URL-safe Base64 of compact JSON, in which equal consecutive Combatants
 * are written once with their count, so that a Mission site of many equal Enemies stays short.
 */
import { fromBase64Url, seedRng, toBase64Url } from '../../../kernel/index.ts';
import type { CombatantState } from './combat.ts';
import type { DetachedCombatSetup, DetachedExplicitEntry } from './detached-combat.ts';

const PREFIX = 'cs1-';

/** One Combatant of a Combat setup seed: its explicit values, and what they were taken from. */
export interface SetupCombatant {
  /** Base skill, current health, and exhaustion as Decimal quantities; max health, damage, and armor whole. */
  readonly baseSkill: number;
  readonly currentHealth: number;
  readonly effectiveMaxHealth: number;
  readonly exhaustion: number;
  readonly effectiveWeaponDamage: number;
  readonly effectiveArmor: number;
  /** The Weapon it attacks with, whose `ammo_type` an Agent's attacks spend; for an Enemy, the Weapon of its kind. */
  readonly weapon: string;
  /** An Agent's Armor, or an Enemy's EnemyArchetype, which no rule of a Combat reads. */
  readonly kind: string;
}

/** What a Combat setup seed holds. */
export interface CombatSetup {
  readonly gameBuild: string;
  readonly seed: string;
  /** The rounds at hand of each limited AmmoType; an AmmoType left out has no limit. */
  readonly ammo: Readonly<Record<string, number>>;
  readonly agents: readonly SetupCombatant[];
  readonly enemies: readonly SetupCombatant[];
}

/** A Combatant's values in the form a Combat setup seed takes them, from its state in a Combat. */
export function setupCombatant(state: CombatantState, weapon: string, kind: string): SetupCombatant {
  return {
    baseSkill: state.skillHundredths / 100,
    currentHealth: state.currentHealthHundredths / 100,
    effectiveMaxHealth: state.maxHealth,
    exhaustion: state.exactExhaustionHundredths / 100,
    effectiveWeaponDamage: state.weaponDamage,
    effectiveArmor: state.armor,
    weapon,
    kind,
  };
}

type Packed = [number, number, number, number, number, number, number, string, string];

const pack = (combatant: SetupCombatant): Omit<Packed, never> => [
  1,
  Math.round(combatant.baseSkill * 100),
  Math.round(combatant.currentHealth * 100),
  combatant.effectiveMaxHealth,
  Math.round(combatant.exhaustion * 100),
  combatant.effectiveWeaponDamage,
  combatant.effectiveArmor,
  combatant.weapon,
  combatant.kind,
];

/** Equal consecutive Combatants written once with their count. */
function runs(side: readonly SetupCombatant[]): Packed[] {
  const out: Packed[] = [];
  for (const combatant of side) {
    const packed = pack(combatant) as Packed;
    const last = out.at(-1);
    if (last !== undefined && last.slice(1).every((value, index) => value === packed[index + 1])) {
      last[0] += 1;
    } else {
      out.push(packed);
    }
  }
  return out;
}

function unpack(packed: unknown): SetupCombatant[] | null {
  if (!Array.isArray(packed) || packed.length !== 9) return null;
  const [count, skill, health, max, exhaustion, damage, armor, weapon, kind] = packed as unknown[];
  const whole = [count, skill, health, max, exhaustion, damage, armor].every(
    (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  );
  if (!whole || typeof weapon !== 'string' || typeof kind !== 'string' || (count as number) < 1) return null;
  const combatant: SetupCombatant = {
    baseSkill: (skill as number) / 100,
    currentHealth: (health as number) / 100,
    effectiveMaxHealth: max as number,
    exhaustion: (exhaustion as number) / 100,
    effectiveWeaponDamage: damage as number,
    effectiveArmor: armor as number,
    weapon,
    kind,
  };
  return Array.from({ length: count as number }, () => combatant);
}

/** COMBAT, Combat setup seed: the text of a Combat setup. */
export function encodeCombatSetupSeed(setup: CombatSetup): string {
  const json = JSON.stringify({
    b: setup.gameBuild,
    s: setup.seed,
    m: setup.ammo,
    a: runs(setup.agents),
    e: runs(setup.enemies),
  });
  return `${PREFIX}${toBase64Url(json)}`;
}

/** Whether a text is meant as a Combat setup seed rather than a Detached seed. */
export const isCombatSetupSeedText = (text: string): boolean => text.trim().startsWith(PREFIX);

/** COMBAT, Combat setup seed: the Combat setup a text holds, or null when it is not a Combat setup seed. */
export function decodeCombatSetupSeed(text: string): CombatSetup | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length)));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const side = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    const all: SetupCombatant[] = [];
    for (const packed of value) {
      const combatants = unpack(packed);
      if (combatants === null) return null;
      all.push(...combatants);
    }
    return all;
  };
  const agents = side(record['a']);
  const enemies = side(record['e']);
  const ammo = record['m'];
  if (
    agents === null ||
    enemies === null ||
    typeof record['b'] !== 'string' ||
    typeof record['s'] !== 'string' ||
    typeof ammo !== 'object' ||
    ammo === null ||
    !Object.values(ammo).every((rounds) => Number.isSafeInteger(rounds) && (rounds as number) >= 0)
  ) {
    return null;
  }
  return { gameBuild: record['b'], seed: record['s'], ammo: ammo as Record<string, number>, agents, enemies };
}

const explicit = (combatant: SetupCombatant, side: 'agent' | 'enemy'): DetachedExplicitEntry => ({
  kind: 'explicit',
  baseSkill: combatant.baseSkill,
  currentHealth: combatant.currentHealth,
  effectiveMaxHealth: combatant.effectiveMaxHealth,
  exhaustion: combatant.exhaustion,
  effectiveWeaponDamage: combatant.effectiveWeaponDamage,
  effectiveArmor: combatant.effectiveArmor,
  ...(side === 'agent' ? { weapon: combatant.weapon } : {}),
});

/** The setup of the Detached Combat that fights a Combat setup again. */
export function setupOfCombatSetup(setup: CombatSetup): DetachedCombatSetup {
  return {
    agents: setup.agents.map((combatant) => explicit(combatant, 'agent')),
    enemies: setup.enemies.map((combatant) => explicit(combatant, 'enemy')),
    ammo: setup.ammo,
    seed: setup.seed,
  };
}

/**
 * COMBAT, Combat setup seed, A Mission's Combat: the Detached seed of the Combat of a Mission, derived from the Campaign
 * seed and the Mission's Instance ID, so that every random outcome of the Campaign still derives from its Campaign seed
 * alone. It is a permitted Campaign seed: `m` and 16 hexadecimal digits.
 */
export function missionCombatSeed(campaignSeed: string, mission: string): string {
  const { key } = seedRng(`${campaignSeed}\u0000combat\u0000${mission}`);
  return `m${key
    .slice(0, 2)
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('')}`;
}
