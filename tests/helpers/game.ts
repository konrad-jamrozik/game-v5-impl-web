/** Helpers for testing the Mechanics rules directly on Campaign state, with injected random outcomes. */
import { produce } from 'immer';
import { expect } from 'vitest';
import { advanceTurnOf, applyActionTo } from '../../src/engine/game-rules.ts';
import { damageBounds, type Combatant } from '../../src/engine/mechanics/combat/combat.ts';
import { createMissionSite } from '../../src/engine/mechanics/missions/missions.ts';
import { injectedRandom, seededRandom, type Random } from '../../src/engine/random.ts';
import { isRejection, type Rejection } from '../../src/engine/result.ts';
import { createCampaignState } from '../../src/engine/state/create.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import {
  isServing,
  type Agent,
  type AgentState,
  type AgentStatus,
  type CampaignState,
  type CurrentWorldState,
  type Faction,
} from '../../src/engine/state/types.ts';
import { newInstanceId, type ProcessingOrder } from '../../src/engine/turn/advance.ts';
import { RAW_GDR_FILES, bootstrapGdrCatalog, buildGdrCatalog, type GdrCatalog } from '../../src/gdr/index.ts';
import { seedRng } from '../../src/kernel/index.ts';

export const gdrs = bootstrapGdrCatalog();

export type Injected = Record<string, (number | boolean | string)[]>;

/** A new Campaign from the preset `standard`, with Red Dawn's countdowns set so that nothing happens by itself. */
export function newCampaign(
  options: { money?: number; funding?: number; catalog?: GdrCatalog; quietFactions?: boolean } = {},
): CampaignState {
  const catalog = options.catalog ?? gdrs;
  const state = createCampaignState(
    { startingMoney: options.money ?? 500, startingFunding: options.funding ?? 20 },
    'test seed',
    catalog,
  );
  if (options.quietFactions === false) {
    return state;
  }
  return tweak(state, (world) => {
    for (const faction of Object.values(world.factions)) {
      faction.state.turnsUntilNextOperation = 10_000;
      if (faction.state.turnsUntilNextLevel !== null) {
        faction.state.turnsUntilNextLevel = 10_000;
      }
    }
  });
}

/** Changes Campaign state directly, to build the initial state an acceptance example states. */
export function tweak(state: CampaignState, change: (world: CurrentWorldState) => void): CampaignState {
  return produce(state, (draft) => {
    change(draft.world.current);
  });
}

export function tryAct(
  state: CampaignState,
  name: string,
  args: Record<string, unknown> = {},
  surface: 'player' | 'developer' = 'player',
  catalog: GdrCatalog = gdrs,
): CampaignState | Rejection {
  return applyActionTo(state, { surface, name, args }, catalog);
}

/** Applies an action that must be accepted, and checks every invariant of the resulting Committed state. */
export function act(
  state: CampaignState,
  name: string,
  args: Record<string, unknown> = {},
  surface: 'player' | 'developer' = 'player',
  catalog: GdrCatalog = gdrs,
): CampaignState {
  const next = tryAct(state, name, args, surface, catalog);
  if (isRejection(next)) {
    throw new Error(`Expected ${name} to be accepted: ${next.message}`);
  }
  expect(checkInvariants(next, catalog)).toEqual([]);
  return next;
}

/** Expects an action to be rejected with the given reason, leaving Campaign state unchanged. */
export function expectRejected(
  state: CampaignState,
  name: string,
  args: Record<string, unknown>,
  reason: string,
  surface: 'player' | 'developer' = 'player',
  catalog: GdrCatalog = gdrs,
): void {
  const result = tryAct(state, name, args, surface, catalog);
  expect(isRejection(result) ? result.reason : 'accepted').toBe(reason);
}

/** A random source that takes each named outcome from `injected` and every other outcome from the seed. */
export function randomFor(state: CampaignState, injected: Injected = {}): Random & { used: string[] } {
  return injectedRandom(injected, seededRandom(seedRng(`fallback ${state.world.current.turn}`), []));
}

/** Commits Advance turn with injected named random outcomes and checks every invariant of the result. */
export function advance(
  state: CampaignState,
  injected: Injected = {},
  catalog: GdrCatalog = gdrs,
  order?: ProcessingOrder,
): CampaignState {
  const next = advanceTurnOf(state, catalog, randomFor(state, injected), order);
  if (isRejection(next)) {
    throw new Error(`Expected Advance turn to be accepted: ${next.message}`);
  }
  expect(checkInvariants(next, catalog)).toEqual([]);
  return next;
}

export function agents(state: CampaignState): Agent[] {
  return Object.values(state.world.current.agents);
}

