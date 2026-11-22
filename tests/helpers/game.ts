/** Helpers for testing the Mechanics rules directly on Campaign state, with injected random outcomes. */
import { produce } from 'immer';
import { expect } from 'vite-plus/test';
import { advanceTurnOf, applyActionTo } from '../../src/engine/game-rules.ts';
import {
  agentCombatantValues,
  agentCurrentHealthHundredths,
  effectiveMaxHealth,
  effectiveArmor,
  effectiveWeaponDamage,
  exhaustionOf,
  setAgentCurrentHealth,
  type AgentUpgradeBonus,
  type CombatantValues,
} from '../../src/engine/mechanics/agents/agents.ts';
import { agentUpgradeBonus } from '../../src/engine/mechanics/economy/economy.ts';
import { damageBounds, type Combatant } from '../../src/engine/mechanics/combat/combat.ts';
import { discoverLeads } from '../../src/engine/mechanics/leads/leads.ts';
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
import { RAW_GDR_FILES, buildGdrCatalog, type GdrCatalog, type RawGdrFile } from '../../src/gdr/index.ts';
import { must, seedRng } from '../../src/kernel/index.ts';

/** The FactionArchetypes that the test Game build of the acceptance examples leaves out. */
const LEFT_OUT_FACTIONS = new Set(['exalt', 'black_lotus']);

/** GDR, GDR file layout: the directory that holds one file for each CompendiumArticle GDR. */
export const ARTICLE_DIRECTORY = 'compendium/compendium_articles/';

/** The path of the GDR file of the Compendium article with this identifier. */
export function articleFile(id: string): string {
  return `${ARTICLE_DIRECTORY}${id}.yaml`;
}

/**
 * The test Game build that the acceptance examples of the Mechanics specifications use: the Bootstrap GDRs without the
 * FactionArchetypes `exalt` and `black_lotus`, their Leads, and the Subject articles about them, so that the
 * Campaign has the one Faction Red Dawn. The file of a left-out Subject article is left out with it, because a file
 * in a directory of one file per GDR holds exactly one GDR (GDR, GDR file layout). The `discovered_when` of
 * `peace_on_earth`, an `all` of the three Terminate Leads, keeps only the `lead_completed` Condition of the Lead kept,
 * so that completing `terminate_red_dawn` discovers it.
 */
export const RED_DAWN_ONLY_FILES: readonly RawGdrFile[] = (() => {
  const files = structuredClone(RAW_GDR_FILES) as { path: string; gdrs: Record<string, unknown>[] }[];
  const leftOut = new Set<unknown>(LEFT_OUT_FACTIONS);
  for (const file of files) {
    for (const gdr of file.gdrs) {
      if (gdr['type'] === 'Lead' && LEFT_OUT_FACTIONS.has(gdr['faction'] as string)) {
        leftOut.add(gdr['id']);
      }
    }
  }
  type RawCondition = { $entries: [string, unknown][] };
  for (const file of files) {
    for (const gdr of file.gdrs) {
      const condition = gdr['discovered_when'] as RawCondition | undefined;
      const [key, value] = condition?.$entries[0] ?? [];
      if (gdr['type'] === 'Lead' && key === 'all' && Array.isArray(value)) {
        const kept = (value as RawCondition[]).filter(
          (item) => !(item.$entries[0]?.[0] === 'lead_completed' && leftOut.has(item.$entries[0][1])),
        );
        gdr['discovered_when'] = kept.length === 1 ? kept[0] : { $entries: [['all', kept]] };
      }
    }
  }
  return files
    .map((file) => ({
      path: file.path,
      gdrs: file.gdrs.filter((gdr) => !leftOut.has(gdr['id']) && !leftOut.has(gdr['subject'])),
    }))
    .filter((file) => file.gdrs.length > 0 || !file.path.startsWith(ARTICLE_DIRECTORY));
})();

/**
 * The test Game build of the acceptance examples whose Combat traces and sums were worked out on the earlier, smaller
 * Bootstrap GDRs: the Red Dawn test Game build with the three-Lead chain `locate_red_dawn_member`,
 * `locate_red_dawn_safehouse`, and `locate_red_dawn_hq` of that build, each `until_mission_won` and with its earlier
 * required progress, the HQ raid making the Faction Eliminated, the earlier expiry, Enemies, and rewards of the five
 * MissionSiteArchetypes it used and the earlier rewards of the two lowest Faction operation levels, one Response
 * MissionSiteArchetype for each of those two levels, and `initiate`
 * with the Agents' Weapon. Every rule it exercises is the same in both builds. The Compendium articles that name a GDR
 * it leaves out are left out with it.
 */
