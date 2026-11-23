/**
 * COMBAT, Detached Combat: `developer.tools.fightCombat(setup)` has one Combat fought on what its caller supplies and
 * changes nothing; COMBAT, Batch of Detached Combats: `developer.tools.fightCombatBatch(setup, count)` has `count` of
 * them fought, each with the Detached seed `<seed>#<i>`, and keeps only their Combat summaries. Under REUSE, Shared implementation, it adds around the one implementation of Fighting a Combat,
 * `fightCombat` in `combat.ts`, only the building of its inputs from the setup, the derivation of its random outcomes
 * from the Detached seed, and the return of its outputs instead of their application to a World state.
 */
import { isPermittedSeed, must, seedRng } from '../../../kernel/index.ts';
import { withCombatGdrValues, type GdrCatalog } from '../../../gdr/index.ts';
import { seededRandom, type Random } from '../../random.ts';
import { reject, type Rejection } from '../../result.ts';
import { isServing, type CurrentWorldState } from '../../state/types.ts';
import { agentUpgradeBonus } from '../economy/economy.ts';
import { createEnemy, createMissionSite } from '../missions/missions.ts';
import {
  agentCombatantState,
  enemyCombatantState,
  fightCombat,
  fightCombatSummary,
  type CombatInputs,
  type CombatSummary,
  type CombatantState,
  type FoughtCombatReport,
} from './combat.ts';

/** COMBAT, Detached Combat: a Combatant given by explicit values. */
export interface DetachedExplicitEntry {
  readonly kind: 'explicit';
  /** A Decimal quantity for an Agent, a whole number for an Enemy; at least 0. */
  readonly baseSkill: number;
  /** From 0 to the effective max health; a Decimal quantity for an Agent, a whole number for an Enemy. */
  readonly currentHealth: number;
  /** A whole number of at least 1. */
  readonly effectiveMaxHealth: number;
  /** A whole number of at least 0. */
  readonly exhaustion: number;
  /** A whole number of at least 1. */
  readonly effectiveWeaponDamage: number;
  /** A whole number of at least 0; 0 when the entry leaves it out. */
  readonly effectiveArmor?: number;
}

/** An entry of the Agents' side: an Agent of the Current campaign by Instance ID, or explicit values. */
export type DetachedAgentEntry = { readonly kind: 'agent'; readonly id: string } | DetachedExplicitEntry;

/**
 * An entry of the Enemies' side: an Enemy of the Current campaign by Instance ID, an EnemyArchetype by identifier, or
 * explicit values.
 */
export type DetachedEnemyEntry =
  | { readonly kind: 'enemy'; readonly id: string }
  | { readonly kind: 'enemyArchetype'; readonly id: string }
  | DetachedExplicitEntry;

/** COMBAT, Detached Combat: the setup of `developer.tools.fightCombat(setup)`. */
export interface DetachedCombatSetup {
  /** The Agents' side, one or more entries in its fixed order. */
  readonly agents: readonly DetachedAgentEntry[];
  /**
   * The Enemies' side, zero or more entries in its fixed order, or a MissionSiteArchetype, which contributes one
   * EnemyArchetype entry for each Enemy a new Mission site of it would have, in their creation order.
   */
  readonly enemies: readonly DetachedEnemyEntry[] | { readonly missionSiteArchetype: string };
  /**
   * A value for any GDR value a Combat reads, by authored name, e.g. `{ "incapacitation_skill_fraction": 0.2 }`; every
   * other one is the Game build's. A decimal value may be given as a number or as its text.
   */
  readonly gdrValues?: Readonly<Record<string, number | string>>;
  /**
   * COMBAT, Detached Combat, Ammo: the rounds at hand of any AmmoType, by identifier; an AmmoType left out has no limit.
   * An Agent by Instance ID spends its Weapon's `ammo_type`; an Agent of explicit values none.
   */
  readonly ammo?: Readonly<Record<string, number>>;
  /** The Detached seed: a permitted Campaign seed, from which every random outcome derives. */
  readonly seed: string;
}

/**
 * COMBAT, Detached Combat, Outputs: one participant, identified by its side and position, because a participant given
 * by explicit values has no Instance ID.
 */
