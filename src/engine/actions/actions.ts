/**
 * The Player API and Developer API actions other than Advance turn. Each validates every precondition against the
 * Committed state before it changes anything, so a rejected action changes nothing; each accepted action is one
 * Player action.
 */
import { must } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import { canBeOrdered, createAgent, recordParticipation } from '../mechanics/agents/agents.ts';
import {
  agencyCaps,
  countDeployed,
  countServing,
  countTraining,
  effectTotal,
} from '../mechanics/economy/economy.ts';
import { activeInvestigationOf, leadAvailability } from '../mechanics/leads/leads.ts';
import { reject, type Rejection } from '../result.ts';
import type { ActionRecord } from '../rules.ts';
import { newInstanceId } from '../turn/advance.ts';
import type { Agent, CurrentWorldState, SimpleAssignment } from '../state/types.ts';

/** The names of the gameplay actions of `player.actions`, other than Advance turn. */
export const PLAYER_ACTIONS = [
  'assignAgents',
  'hireAgent',
  'dismissAgents',
  'purchaseUpgrade',
  'startInvestigation',
  'assignAgentsToInvestigation',
  'deployAgents',
] as const;
export type PlayerActionName = (typeof PLAYER_ACTIONS)[number];

/** The names of the cheat operations of `developer.actions`. */
export const DEVELOPER_ACTIONS = ['addMoney', 'addAgents', 'overrideRandomOutcome'] as const;
export type DeveloperActionName = (typeof DEVELOPER_ACTIONS)[number];

const SIMPLE_ASSIGNMENTS: readonly string[] = ['Standby', 'Contracting', 'Training'];

type Args = Record<string, unknown>;

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function list(ids: readonly string[]): string {
  return ids.join(', ');
}

/** The preconditions every action with an `agents` parameter shares: a non-empty list of distinct Agents. */
function resolveAgents(world: CurrentWorldState, value: unknown): Agent[] | Rejection {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    return reject('invalid_agents', 'The Agents must be given as a list of Instance IDs.', 'invalid_input');
  }
  if (value.length === 0) {
    return reject('agents_empty', 'No Agent was given.');
  }
  const duplicates = value.filter((item, index) => value.indexOf(item) !== index);
  if (duplicates.length > 0) {
    return reject(
      'agents_duplicate',
      `These Agents are listed more than once: ${list([...new Set(duplicates)])}.`,
    );
  }
  const unknown = value.filter((item) => world.agents[item] === undefined);
  if (unknown.length > 0) {
    return reject('agents_unknown', `These Instance IDs identify no Agent: ${list(unknown)}.`);
  }
  return value.map((item) => must(world.agents[item], 'Agent'));
}

function isRejected(value: unknown): value is Rejection {
  return typeof value === 'object' && value !== null && (value as { rejected?: unknown }).rejected === true;
}

function requireOrderable(agents: readonly Agent[]): Rejection | null {
  const blocked = agents.filter((agent) => !canBeOrdered(agent.state));
  return blocked.length > 0
    ? reject('agents_cannot_be_ordered', `These Agents cannot be ordered: ${list(blocked.map((a) => a.id))}.`)
    : null;
}

/**
 * Gives an Agent a new Current assignment. An Agent that leaves an Investigation is recorded in its Participation
 * history, and the Investigation is noted so that it can become Abandoned after all changes of the action.
 */
function leaveCurrentTeam(world: CurrentWorldState, agent: Agent, left: Set<string>): void {
  const assignment = agent.state.assignment;
  if (assignment?.kind === 'Investigation') {
    const investigation = must(world.investigations[assignment.investigation], 'Investigation of an Agent');
    investigation.state.currentTeam = investigation.state.currentTeam.filter((id) => id !== agent.id);
    recordParticipation(agent.state, 'Investigation', investigation.id);
    left.add(investigation.id);
  }
}

/** INVSTG, Abandonment: an Active Investigation left with an empty Current team becomes Abandoned. */
function abandonEmptied(world: CurrentWorldState, left: ReadonlySet<string>): void {
  for (const id of left) {
    const investigation = must(world.investigations[id], 'Investigation');
    if (investigation.state.lifecycle === 'Active' && investigation.state.currentTeam.length === 0) {
      investigation.state.lifecycle = 'Abandoned';
    }
  }
}

function weaponDamageBonus(world: CurrentWorldState, gdrs: GdrCatalog): number {
  return effectTotal('agent_weapon_damage', gdrs.upgrades, world.agency.state.acquisitions);
}