export const LEGACY_FILES: readonly RawGdrFile[] = (() => {
  const files = structuredClone(RED_DAWN_ONLY_FILES) as { path: string; gdrs: Record<string, any>[] }[];
  const fileOf = (suffix: string) => files.find((file) => file.path.endsWith(suffix))!;
  const byId = (suffix: string, id: string) => fileOf(suffix).gdrs.find((gdr) => gdr['id'] === id)!;
  const map = (entries: [string, unknown][]) => ({ $entries: entries });
  const effects = (entries: [string, unknown][]) => entries.map((entry) => map([entry]));
  // Leads: the three locate Leads of Red Dawn only.
  const leads = fileOf('/leads.yaml');
  const member = byId('/leads.yaml', 'locate_red_dawn_member');
  const safehouse = byId('/leads.yaml', 'locate_red_dawn_safehouse');
  const hq = byId('/leads.yaml', 'locate_red_dawn_hq');
  for (const lead of [member, safehouse, hq]) {
    delete lead['investigate_again'];
  }
  delete member['discovered_when'];
  safehouse['discovered_when'] = map([['mission_won', 'apprehend_member']]);
  hq['discovered_when'] = map([['mission_won', 'raid_safehouse']]);
  member['required_progress'] = 3;
  safehouse['required_progress'] = 6;
  hq['required_progress'] = 10;
  leads.gdrs = [member, safehouse, hq];
  // Mission sites.
  const sites = fileOf('/mission_site_archetypes.yaml');
  const keep = ['apprehend_member', 'raid_safehouse', 'raid_hq', 'foil_recruitment_push', 'foil_sabotage'];

  sites.gdrs = sites.gdrs.filter(
    (gdr) => keep.includes(gdr['id']) || gdr['kind'] === 'initiative' || (gdr['operation_level'] ?? 0) > 2,
  );
  const site = (id: string) => byId('/mission_site_archetypes.yaml', id);
  site('apprehend_member')['expires_in_turns'] = 5;
  site('apprehend_member')['enemies'] = map([['initiate', 3]]);
  site('apprehend_member')['on_win'] = effects([
    ['money', 5],
    ['panic', -1],
  ]);
  site('raid_safehouse')['expires_in_turns'] = 8;
  site('raid_safehouse')['enemies'] = map([
    ['initiate', 8],
    ['soldier', 1],
  ]);
  site('raid_safehouse')['on_win'] = effects([
    ['money', 100],
    ['funding', 5],
    ['panic', -2],
  ]);
  site('raid_hq')['expires_in_turns'] = 20;
  site('raid_hq')['enemies'] = map([
    ['initiate', 6],
    ['soldier', 3],
    ['commander', 1],
  ]);
  site('raid_hq')['on_win'] = effects([['eliminate_faction', true]]);
  site('foil_recruitment_push')['expires_in_turns'] = 3;
  site('foil_recruitment_push')['enemies'] = map([['initiate', 5]]);
  site('foil_sabotage')['expires_in_turns'] = 4;
  site('foil_sabotage')['enemies'] = map([
    ['initiate', 4],
    ['soldier', 2],
  ]);
  // Faction operation levels 1 and 2.
  byId('/faction_operation_levels.yaml', 'operation_level_1')['on_win'] = effects([['money', 10]]);
  byId('/faction_operation_levels.yaml', 'operation_level_1')['on_ignored_or_lost'] = effects([['panic', 3]]);
  byId('/faction_operation_levels.yaml', 'operation_level_2')['on_win'] = effects([
    ['money', 30],
    ['funding', 5],
  ]);
  byId('/faction_operation_levels.yaml', 'operation_level_2')['on_ignored_or_lost'] = effects([
    ['panic', 8],
    ['funding', -1],
  ]);
  // The earlier build had no `visible_when`: every article about a Faction was visible with its Faction.
  for (const file of files.filter((item) => item.path.startsWith(ARTICLE_DIRECTORY))) {
    for (const gdr of file.gdrs) {
      delete gdr['visible_when'];
    }
  }
  // `initiate` carries `combat_pistol`, whose base weapon damage equals that of the Agents' Service weapon.
  byId('/enemy_archetypes.yaml', 'initiate')['weapon'] = 'combat_pistol';
  // Compendium articles about, or naming, a GDR left out are left out.
  const kept = new Set(files.flatMap((file) => file.gdrs.map((gdr) => gdr['id'])));
  return files.filter(
    (file) =>
      !file.path.startsWith(ARTICLE_DIRECTORY) ||
      file.gdrs.every((gdr) => {
        if (gdr['subject'] !== undefined && !kept.has(gdr['subject'])) {
          return false;
        }
        const text = JSON.stringify(gdr);
        const named = [...text.matchAll(/\{([a-z][a-z0-9_]*)\./g)].map((match) => match[1]);
        return named.every((id) => id === 'subject' || kept.has(id));
      }),
  );
})();

/** The catalog of the Red Dawn test Game build, whichever catalog is the default. */
export const BOOTSTRAP_GDRS = buildGdrCatalog(RED_DAWN_ONLY_FILES);
/** The catalog every helper and test of the file uses by default; see `useLegacyCatalog`. */
export let gdrs = BOOTSTRAP_GDRS;
/** The GDR files `rawGdrs` and `catalogWith` start from. */
let baseFiles: readonly RawGdrFile[] = RED_DAWN_ONLY_FILES;

/**
 * Makes the legacy test Game build the default of every helper, and of `gdrs`, for the rest of the test file that
 * calls it, at its top level. Each test file runs in a module instance of its own, so no other file is affected.
 */
export function useLegacyCatalog(): void {
  gdrs = buildGdrCatalog(LEGACY_FILES);
  baseFiles = LEGACY_FILES;
}

export type Injected = Record<string, (number | boolean | string)[]>;

/**
 * A new Campaign from the preset `standard`, with Red Dawn's countdowns set so that nothing happens by itself, and,
 * unless `firstLead` is false, `locate_red_dawn_member` already in the set of discovered Leads, as if the first Lead
 * `criminal_organizations` had been completed, so that the acceptance examples written before the Lead chain of the
 * Bootstrap GDRs grew can start an Investigation of it at once. No Investigation is added, so the Instance IDs of a
 * test's own Investigations are unchanged. A Faction at a level without operations keeps no countdown.
 */
export function newCampaign(
  options: {
    money?: number;
    funding?: number;
    catalog?: GdrCatalog;
    quietFactions?: boolean;
    firstLead?: boolean;
  } = {},
): CampaignState {
  const catalog = options.catalog ?? gdrs;
  let state = createCampaignState(
    { startingMoney: options.money ?? 500, startingFunding: options.funding ?? 20 },
    'test seed',
    catalog,
  );
  if (options.firstLead !== false && catalog.leads.some((lead) => lead.id === 'locate_red_dawn_member')) {
    state = tweak(state, (world) => {
      if (!world.discoveredLeads.includes('locate_red_dawn_member')) {
        world.discoveredLeads.push('locate_red_dawn_member');
      }
    });
  }
  if (options.quietFactions === false) {
    return state;
  }
  return tweak(state, (world) => {
    for (const faction of Object.values(world.factions)) {
      if (faction.state.turnsUntilNextOperation !== null) {
        faction.state.turnsUntilNextOperation = 10_000;
      }
      if (faction.state.turnsUntilNextLevel !== null) {
        faction.state.turnsUntilNextLevel = 10_000;
      }
    }
  });
}

/**
 * Adds a Completed Investigation of the Lead, when the Game build supplies it, and discovers every Lead whose
 * `discovered_when` then holds, as the World state after that completion would (LEAD, Lead discovery).
 */
export function completeLead(
  state: CampaignState,
  leadId: string,
  catalog: GdrCatalog = gdrs,
): CampaignState {
  const lead = catalog.leads.find((item) => item.id === leadId);
  if (lead === undefined) {
    return state;
  }
  return tweak(state, (world) => {
    const investigation = newInstanceId(world, 'investigation');
    world.investigations[investigation] = {
      id: investigation,
      archetype: catalog.investigationArchetype.id,
      constants: {
        lead: lead.id,
        turnStarted: Math.max(1, world.turn - 1),
        actualRequiredProgress: lead.requiredProgress,
      },
      state: {
        lifecycle: 'Completed',
        progress: lead.requiredProgress * 100,
        assessed: true,
        currentTeam: [],
      },
    };
    discoverLeads(world, catalog.leads);
  });
}

/**
 * Adds an Active Investigation of a discovered Lead whose progress already reaches its Actual required progress, with
 * the given Agent At assignment on it, so that the next Advance turn completes it. Returns its Instance ID.
 */
export function finishingInvestigation(
  state: CampaignState,
  leadId: string,
  agentId: string,
  catalog: GdrCatalog = gdrs,
): { state: CampaignState; investigation: string } {
  const lead = must(
    catalog.leads.find((item) => item.id === leadId),
    `Lead ${leadId}`,
  );
  let id = '';
  const next = tweak(state, (world) => {
    id = newInstanceId(world, 'investigation');
    world.investigations[id] = {
      id,
      archetype: catalog.investigationArchetype.id,
      constants: { lead: lead.id, turnStarted: world.turn, actualRequiredProgress: lead.requiredProgress },
      state: {
        lifecycle: 'Active',
        progress: lead.requiredProgress * 100,
        assessed: true,
        currentTeam: [agentId],
      },
    };
    const member = must(world.agents[agentId], `Agent ${agentId}`);
    member.state.assignment = { kind: 'Investigation', investigation: id };
    member.state.status = 'AtAssignment';
  });
  return { state: next, investigation: id };
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

/** Applies an action that must be accepted, and checks every invariant of the resulting World state. */
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

/**
 * A random source that takes each named outcome from `injected` and every other outcome from the seed, except that a
 * Combat target outcome the test does not fix takes the first candidate, i.e. the earliest in the fixed order, so
 * that a scripted Combat does not depend on the order in which an Advance turn processes its Missions.
 */
export function randomFor(state: CampaignState, injected: Injected = {}): Random & { used: string[] } {
  const seeded = seededRandom(seedRng(`fallback ${state.world.current.turn}`), []);
  return injectedRandom(injected, {
    ...seeded,
    weighted(outcome, entries) {
      const first = entries.find(([, weight]) => weight > 0);
      return outcome.startsWith('combat.target.') && first ? first[0] : seeded.weighted(outcome, entries);
    },
  });
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
      const required = must(
        catalog.leads.find((item) => item.id === lead),
        `Lead ${lead}`,
      ).requiredProgress;
      world.investigations[investigation] = {
        id: investigation,
        archetype: catalog.investigationArchetype.id,
        constants: { lead, turnStarted: Math.max(1, world.turn - 1), actualRequiredProgress: required },
        state: { lifecycle: 'Completed', progress: required * 100, assessed: true, currentTeam: [] },
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
      armors: catalog.armors,
      combat: catalog.combatParameters,
      agentParameters: catalog.agentParameters,
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
  const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
  for (const id of ids) {
    const agent = world.agents[id];
    const weaponDamage =
      agent !== undefined
        ? effectiveWeaponDamage(agent.state, bonus)
        : (world.enemies[id]?.state.baseWeaponDamage ?? 1);
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

/** The Upgrade bonus of a Campaign without any Max health, Weapon damage, or Armor Upgrade, or with the given ones. */
export function bonusOf(maxHealth = 0, weaponDamage = 0, armor = 0): AgentUpgradeBonus {
  return { maxHealth, weaponDamage, armor };
}

/**
 * An Agent's effective weapon damage, effective max health, and effective armor in a Campaign state, with its Upgrade
 * bonus.
 */
export function effectiveValuesOf(
  state: CampaignState,
  id: string,
  catalog: GdrCatalog = gdrs,
): { weaponDamage: number; maxHealth: number; currentHealth: number; armor: number } {
  const world = state.world.current;
  const bonus = agentUpgradeBonus(catalog.upgrades, world.agency.state.acquisitions);
  const found = agent(state, id).state;
  return {
    weaponDamage: effectiveWeaponDamage(found, bonus),
    armor: effectiveArmor(found, bonus),
    maxHealth: effectiveMaxHealth(found, bonus),
    currentHealth: agentCurrentHealthHundredths(found, bonus) / 100,
  };
}

/** An Agent's current health in hundredths: its effective max health less its health lost. */
export function currentHealthOf(agent: AgentState, maxHealthBonus = 0): number {
  return agentCurrentHealthHundredths(agent, bonusOf(maxHealthBonus));
}

/** Sets an Agent's current health, in hundredths, by storing the health lost it leaves. */
export function setCurrentHealth(agent: AgentState, hundredths: number, maxHealthBonus = 0): void {
  setAgentCurrentHealth(agent, hundredths, bonusOf(maxHealthBonus));
}

/** An Agent's values as effective skill and Training growth read them; see AGENT, Effective skill. */
export function valuesOf(agent: AgentState, maxHealthBonus = 0): CombatantValues {
  return agentCombatantValues(agent, bonusOf(maxHealthBonus));
}

/**
 * An Agent's or a Combat's Combatant state with its base skill, current health, and exhaustion also in units, e.g.
 * `skill: 101.1` for 10110 hundredths and the whole `exhaustion` its Exact exhaustion rounds up to, for comparing with
 * the values the specifications write. An Agent's current health, also in hundredths, is derived from its health lost
 * with the given Upgrade bonus of max health.
 */
export function units<S extends { skillHundredths: number; exactExhaustionHundredths: number }>(
  state: S & ({ currentHealthHundredths: number } | AgentState),
  maxHealthBonus = 0,
): S & { currentHealthHundredths: number; skill: number; currentHealth: number; exhaustion: number } {
  const currentHealthHundredths =
    'healthLostHundredths' in state ? currentHealthOf(state, maxHealthBonus) : state.currentHealthHundredths;
  return {
    ...state,
    currentHealthHundredths,
    skill: state.skillHundredths / 100,
    currentHealth: currentHealthHundredths / 100,
    exhaustion: exhaustionOf(state),
  };
}

/**
 * A Combatant for testing a Combat on its own: a `field_agent` unless values are given. The values are in units,
 * e.g. current health 22, and are held in hundredths, as an Agent holds them.
 */
export function combatAgent(
  id: string,
  values: Partial<{
    skill: number;
    currentHealth: number;
    exhaustion: number;
    weaponDamage: number;
    armor: number;
  }> = {},
): Combatant {
  const v = { skill: 100, currentHealth: 30, exhaustion: 0, weaponDamage: 10, armor: 0, ...values };
  return {
    id,
    state: {
      skillHundredths: Math.round(v.skill * 100),
      currentHealthHundredths: Math.round(v.currentHealth * 100),
      maxHealth: 30,
      exactExhaustionHundredths: Math.round(v.exhaustion * 100),
      weaponDamage: v.weaponDamage,
      armor: v.armor,
    },
  };
}

/** A newly created Enemy of the given EnemyArchetype, for testing a Combat on its own. */
export function combatEnemy(id: string, archetypeId: string, catalog: GdrCatalog = gdrs): Combatant {
  const archetype = catalog.enemyArchetypes.get(archetypeId);
  const weapon = archetype ? catalog.weapons.get(archetype.weapon) : undefined;
  const armor = archetype ? catalog.armors.get(archetype.armor) : undefined;
  if (!archetype || !weapon || !armor) {
    throw new Error(`No EnemyArchetype ${archetypeId}`);
  }
  return {
    id,
    state: {
      skillHundredths: archetype.skill * 100,
      currentHealthHundredths: archetype.baseHealth * 100,
      maxHealth: archetype.baseHealth,
      exactExhaustionHundredths: 0,
      weaponDamage: weapon.damage,
      armor: armor.armor,
    },
  };
}

type RawGdr = Record<string, any>;

/** One Effect of an Effect list in raw GDR form, as `scripts/build-gdr.ts` writes it; see EFFECT, Effect list format. */
export function effect(kind: string, value: unknown): { $entries: [string, unknown][] } {
  return { $entries: [[kind, value]] };
}

/**
 * A changeable copy of the GDR files of the test Game build with Red Dawn only, for tests that use test GDRs or check
 * GDR validation.
 */
export function rawGdrs(): {
  files: { path: string; gdrs: RawGdr[] }[];
  get(id: string): RawGdr;
  add(path: string, gdr: RawGdr): void;
  /**
   * Removes every Compendium article that the test GDRs no longer support: a Subject article whose subject they no
   * longer supply (COMP, rule 4), and, with `all`, every article, for a test that changes a GDR that the Placeholders
   * of the Bootstrap articles name (COMP, rule 9).
   */
  pruneArticles(all?: boolean): void;
} {
  const files = structuredClone(baseFiles) as { path: string; gdrs: RawGdr[] }[];
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
    pruneArticles(all = false) {
      const ids = new Set(
        files.flatMap((file) =>
          file.gdrs.filter((gdr) => gdr['type'] !== 'CompendiumArticle').map((gdr) => gdr['id']),
        ),
      );
      for (let index = files.length - 1; index >= 0; index -= 1) {
        const file = files[index]!;
        const kept = file.gdrs.filter(
          (gdr) =>
            gdr['type'] !== 'CompendiumArticle' ||
            (!all && (gdr['subject'] === undefined || ids.has(gdr['subject']))),
        );
        if (kept.length === file.gdrs.length) {
          continue;
        }
        // A file in a directory of one file per GDR leaves with its GDR; see GDR, GDR file layout.
        files.splice(index, 1);
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