export interface DetachedCombatParticipant {
  /** The identifier the Combat report and its Combat log use for the participant, e.g. `agent#1`. */
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  /** Its position in the fixed order of its side, from 1. */
  readonly position: number;
  /** The Instance ID or identifier its entry named; none for explicit values. */
  readonly named: { readonly kind: 'agent' | 'enemy' | 'enemyArchetype'; readonly id: string } | null;
  readonly finalCurrentHealthHundredths: number;
  readonly finalExhaustion: number;
  readonly dead: boolean;
}

/** COMBAT, Detached Combat, Outputs: the Combat summary, the Combat report, which has no Mission, and each participant's final values. */
export interface DetachedCombatResult {
  readonly summary: CombatSummary;
  readonly combatReport: FoughtCombatReport;
  readonly participants: readonly DetachedCombatParticipant[];
}

/** COMBAT, Batch of Detached Combats, Outputs: each Combat's summary in order of `i`, and the totals over the batch. */
export interface DetachedCombatBatchResult {
  readonly combats: readonly CombatSummary[];
  readonly totals: {
    /** The number of Combats fought, fewer than `count` when `stop` ended the batch early. */
    readonly fought: number;
    readonly won: number;
    readonly retreated: number;
    readonly wiped: number;
    readonly agentsDead: number;
  };
}

/**
 * COMBAT, Batch of Detached Combats, Stop: the batch ends after the Combat at which the number Won reaches
 * `won`, or the number Retreated or Wiped reaches `notWon`.
 */
export interface DetachedCombatBatchStop {
  readonly won?: number;
  readonly notWon?: number;
}

/** COMBAT, Batch of Detached Combats: the largest `count` of one batch. */
export const BATCH_MAX_COUNT = 10_000;

/** The inputs a valid setup builds, with the identification of each participant. */
export interface DetachedCombat {
  readonly inputs: CombatInputs;
  readonly participants: readonly Pick<DetachedCombatParticipant, 'id' | 'side' | 'position' | 'named'>[];
  readonly seed: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-negative number with at most two digits after the decimal point, in hundredths; null otherwise. */
function hundredthsOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const hundredths = Math.round(value * 100);
  return Number.isSafeInteger(hundredths) && Math.abs(hundredths - value * 100) < 1e-6 ? hundredths : null;
}