export function agentIds(state: CampaignState): string[] {
  return Object.keys(state.world.current.agents);
}

export function agent(state: CampaignState, id: string): Agent {
  const found = state.world.current.agents[id];
  if (!found) {
    throw new Error(`No Agent ${id}`);
  }
  return found;
}

export function onlyFaction(state: CampaignState): Faction {
  const [faction] = Object.values(state.world.current.factions);
  if (!faction) {
    throw new Error('No Faction');
  }
  return faction;
}

export function money(state: CampaignState): number {
  return state.world.current.agency.state.money;
}

export function funding(state: CampaignState): number {
  return state.world.current.agency.state.funding;
}

/** The Agent status of a Serving Agent that has arrived at its Current assignment: Recovering on Recovery. */
export function arrivedStatus(agent: Pick<AgentState, 'assignment'>): AgentStatus {
  return agent.assignment?.kind === 'Recovery' ? 'Recovering' : 'AtAssignment';
}

/** Lets a Serving Agent arrive at its Current assignment directly; other Agents are left unchanged. */
export function arriveAgent(agent: AgentState): void {
  if (isServing(agent)) {
    agent.status = arrivedStatus(agent);
  }
}

/** Sets Agents' Current assignment and Agent status directly; arrived means At assignment or Recovering. */
export function setAssignment(
  state: CampaignState,
  ids: readonly string[],
  kind: 'Standby' | 'Contracting' | 'Training' | 'Recovery',
  transit: 'Arrived' | 'InTransit' = 'Arrived',
): CampaignState {
  return tweak(state, (world) => {
    for (const id of ids) {
      const found = world.agents[id];
      if (found) {
        found.state.assignment = { kind };
        found.state.status = transit === 'InTransit' ? 'InTransit' : arrivedStatus(found.state);
      }
    }
  });
}

/** Adds Agents by the cheat operation and lets them arrive, so that they are on Standby, At assignment. */
export function withAgents(state: CampaignState, total: number, catalog: GdrCatalog = gdrs): CampaignState {
  const missing = total - agents(state).length;
  if (missing <= 0) {
    return state;
  }
  const added = act(state, 'addAgents', { count: missing }, 'developer', catalog);
  return tweak(added, (world) => {
    for (const item of Object.values(world.agents)) {
      arriveAgent(item.state);
    }
  });
}

/** Adds an Active Mission site of the given MissionSiteArchetype, with the origin its kind needs. */
export function addMissionSite(
  state: CampaignState,
  archetypeId: string,
  options: { turnsUntilExpiration?: number; lead?: string; catalog?: GdrCatalog } = {},
): { state: CampaignState; site: string } {
  const catalog = options.catalog ?? gdrs;
  const archetype = catalog.missionSiteArchetypes.find((item) => item.id === archetypeId);
  if (!archetype) {
    throw new Error(`No MissionSiteArchetype ${archetypeId}`);
  }
  let siteId = '';
  const next = tweak(state, (world) => {
    const faction = Object.values(world.factions)[0];
    if (!faction) {
      throw new Error('No Faction');
    }
    let origin;
    if (archetype.kind === 'initiative') {
      const lead =
        options.lead ??
        catalog.leads.find((item) => item.onCompletion.createMissionSite === archetype.id)?.id;
      if (!lead) {
        throw new Error(`No Lead creates ${archetype.id}`);
      }
      const investigation = newInstanceId(world, 'investigation');
      world.investigations[investigation] = {
        id: investigation,
        archetype: catalog.investigationArchetype.id,
        constants: { lead, turnStarted: Math.max(1, world.turn - 1) },
        state: { lifecycle: 'Completed', progress: 0, currentTeam: [] },
      };
      origin = { kind: 'Investigation' as const, investigation };
    } else {
      const level = catalog.factionOperationLevels.find((item) => item.level === archetype.operationLevel);
      if (!level) {
        throw new Error('No FactionOperationLevel');
      }
      origin = { kind: 'FactionOperation' as const, initiatingFaction: faction.id, operationLevel: level.id };
    }
    const { site, enemies } = createMissionSite({
      newId: (type) => newInstanceId(world, type),
      archetype,
      origin,
      targetFaction: faction.id,
      turn: Math.max(1, world.turn - 1),
      enemyArchetypes: catalog.enemyArchetypes,
      weapons: catalog.weapons,
    });
    site.state.turnsUntilExpiration = options.turnsUntilExpiration ?? archetype.expiresInTurns;
    world.missionSites[site.id] = site;
    for (const enemy of enemies) {
      world.enemies[enemy.id] = enemy;
    }
    siteId = site.id;
  });
  return { state: next, site: siteId };
}