function addAgent(world: CurrentWorldState, gdrs: GdrCatalog): void {
  const agent = createAgent({
    id: newInstanceId(world, 'agent'),
    agencyId: world.agency.id,
    turn: world.turn,
    initialRoster: false,
    archetype: gdrs.agentArchetype,
    weapon: must(gdrs.weapons.get(gdrs.agentArchetype.weapon), 'Weapon of the AgentArchetype'),
    weaponDamageBonus: weaponDamageBonus(world, gdrs),
  });
  world.agents[agent.id] = agent;
}

// ---- Player actions ------------------------------------------------------------------------------

/** AGENT, Assigning Agents; ECON, Training cap on assigning Agents. */
function assignAgents(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const assignment = args['assignment'];
  if (typeof assignment !== 'string' || !SIMPLE_ASSIGNMENTS.includes(assignment)) {
    return reject('invalid_assignment', 'The assignment must be Standby, Contracting, or Training.');
  }
  const blocked = requireOrderable(agents);
  if (blocked) {
    return blocked;
  }
  const already = agents.filter((agent) => agent.state.assignment?.kind === assignment);
  if (already.length > 0) {
    return reject(
      'already_assigned',
      `These Agents already have the Current assignment ${assignment}: ${list(already.map((a) => a.id))}.`,
    );
  }
  if (assignment === 'Training') {
    const training = countTraining(Object.values(world.agents).map((agent) => agent.state));
    const cap = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions).trainingCap;
    if (training + agents.length > cap) {
      return reject(
        'training_cap',
        `Ordering ${agents.length} more to Training would exceed the Training cap: ${training} of ${cap} places are taken.`,
      );
    }
  }
  const left = new Set<string>();
  for (const agent of agents) {
    leaveCurrentTeam(world, agent, left);
    agent.state.assignment = { kind: assignment as SimpleAssignment };
    agent.state.taskPhase = 'InTransit';
  }
  abandonEmptied(world, left);
  return null;
}

/** ECON, Hiring Agents. */
function hireAgent(world: CurrentWorldState, _args: Args, gdrs: GdrCatalog): Rejection | null {
  if (world.agency.state.money < gdrs.economy.hireCost) {
    return reject(
      'not_enough_money',
      `Hiring costs ${gdrs.economy.hireCost} and the Agency has ${world.agency.state.money}.`,
    );
  }
  const serving = countServing(Object.values(world.agents).map((agent) => agent.state));
  const cap = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions).agentCap;
  if (serving >= cap) {
    return reject('agent_cap', `The Agency employs ${serving} Agents and the Agent cap is ${cap}.`);
  }
  world.agency.state.money -= gdrs.economy.hireCost;
  addAgent(world, gdrs);
  return null;
}

/** ECON, Dismissing Agents. */
function dismissAgents(world: CurrentWorldState, args: Args): Rejection | null {
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const notServing = agents.filter((agent) => agent.state.lifecycle !== 'Serving');
  if (notServing.length > 0) {
    return reject(
      'agents_not_serving',
      `These Agents are not Serving: ${list(notServing.map((a) => a.id))}.`,
    );
  }
  const inTransit = agents.filter((agent) => agent.state.taskPhase === 'InTransit');
  if (inTransit.length > 0) {
    return reject('agents_in_transit', `These Agents are In transit: ${list(inTransit.map((a) => a.id))}.`);
  }
  const busy = agents.filter((agent) => agent.state.assignment?.kind !== 'Standby');
  if (busy.length > 0) {
    return reject(
      'agents_not_on_standby',
      `These Agents are not on Standby: ${list(busy.map((a) => a.id))}.`,
    );
  }
  for (const agent of agents) {
    agent.state.lifecycle = 'Dismissed';
    agent.state.assignment = null;
    agent.state.taskPhase = null;
  }
  return null;
}

/** ECON, Purchasing Upgrades and Upgrade effects. */
function purchaseUpgrade(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const upgrade = gdrs.upgrades.find((item) => item.id === args['upgrade']);
  if (upgrade === undefined) {
    return reject('unknown_upgrade', 'That identifier names no Upgrade.');
  }
  if (world.agency.state.money < upgrade.price) {
    return reject(
      'not_enough_money',
      `${upgrade.name} costs ${upgrade.price} and the Agency has ${world.agency.state.money}.`,
    );
  }
  world.agency.state.money -= upgrade.price;
  world.agency.state.acquisitions[upgrade.id] = (world.agency.state.acquisitions[upgrade.id] ?? 0) + 1;
  if (upgrade.effect === 'agent_weapon_damage') {
    for (const agent of Object.values(world.agents)) {
      if (agent.state.lifecycle === 'Serving') {
        agent.state.weaponDamage += upgrade.increment;
      }
    }
  }
  return null;
}