function isWhole(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

/**
 * COMBAT, Detached Combat, Valid setup, with AGENT, Attribute ranges: explicit values as a Combat reads them, or the
 * name of the first value outside its range for its side.
 */
function explicitState(entry: Record<string, unknown>, side: 'agent' | 'enemy'): CombatantState | string {
  const maxHealth = entry['effectiveMaxHealth'];
  if (!isWhole(maxHealth, 1) || maxHealth > 1_000_000_000) {
    return 'effectiveMaxHealth must be a whole number of at least 1';
  }
  const skill =
    side === 'agent'
      ? hundredthsOf(entry['baseSkill'])
      : isWhole(entry['baseSkill'], 0)
        ? entry['baseSkill'] * 100
        : null;
  if (skill === null) {
    return side === 'agent'
      ? 'baseSkill must be at least 0, with at most two digits after the decimal point'
      : 'baseSkill must be a whole number of at least 0';
  }
  const health =
    side === 'agent'
      ? hundredthsOf(entry['currentHealth'])
      : isWhole(entry['currentHealth'], 0)
        ? entry['currentHealth'] * 100
        : null;
  if (health === null || health > maxHealth * 100) {
    return side === 'agent'
      ? 'currentHealth must be from 0 to effectiveMaxHealth, with at most two digits after the decimal point'
      : 'currentHealth must be a whole number from 0 to effectiveMaxHealth';
  }
  const exhaustion = entry['exhaustion'];
  if (!isWhole(exhaustion, 0) || !Number.isSafeInteger(exhaustion * 100)) {
    return 'exhaustion must be a whole number of at least 0';
  }
  const weaponDamage = entry['effectiveWeaponDamage'];
  if (!isWhole(weaponDamage, 1)) {
    return 'effectiveWeaponDamage must be a whole number of at least 1';
  }
  // COMBAT, Detached Combat: effective armor is 0 when the entry leaves it out.
  const armor = entry['effectiveArmor'] ?? 0;
  if (!isWhole(armor, 0)) {
    return 'effectiveArmor must be a whole number of at least 0';
  }
  return {
    skillHundredths: skill,
    currentHealthHundredths: health,
    maxHealth,
    exactExhaustionHundredths: exhaustion * 100,
    weaponDamage,
    armor,
  };
}

/**
 * COMBAT, Detached Combat: builds the inputs of a Detached Combat from its setup, reading the Current world state and
 * the Game build only for what the setup names, or rejects the setup by its first fault.
 */
export function buildDetachedCombat(
  world: CurrentWorldState,
  gdrs: GdrCatalog,
  setup: unknown,
): DetachedCombat | Rejection {
  const malformed = (message: string) => reject('malformed_setup', message, 'invalid_input');
  if (!isRecord(setup)) {
    return malformed('The setup must be an object with agents, enemies, and seed.');
  }
  const agentEntries = setup['agents'];
  if (!Array.isArray(agentEntries)) {
    return malformed('agents must be a list of entries.');
  }
  if (agentEntries.length === 0) {
    return reject('empty_agents_side', "The Agents' side must hold at least one entry.");
  }
  let enemyEntries: unknown[];
  const enemiesPart = setup['enemies'];
  if (Array.isArray(enemiesPart)) {
    enemyEntries = enemiesPart;
  } else if (isRecord(enemiesPart) && typeof enemiesPart['missionSiteArchetype'] === 'string') {
    const archetypeId = enemiesPart['missionSiteArchetype'];
    const archetype = gdrs.missionSiteArchetypes.find((item) => item.id === archetypeId);
    if (archetype === undefined) {
      return reject('unknown_mission_site_archetype', `There is no MissionSiteArchetype ${archetypeId}.`);
    }
    // MISSION, Mission site creation and Enemy creation: the Enemies a new Mission site of it would have.
    let sequence = 0;
    const { enemies } = createMissionSite({
      newId: (type) => `${type}-${(sequence += 1)}`,
      archetype,
      origin: { kind: 'Investigation', investigation: '' },
      targetFaction: '',
      turn: world.turn,
      enemyArchetypes: gdrs.enemyArchetypes,
      weapons: gdrs.weapons,
      armors: gdrs.armors,
      combat: gdrs.combatParameters,
      agentParameters: gdrs.agentParameters,
    });
    enemyEntries = enemies.map((enemy) => ({ kind: 'enemyArchetype', id: enemy.archetype }));
  } else {
    return malformed('enemies must be a list of entries or an object with missionSiteArchetype.');
  }

  const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
  const named = new Set<string>();
  const participants: DetachedCombat['participants'][number][] = [];
  const agents: CombatInputs['agents'][number][] = [];
  const enemies: CombatInputs['enemies'][number][] = [];
  const sides: ['agent' | 'enemy', unknown[]][] = [
    ['agent', agentEntries],
    ['enemy', enemyEntries],
  ];
  for (const [side, entries] of sides) {
    for (const [index, entry] of entries.entries()) {
      const position = index + 1;
      const id = `${side}#${position}`;
      const where = `${side === 'agent' ? "Agents' side" : "Enemies' side"} entry ${position}`;
      if (!isRecord(entry) || typeof entry['kind'] !== 'string') {
        return malformed(`${where} must be an object with a kind.`);
      }
      const kind = entry['kind'];
      let state: CombatantState;
      let ammoType: string | null = null;
      let entryName: DetachedCombatParticipant['named'] = null;
      if (kind === 'explicit') {
        const explicit = explicitState(entry, side);
        if (typeof explicit === 'string') {
          return reject('value_out_of_range', `${where}: ${explicit}.`);
        }
        state = explicit;
      } else if (typeof entry['id'] !== 'string') {
        return malformed(`${where} must name an id.`);
      } else if (side === 'agent' && kind === 'agent') {
        const agent = world.agents[entry['id']];
        if (agent === undefined) {
          return reject('unknown_agent', `${where}: there is no Agent ${entry['id']}.`);
        }
        if (!isServing(agent.state)) {
          return reject('agent_not_serving', `${where}: Agent ${agent.id} is not Serving.`);
        }
        state = agentCombatantState(agent.state, bonus);
        ammoType = gdrs.weapons.get(agent.state.weapon)?.ammoType ?? null;
        entryName = { kind: 'agent', id: agent.id };
      } else if (side === 'enemy' && kind === 'enemy') {
        const enemy = world.enemies[entry['id']];
        if (enemy === undefined) {
          return reject('unknown_enemy', `${where}: there is no Enemy ${entry['id']}.`);
        }
        state = enemyCombatantState(enemy.state);
        entryName = { kind: 'enemy', id: enemy.id };
      } else if (side === 'enemy' && kind === 'enemyArchetype') {
        const archetype = gdrs.enemyArchetypes.get(entry['id']);
        if (archetype === undefined) {
          return reject('unknown_enemy_archetype', `${where}: there is no EnemyArchetype ${entry['id']}.`);
        }
        // COMBAT, Enemy creation: the values a new Enemy of the EnemyArchetype has.
        const weapon = must(gdrs.weapons.get(archetype.weapon), `Weapon ${archetype.weapon}`);
        const armor = must(gdrs.armors.get(archetype.armor), `Armor ${archetype.armor}`);
        state = enemyCombatantState(createEnemy(id, '', archetype, weapon, armor).state);
        entryName = { kind: 'enemyArchetype', id: archetype.id };
      } else {
        return malformed(`${where} has the kind ${kind}, which its side does not take.`);
      }
      if (entryName !== null && entryName.kind !== 'enemyArchetype') {
        if (named.has(entryName.id)) {
          return reject('duplicate_combatant', `${where}: ${entryName.id} appears twice.`);
        }
        named.add(entryName.id);
      }
      participants.push({ id, side, position, named: entryName });
      (side === 'agent' ? agents : enemies).push({ id, state, ammoType });
    }
  }

  const gdrValues = setup['gdrValues'] ?? {};
  if (!isRecord(gdrValues)) {
    return malformed('gdrValues must be an object of GDR values by authored name.');
  }
  const values = withCombatGdrValues(
    { combat: gdrs.combatParameters, agent: gdrs.agentParameters },
    gdrValues,
  );
  if ('problem' in values) {
    return reject('invalid_gdr_value', `GDR values: ${values.problem}.`);
  }
  const ammoPart = setup['ammo'] ?? {};
  if (
    !isRecord(ammoPart) ||
    !Object.entries(ammoPart).every(
      ([id, rounds]) => gdrs.ammoTypes.has(id) && Number.isSafeInteger(rounds) && (rounds as number) >= 0,
    )
  ) {
    return malformed('ammo must be an object of whole rounds of at least 0 by AmmoType.');
  }
  const seed = setup['seed'];
  if (!isPermittedSeed(seed)) {
    return reject(
      'invalid_seed',
      'The Detached seed must be a permitted Campaign seed: 1 to 64 printable ASCII characters, i.e. characters from the space to the tilde.',
    );
  }
  return {
    inputs: {
      agents,
      enemies,
      combat: values.combat,
      agentParameters: values.agent,
      ammo: new Map(Object.entries(ammoPart as Record<string, number>)),
      fallbackWeaponDamage: must(gdrs.weapons.get(gdrs.combatParameters.fallbackWeapon), 'Fallback Weapon')
        .damage,
    },
    participants,
    seed,
  };
}

/**
 * COMBAT, Detached Combat, Random outcomes: every random outcome derives from the Detached seed alone. No random
 * outcome of the Current campaign is drawn, and no random outcome override applies. The seed takes no prefix: it is
 * derived as a Campaign seed is, so a Detached seed equal to a Campaign seed repeats that Campaign's first draws, which
 * lets the Agreement test of REUSE supply equal random outcomes without a second random source.
 */
export function detachedRandom(seed: string): Random {
  return seededRandom(seedRng(seed), []);
}

/**
 * COMBAT, Detached Combat, Outputs: fights the Combat by the one implementation of Fighting a Combat and returns its
 * outputs, applied to nothing. `random` is the source of its random outcomes, `detachedRandom` of its seed in play.
 */
export function fightDetachedCombat(combat: DetachedCombat, random: Random): DetachedCombatResult {
  const outputs = fightCombat(combat.inputs, random);
  const finals = [...outputs.agents, ...outputs.enemies];
  return {
    summary: outputs.summary,
    combatReport: outputs.report,
    participants: combat.participants.map((participant, index) => {
      const final = must(finals[index], 'final values of a participant');
      const reported = must(outputs.report.participants[index], 'Combat report participant');
      return {
        ...participant,
        finalCurrentHealthHundredths: final.currentHealthHundredths,
        finalExhaustion: reported.final.exhaustion,
        dead: reported.final.condition === 'dead',
      };
    }),
  };
}

/** `developer.tools.fightCombat(setup)`: a Detached Combat on the Current world state, or the rejection of its setup. */
export function detachedCombat(
  world: CurrentWorldState,
  gdrs: GdrCatalog,
  setup: unknown,
): DetachedCombatResult | Rejection {
  const combat = buildDetachedCombat(world, gdrs, setup);
  return 'rejected' in combat ? combat : fightDetachedCombat(combat, detachedRandom(combat.seed));
}

/**
 * `developer.tools.fightCombatBatch(setup, count)`: COMBAT, Batch of Detached Combats. Combat `i` is the Detached Combat
 * that `fightCombat` fights on `setup` with the Detached seed `<seed>#<i>`, fought with the Combat report turned off (COMBAT, Fighting a Combat, Recording);
 * every Combat starts from the values the setup names, because a Detached Combat applies its outputs to nothing.
 */
export function detachedCombatBatch(
  world: CurrentWorldState,
  gdrs: GdrCatalog,
  setup: unknown,
  count: unknown,
  stop?: unknown,
): DetachedCombatBatchResult | Rejection {
  const combat = buildDetachedCombat(world, gdrs, setup);
  if ('rejected' in combat) {
    return combat;
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > BATCH_MAX_COUNT) {
    return reject(
      'invalid_count',
      `count must be a whole number from 1 to ${BATCH_MAX_COUNT}.`,
      'invalid_input',
    );
  }
  let stopAt = { won: Infinity, notWon: Infinity };
  if (stop !== undefined && stop !== null) {
    const isLimit = (value: unknown): value is number =>
      typeof value === 'number' && Number.isInteger(value) && value >= 1;
    const keys = typeof stop === 'object' && !Array.isArray(stop) ? Object.keys(stop) : null;
    const given = (stop ?? {}) as Record<string, unknown>;
    if (
      keys === null ||
      keys.some((key) => key !== 'won' && key !== 'notWon') ||
      keys.some((key) => !isLimit(given[key]))
    ) {
      return reject(
        'invalid_stop',
        'stop may hold only won and notWon, each a whole number of at least 1.',
        'invalid_input',
      );
    }
    stopAt = {
      won: isLimit(given['won']) ? given['won'] : Infinity,
      notWon: isLimit(given['notWon']) ? given['notWon'] : Infinity,
    };
  }
  if (!isPermittedSeed(`${combat.seed}#${count}`)) {
    return reject(
      'invalid_seed',
      `The Detached seed of the batch's last Combat, ${combat.seed}#${count}, is not a permitted Campaign seed: it may hold at most 64 characters.`,
    );
  }
  const combats: CombatSummary[] = [];
  const totals = { won: 0, retreated: 0, wiped: 0, agentsDead: 0 };
  for (let i = 1; i <= count; i += 1) {
    const summary = fightCombatSummary(combat.inputs, detachedRandom(`${combat.seed}#${i}`));
    combats.push(summary);
    totals.agentsDead += summary.agentsDead;
    if (summary.outcome === 'Won') {
      totals.won += 1;
    } else if (summary.outcome === 'Retreated') {
      totals.retreated += 1;
    } else {
      totals.wiped += 1;
    }
    // COMBAT, Batch of Detached Combats, Stop.
    if (totals.won >= stopAt.won || totals.retreated + totals.wiped >= stopAt.notWon) {
      break;
    }
  }
  return { combats, totals: { fought: combats.length, ...totals } };
}