/** The Mission at a Mission site. */
export function missionAt(state: CampaignState, site: string): string {
  const found = Object.values(state.world.current.missions).find(
    (item) => item.constants.missionSite === site,
  );
  if (!found) {
    throw new Error(`No Mission at ${site}`);
  }
  return found.id;
}

/** Injected outcomes that make every attack of the given Combatants a hit for the highest damage, or a miss. */
export function allHit(ids: readonly string[], damage: number, attacks = 400): Injected {
  const injected: Injected = {};
  for (const id of ids) {
    injected[`combat.hit.${id}`] = new Array<boolean>(attacks).fill(true);
    injected[`combat.damage.${id}`] = new Array<number>(attacks).fill(damage);
  }
  return injected;
}

export function allMiss(ids: readonly string[], attacks = 400): Injected {
  const injected: Injected = {};
  for (const id of ids) {
    injected[`combat.hit.${id}`] = new Array<boolean>(attacks).fill(false);
  }
  return injected;
}

/** Every attack of each given Combatant hits for the highest damage its weapon damage allows. */
function hitHardest(state: CampaignState, ids: readonly string[]): Injected {
  const world = state.world.current;
  const injected: Injected = {};
  for (const id of ids) {
    const weaponDamage = (world.agents[id] ?? world.enemies[id])?.state.weaponDamage ?? 1;
    Object.assign(injected, allHit([id], damageBounds(weaponDamage, gdrs.combatParameters).hi));
  }
  return injected;
}

/** Injected outcomes that make the Agents of a Mission win: every Agent hits hard and every Enemy misses. */
export function winning(state: CampaignState, site: string): Injected {
  const world = state.world.current;
  const enemies = world.missionSites[site]?.state.enemies ?? [];
  return { ...hitHardest(state, Object.keys(world.agents)), ...allMiss(enemies) };
}

/** Injected outcomes that make the Agents of a Mission lose: every Agent misses and every Enemy hits hard. */
export function losing(state: CampaignState, site: string): Injected {
  const world = state.world.current;
  const enemies = world.missionSites[site]?.state.enemies ?? [];
  return { ...allMiss(Object.keys(world.agents)), ...hitHardest(state, enemies) };
}

/** A Combatant for testing a Combat on its own: a `field_agent` unless values are given. */
export function combatAgent(
  id: string,
  values: Partial<{ skill: number; currentHealth: number; exhaustion: number; weaponDamage: number }> = {},
): Combatant {
  return {
    id,
    state: { skill: 100, currentHealth: 30, baseHealth: 30, exhaustion: 0, weaponDamage: 10, ...values },
  };
}

/** A newly created Enemy of the given EnemyArchetype, for testing a Combat on its own. */
export function combatEnemy(id: string, archetypeId: string, catalog: GdrCatalog = gdrs): Combatant {
  const archetype = catalog.enemyArchetypes.get(archetypeId);
  const weapon = archetype ? catalog.weapons.get(archetype.weapon) : undefined;
  if (!archetype || !weapon) {
    throw new Error(`No EnemyArchetype ${archetypeId}`);
  }
  return {
    id,
    state: {
      skill: archetype.skill,
      currentHealth: archetype.baseHealth,
      baseHealth: archetype.baseHealth,
      exhaustion: 0,
      weaponDamage: weapon.damage,
    },
  };
}

type RawGdr = Record<string, any>;

/** A changeable copy of the Bootstrap GDR files, for tests that use test GDRs or check GDR validation. */
export function rawGdrs(): {
  files: { path: string; gdrs: RawGdr[] }[];
  get(id: string): RawGdr;
  add(path: string, gdr: RawGdr): void;
} {
  const files = structuredClone(RAW_GDR_FILES) as { path: string; gdrs: RawGdr[] }[];
  return {
    files,
    get(id) {
      for (const file of files) {
        const found = file.gdrs.find((gdr) => gdr['id'] === id);
        if (found) {
          return found;
        }
      }
      throw new Error(`No GDR ${id}`);
    },
    add(path, gdr) {
      const file = files.find((item) => item.path === path);
      if (file) {
        file.gdrs.push(gdr);
      } else {
        files.push({ path, gdrs: [gdr] });
      }
    },
  };
}

/** The catalog of the Bootstrap GDRs after a change. */
export function catalogWith(change: (raw: ReturnType<typeof rawGdrs>) => void): GdrCatalog {
  const raw = rawGdrs();
  change(raw);
  return buildGdrCatalog(raw.files);
}

/** Expects the Bootstrap GDRs after a change to be a defective Game build. */
export function expectDefective(change: (raw: ReturnType<typeof rawGdrs>) => void): void {
  expect(() => catalogWith(change)).toThrow(/defective/);
}