/** INVSTG, Starting an Investigation. */
function startInvestigation(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const lead = gdrs.leads.find((item) => item.id === args['lead']);
  if (lead === undefined) {
    return reject('unknown_lead', 'That identifier names no Lead.');
  }
  const availability = leadAvailability(lead, world);
  if (!availability.available) {
    return reject(
      'lead_not_available',
      `${lead.name} is not available: condition ${availability.blockingConditions.join(', ')} of Lead availability does not hold.`,
    );
  }
  const active = activeInvestigationOf(lead.id, world.investigations);
  if (active !== null) {
    return reject(
      'lead_has_active_investigation',
      `${lead.name} already has the Active Investigation ${active.id}.`,
    );
  }
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const blocked = requireOrderable(agents);
  if (blocked) {
    return blocked;
  }
  const id = newInstanceId(world, 'investigation');
  const left = new Set<string>();
  for (const agent of agents) {
    leaveCurrentTeam(world, agent, left);
    agent.state.assignment = { kind: 'Investigation', investigation: id };
    agent.state.taskPhase = 'InTransit';
  }
  world.investigations[id] = {
    id,
    archetype: gdrs.investigationArchetype.id,
    constants: { lead: lead.id, turnStarted: world.turn },
    state: { lifecycle: 'Active', progress: 0, currentTeam: agents.map((agent) => agent.id) },
  };
  abandonEmptied(world, left);
  return null;
}

/** INVSTG, Assigning Agents to an Investigation. */
function assignAgentsToInvestigation(world: CurrentWorldState, args: Args): Rejection | null {
  const investigationId = args['investigation'];
  const investigation =
    typeof investigationId === 'string' ? world.investigations[investigationId] : undefined;
  if (investigation === undefined) {
    return reject('unknown_investigation', 'That Instance ID identifies no Investigation.');
  }
  if (investigation.state.lifecycle !== 'Active') {
    return reject(
      'investigation_not_active',
      `Investigation ${investigation.id} is ${investigation.state.lifecycle}.`,
    );
  }
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const blocked = requireOrderable(agents);
  if (blocked) {
    return blocked;
  }
  const members = agents.filter((agent) => investigation.state.currentTeam.includes(agent.id));
  if (members.length > 0) {
    return reject(
      'already_in_current_team',
      `These Agents already belong to its Current team: ${list(members.map((a) => a.id))}.`,
    );
  }
  const left = new Set<string>();
  for (const agent of agents) {
    leaveCurrentTeam(world, agent, left);
    agent.state.assignment = { kind: 'Investigation', investigation: investigation.id };
    agent.state.taskPhase = 'InTransit';
    investigation.state.currentTeam.push(agent.id);
  }
  abandonEmptied(world, left);
  return null;
}

/** MISSION, Deploying Agents. */
function deployAgents(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const siteId = args['missionSite'];
  const site = typeof siteId === 'string' ? world.missionSites[siteId] : undefined;
  if (site === undefined) {
    return reject('unknown_mission_site', 'That Instance ID identifies no Mission site.');
  }
  if (site.state.lifecycle !== 'Active') {
    return reject(
      'mission_site_not_active',
      `Mission site ${site.id} is ${site.state.lifecycle}, not Active.`,
    );
  }
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const blocked = requireOrderable(agents);
  if (blocked) {
    return blocked;
  }
  const deployed = countDeployed(Object.values(world.agents).map((agent) => agent.state));
  const cap = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions).transportCap;
  if (deployed + agents.length > cap) {
    return reject(
      'transport_cap',
      `Deploying ${agents.length} more would exceed the Transport cap: ${deployed} of ${cap} places are taken.`,
    );
  }
  const id = newInstanceId(world, 'mission');
  const team = agents.map((agent) => agent.id);
  site.state.lifecycle = 'Attempted';
  world.missions[id] = {
    id,
    archetype: gdrs.missionArchetype.id,
    constants: { missionSite: site.id, turnDeployed: world.turn, teamSent: team },
    state: { lifecycle: 'Deployed', currentTeam: [...team] },
  };
  const left = new Set<string>();
  for (const agent of agents) {
    leaveCurrentTeam(world, agent, left);
    agent.state.assignment = { kind: 'Deployed', mission: id };
    agent.state.taskPhase = 'AtAssignment';
  }
  abandonEmptied(world, left);
  return null;
}

// ---- Cheat operations ----------------------------------------------------------------------------

/** ECON, Adding money. */
function addMoney(world: CurrentWorldState, args: Args): Rejection | null {
  const amount = args['amount'];
  if (!isWhole(amount) || amount < 1) {
    return reject('invalid_amount', 'The amount must be a whole number of at least 1.', 'invalid_input');
  }
  if (!Number.isSafeInteger(world.agency.state.money + amount)) {
    return reject(
      'amount_too_large',
      'That amount would take money beyond the supported range.',
      'invalid_input',
    );
  }
  world.agency.state.money += amount;
  return null;
}

/** AGENT, Adding Agents. */
function addAgents(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const count = args['count'];
  if (!isWhole(count) || count < 1) {
    return reject('invalid_count', 'The count must be a whole number of at least 1.', 'invalid_input');
  }
  if (!Number.isSafeInteger(world.nextInstanceNumber + count)) {
    return reject(
      'count_too_large',
      'That count would take Instance IDs beyond the supported range.',
      'invalid_input',
    );
  }
  for (let i = 0; i < count; i += 1) {
    addAgent(world, gdrs);
  }
  return null;
}

/** The named random outcomes an override can fix, with the kind of value each takes; see DEC-020. */
const OUTCOME_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly value: 'boolean' | 'whole' | 'text';
  readonly instance: 'combatant' | 'investigation' | 'faction';
}[] = [
  { pattern: /^combat\.hit\.(.+)$/, value: 'boolean', instance: 'combatant' },
  { pattern: /^combat\.damage\.(.+)$/, value: 'whole', instance: 'combatant' },
  { pattern: /^investigation\.completion\.(.+)$/, value: 'boolean', instance: 'investigation' },
  { pattern: /^faction\.(.+)\.levelDuration$/, value: 'whole', instance: 'faction' },
  { pattern: /^faction\.(.+)\.operationInterval$/, value: 'whole', instance: 'faction' },
  { pattern: /^faction\.(.+)\.operationLevel$/, value: 'whole', instance: 'faction' },
  { pattern: /^mission\.archetypeSelection\.(.+)$/, value: 'text', instance: 'faction' },
];

/** DEV, Random outcome overrides: the named random outcome takes the supplied value when it is next decided. */
function overrideRandomOutcome(world: CurrentWorldState, args: Args): Rejection | null {
  const outcome = args['outcome'];
  const value = args['value'];
  if (typeof outcome !== 'string') {
    return reject('invalid_outcome', 'The random outcome must be named.', 'invalid_input');
  }
  for (const known of OUTCOME_PATTERNS) {
    const match = known.pattern.exec(outcome);
    if (match === null) {
      continue;
    }
    const instanceId = match[1] ?? '';
    const exists =
      known.instance === 'combatant'
        ? world.agents[instanceId] !== undefined || world.enemies[instanceId] !== undefined
        : known.instance === 'investigation'
          ? world.investigations[instanceId] !== undefined
          : world.factions[instanceId] !== undefined;
    if (!exists) {
      return reject(
        'unknown_instance',
        `${instanceId} identifies no Campaign instance that has this random outcome.`,
      );
    }
    const valid =
      known.value === 'boolean'
        ? typeof value === 'boolean'
        : known.value === 'whole'
          ? isWhole(value) && value >= 0
          : typeof value === 'string' && value.length > 0;
    if (!valid) {
      return reject('invalid_value', 'That is not a possible value of this random outcome.', 'invalid_input');
    }
    world.randomOverrides = world.randomOverrides.filter((item) => item.outcome !== outcome);
    world.randomOverrides.push({ outcome, value: value as number | boolean | string });
    return null;
  }
  return reject('unknown_outcome', 'That names no random outcome.', 'invalid_input');
}

/**
 * Applies one action to Current world state. Returns a rejection when a precondition fails; the caller then
 * discards every change.
 */
export function applyGameAction(
  world: CurrentWorldState,
  record: ActionRecord,
  gdrs: GdrCatalog,
): Rejection | null {
  // ENDING, After a Campaign ending: every Player action is rejected, whatever else also fails.
  if (world.ending !== null) {
    return reject('campaign_ended', `The Campaign has ended in ${world.ending}.`, 'campaign_ended');
  }
  const args: Args =
    typeof record.args === 'object' && record.args !== null ? (record.args as Args) : ({} satisfies Args);
  if (record.surface === 'player') {
    switch (record.name as PlayerActionName) {
      case 'assignAgents':
        return assignAgents(world, args, gdrs);
      case 'hireAgent':
        return hireAgent(world, args, gdrs);
      case 'dismissAgents':
        return dismissAgents(world, args);
      case 'purchaseUpgrade':
        return purchaseUpgrade(world, args, gdrs);
      case 'startInvestigation':
        return startInvestigation(world, args, gdrs);
      case 'assignAgentsToInvestigation':
        return assignAgentsToInvestigation(world, args);
      case 'deployAgents':
        return deployAgents(world, args, gdrs);
    }
  } else {
    switch (record.name as DeveloperActionName) {
      case 'addMoney':
        return addMoney(world, args);
      case 'addAgents':
        return addAgents(world, args, gdrs);
      case 'overrideRandomOutcome':
        return overrideRandomOutcome(world, args);
    }
  }
  return reject('unknown_action', 'There is no such action.', 'invalid_input');
}
