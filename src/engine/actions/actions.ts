/**
 * The Player API and Developer API actions other than Advance turn. Each validates every precondition against the
 * World state before it changes anything, so a rejected action changes nothing; each accepted action is one
 * Player action.
 */
import { isDraft, original } from 'immer';
import { must } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import {
  agentCombatantValues,
  canBeAssigned,
  createAgent,
  effectiveSkill,
  effectiveWeaponDamage,
  isBaseAssignment,
  isFitForWork,
  recordParticipation,
  terminateAgent,
  type AgentUpgradeBonus,
} from '../mechanics/agents/agents.ts';
import {
  agentCombatantState,
  damageBounds,
  meetsIncapacitationCondition,
} from '../mechanics/combat/combat.ts';
import {
  agencyCaps,
  agentUpgradeBonus,
  countDeployed,
  countServing,
  countTraining,
  countContracting,
} from '../mechanics/economy/economy.ts';
import {
  progressAfterLoss,
  requiredProgressOutcome,
  requiredProgressRange,
} from '../mechanics/investigations/investigations.ts';
import {
  activeInvestigationOf,
  currentContractingCap,
  discoverLeads,
  leadAvailability,
} from '../mechanics/leads/leads.ts';
import { seededRandom, type Random } from '../random.ts';
import { reject, type Rejection } from '../result.ts';
import type { ActionRecord } from '../rules.ts';
import { newInstanceId } from '../turn/advance.ts';
import {
  isServing,
  type Agent,
  type Assignment,
  type CurrentWorldState,
  type SimpleAssignment,
} from '../state/types.ts';

/** The names of the gameplay actions of `player.actions`, other than Advance turn. */
export const PLAYER_ACTIONS = [
  'assignAgents',
  'hireAgents',
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
  const blocked = agents.filter((agent) => !canBeAssigned(agent.state));
  return blocked.length > 0
    ? reject('agents_cannot_be_ordered', `These Agents cannot be ordered: ${list(blocked.map((a) => a.id))}.`)
    : null;
}

/** AGENT, Start-work gate: a new Work Assignment requires every Agent to be Fit to start work. */
function requireFitForWork(agents: readonly Agent[], gdrs: GdrCatalog): Rejection | null {
  const tired = agents.filter((agent) => !isFitForWork(agent.state, gdrs.agentParameters));
  return tired.length > 0
    ? reject(
        'agents_not_fit_for_work',
        `These Agents are not Fit to start work: their exhaustion is above ${gdrs.agentParameters.exhaustionWorkStartMax}, or they have health lost: ${list(tired.map((a) => a.id))}.`,
      )
    : null;
}

/**
 * MISSION, Deploying Agents, precondition 9: an Agent that meets the incapacitation condition with its current values
 * cannot be deployed. REUSE, Rules read by other rules: it calls the one implementation Combat start calls, with the
 * Agent's values as a Combatant's, built as the Advance turn builds them.
 */
function requireNotIncapacitated(
  world: CurrentWorldState,
  agents: readonly Agent[],
  gdrs: GdrCatalog,
): Rejection | null {
  const bonus = bonusOf(world, gdrs);
  const unfit = agents.filter((agent) =>
    meetsIncapacitationCondition(
      agentCombatantState(agent.state, bonus),
      gdrs.combatParameters,
      gdrs.agentParameters,
    ),
  );
  return unfit.length > 0
    ? reject(
        'agents_incapacitated',
        `These Agents would be Incapacitated at the start of the Combat, so they cannot be deployed: ${list(unfit.map((a) => a.id))}.`,
      )
    : null;
}

/**
 * AGENT, Agents that can be assigned, From away: an Agent on Contracting or an Investigation can only be recalled to
 * Standby, so Contracting, Training, an Investigation, and deployment each require a Base Assignment.
 */
function requireInBase(agents: readonly Agent[]): Rejection | null {
  const away = agents.filter((agent) => !isBaseAssignment(agent.state.assignment));
  return away.length > 0
    ? reject(
        'agents_not_in_base',
        `These Agents are on Contracting or an Investigation and can only be recalled to Standby: ${list(away.map((a) => a.id))}.`,
      )
    : null;
}

/**
 * The Investigations that members leave in one Player action, each with what INVSTG, Progress loss reads of the
 * World state in which the action is requested: the members At assignment and their effective skill.
 */
type Leaving = Map<string, ReadonlyMap<string, number>>;

/**
 * Gives an Agent a new Current assignment. An Agent that leaves an Investigation is recorded in its Participation
 * history, and the Investigation is noted, with its members At assignment before any change of the action, so that
 * it can lose progress and become Abandoned after all changes of the action.
 */
function leaveCurrentTeam(world: CurrentWorldState, agent: Agent, left: Leaving, gdrs: GdrCatalog): void {
  const assignment = agent.state.assignment;
  if (assignment?.kind === 'Investigation') {
    const investigation = must(world.investigations[assignment.investigation], 'Investigation of an Agent');
    if (!left.has(investigation.id)) {
      left.set(
        investigation.id,
        new Map(
          investigation.state.currentTeam
            .map((id) => must(world.agents[id], `Agent ${id}`))
            .filter((member) => member.state.status === 'AtAssignment')
            .map((member) => [
              member.id,
              effectiveSkill(agentCombatantValues(member.state, bonusOf(world, gdrs)), gdrs.agentParameters),
            ]),
        ),
      );
    }
    investigation.state.currentTeam = investigation.state.currentTeam.filter((id) => id !== agent.id);
    recordParticipation(agent.state, 'Investigation', investigation.id);
  }
}

/**
 * INVSTG, Progress loss, then Abandonment: once for each Investigation that members left in this Player action,
 * after all of the action's other changes.
 */
function settleLeftInvestigations(world: CurrentWorldState, left: Leaving): void {
  for (const [id, before] of left) {
    const investigation = must(world.investigations[id], 'Investigation');
    if (investigation.state.lifecycle !== 'Active') {
      continue;
    }
    let skillBefore = 0;
    let skillAfter = 0;
    for (const [member, skill] of before) {
      skillBefore += skill;
      if (investigation.state.currentTeam.includes(member)) {
        skillAfter += skill;
      }
    }
    investigation.state.progress = progressAfterLoss(investigation.state.progress, skillBefore, skillAfter);
    if (investigation.state.currentTeam.length === 0) {
      investigation.state.lifecycle = 'Abandoned';
    }
  }
}

/** ECON, Upgrade bonus: what the Upgrades acquired in this World state add to every Serving Agent's effective values. */
function bonusOf(world: CurrentWorldState, gdrs: GdrCatalog): AgentUpgradeBonus {
  return agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
}

function addAgent(world: CurrentWorldState, gdrs: GdrCatalog): void {
  const agent = createAgent({
    id: newInstanceId(world, 'agent'),
    agencyId: world.agency.id,
    turn: world.turn,
    initialRoster: false,
    archetype: gdrs.agentArchetype,
    weapon: must(gdrs.weapons.get(gdrs.agentArchetype.weapon), 'Weapon of the AgentArchetype'),
    armor: must(gdrs.armors.get(gdrs.agentArchetype.armor), 'Armor of the AgentArchetype'),
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
  if (assignment === 'Contracting' || assignment === 'Training') {
    const tired = requireFitForWork(agents, gdrs) ?? requireInBase(agents);
    if (tired) {
      return tired;
    }
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
  // ECON, Caps on assigning Agents: the Contracting cap.
  if (assignment === 'Contracting') {
    const contracting = countContracting(Object.values(world.agents).map((agent) => agent.state));
    const cap = currentContractingCap(world, gdrs);
    if (contracting + agents.length > cap) {
      return reject(
        'contracting_cap',
        cap === 0
          ? 'Contracting is not unlocked: the Contracting cap is 0.'
          : `Ordering ${agents.length} more to Contracting would exceed the Contracting cap: ${contracting} of ${cap} places are taken.`,
      );
    }
  }
  const left: Leaving = new Map();
  for (const agent of agents) {
    leaveCurrentTeam(world, agent, left, gdrs);
    const newAssignment: Assignment = { kind: assignment as SimpleAssignment };
    // AGENT, Transit rule: a move between Base Assignments travels nowhere and is At assignment at once.
    const withinBase = isBaseAssignment(agent.state.assignment) && isBaseAssignment(newAssignment);
    agent.state.assignment = newAssignment;
    agent.state.status = withinBase ? 'AtAssignment' : 'InTransit';
  }
  settleLeftInvestigations(world, left);
  return null;
}

/** ECON, Hiring Agents: `count` Agents in one Player action, rejected as a whole when they do not all fit. */
function hireAgents(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const count = args['count'];
  if (!isWhole(count) || count < 1) {
    return reject('invalid_count', 'The count must be a whole number of at least 1.', 'invalid_input');
  }
  const cost = count * gdrs.economy.hireCost;
  if (!Number.isSafeInteger(cost) || world.agency.state.money < cost) {
    return reject(
      'not_enough_money',
      `Hiring ${count} ${count === 1 ? 'Agent costs' : 'Agents costs'} ${cost} and the Agency has ${world.agency.state.money}.`,
    );
  }
  // Nothing has changed yet in this action, so the state it started from gives the same count without a draft per Agent.
  const agents = isDraft(world.agents)
    ? must(original(world.agents), 'Agents before the action')
    : world.agents;
  const serving = countServing(Object.values(agents).map((agent) => agent.state));
  const cap = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions).agentCap;
  if (serving + count > cap) {
    return reject(
      'agent_cap',
      `The Agency employs ${serving} Agents, so hiring ${count} would pass the Agent cap of ${cap}.`,
    );
  }
  world.agency.state.money -= cost;
  for (let i = 0; i < count; i += 1) {
    addAgent(world, gdrs);
  }
  return null;
}

/** ECON, Dismissing Agents. */
function dismissAgents(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
  const agents = resolveAgents(world, args['agents']);
  if (isRejected(agents)) {
    return agents;
  }
  const notServing = agents.filter((agent) => !isServing(agent.state));
  if (notServing.length > 0) {
    return reject(
      'agents_not_serving',
      `These Agents are not Serving: ${list(notServing.map((a) => a.id))}.`,
    );
  }
  const inTransit = agents.filter((agent) => agent.state.status === 'InTransit');
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
  const bonus = bonusOf(world, gdrs);
  for (const agent of agents) {
    // AGENT, Service record: Turn terminated is the Turn in which dismissAgents dismissed it, and the Final max health,
    // Final weapon damage, and Final armor are its effective values before it.
    terminateAgent(agent.state, 'Dismissed', world.turn, bonus);
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
  // No Upgrade changes a stored value beyond the Acquisitions: the Weapon damage, Max health, and Armor Upgrades raise
  // the Derived effective values of every Serving Agent; see ECON, Upgrade effects, and AGENT, Modifiable values.
  return null;
}

/** INVSTG, Starting an Investigation. */
function startInvestigation(
  world: CurrentWorldState,
  args: Args,
  gdrs: GdrCatalog,
  random: Random | null,
): Rejection | null {
  const lead = gdrs.leads.find((item) => item.id === args['lead']);
  const availability = lead === undefined ? null : leadAvailability(lead, world, gdrs.missionSiteArchetypes);
  // Condition 1: an undiscovered Lead is rejected with the same error as an unknown one, so that the rejection does
  // not reveal whether it exists; see LEAD, Lead discovery.
  if (lead === undefined || availability === null || !availability.discovered) {
    return reject('unknown_lead', 'That identifier names no discovered Lead.');
  }
  // LEAD, Player-visible information: the rejection says only that the Lead is not available, never why.
  if (!availability.available) {
    return reject('lead_not_available', `${lead.name} is not available.`);
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
  const blocked = requireOrderable(agents) ?? requireFitForWork(agents, gdrs) ?? requireInBase(agents);
  if (blocked) {
    return blocked;
  }
  // INVSTG, Required progress range and outcome: drawn only by a successful startInvestigation.
  const range = requiredProgressRange(lead.requiredProgress, gdrs.investigationParameters);
  const actualRequiredProgress = (random ?? seededRandom(world.rng, world.randomOverrides)).uniform(
    requiredProgressOutcome(lead.id),
    range.min,
    range.max,
  );
  const id = newInstanceId(world, 'investigation');
  // Every Agent is on a Base Assignment, so none leaves another Investigation.
  for (const agent of agents) {
    agent.state.assignment = { kind: 'Investigation', investigation: id };
    agent.state.status = 'InTransit';
  }
  world.investigations[id] = {
    id,
    archetype: gdrs.investigationArchetype.id,
    constants: { lead: lead.id, turnStarted: world.turn, actualRequiredProgress },
    state: {
      lifecycle: 'Active',
      progress: 0,
      assessed: false,
      currentTeam: agents.map((agent) => agent.id),
    },
  };
  return null;
}

/** INVSTG, Assigning Agents to an Investigation. */
function assignAgentsToInvestigation(
  world: CurrentWorldState,
  args: Args,
  gdrs: GdrCatalog,
): Rejection | null {
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
  const tired = requireFitForWork(agents, gdrs) ?? requireInBase(agents);
  if (tired) {
    return tired;
  }
  // Every Agent is on a Base Assignment, so none leaves another Investigation.
  for (const agent of agents) {
    agent.state.assignment = { kind: 'Investigation', investigation: investigation.id };
    agent.state.status = 'InTransit';
    investigation.state.currentTeam.push(agent.id);
  }
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
  // Condition 6: an Agent that cannot be assigned, e.g. one In transit, cannot be deployed.
  // Condition 7: only an Agent on a Base Assignment can be deployed.
  const blocked = requireOrderable(agents) ?? requireInBase(agents);
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
  const incapacitated = requireNotIncapacitated(world, agents, gdrs);
  if (incapacitated) {
    return incapacitated;
  }
  const id = newInstanceId(world, 'mission');
  const team = agents.map((agent) => agent.id);
  site.state.lifecycle = 'Deployed';
  world.missions[id] = {
    id,
    archetype: gdrs.missionArchetype.id,
    constants: { missionSite: site.id, turnDeployed: world.turn, teamSent: team },
    state: { lifecycle: 'Deployed', currentTeam: [...team] },
  };
  for (const agent of agents) {
    agent.state.assignment = { kind: 'Deployed', mission: id };
    agent.state.status = 'AtAssignment';
  }
  return null;
}

// ---- Cheat operations ----------------------------------------------------------------------------

/** ECON, Adding money. */
function addMoney(world: CurrentWorldState, args: Args): Rejection | null {
  const amount = args['amount'];
  if (!isWhole(amount) || amount === 0) {
    return reject('invalid_amount', 'The amount must be a whole number other than 0.', 'invalid_input');
  }
  // ECON, Agency properties: money is at least 0 in every Campaign without a Campaign ending.
  if (world.agency.state.money + amount < 0) {
    return reject(
      'negative_money',
      `Removing ${-amount} money would leave negative money: the Agency has ${world.agency.state.money}.`,
    );
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
  if (!Number.isSafeInteger((world.nextInstanceNumbers['agent'] ?? 1) + count)) {
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
  readonly instance: 'combatant' | 'agent' | 'lead' | 'faction';
}[] = [
  { pattern: /^agent\.trainingGain\.(.+)$/, value: 'boolean', instance: 'agent' },
  { pattern: /^combat\.hit\.(.+)$/, value: 'boolean', instance: 'combatant' },
  { pattern: /^combat\.damage\.(.+)$/, value: 'whole', instance: 'combatant' },
  { pattern: /^investigation\.requiredProgress\.(.+)$/, value: 'whole', instance: 'lead' },
  { pattern: /^faction\.(.+)\.levelDuration$/, value: 'whole', instance: 'faction' },
  { pattern: /^faction\.(.+)\.operationInterval$/, value: 'whole', instance: 'faction' },
  { pattern: /^faction\.(.+)\.operationLevel$/, value: 'whole', instance: 'faction' },
  { pattern: /^mission\.archetypeSelection\.(.+)$/, value: 'text', instance: 'faction' },
];

/** DEV, Random outcome overrides: the named random outcome takes the supplied value when it is next decided. */
function overrideRandomOutcome(world: CurrentWorldState, args: Args, gdrs: GdrCatalog): Rejection | null {
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
        : known.instance === 'agent'
          ? world.agents[instanceId] !== undefined
          : known.instance === 'lead'
            ? gdrs.leads.some((lead) => lead.id === instanceId)
            : world.factions[instanceId] !== undefined;
    if (!exists) {
      return reject(
        'unknown_instance',
        `${instanceId} identifies no Campaign instance or Lead that has this random outcome.`,
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
    // COMBAT, Damage outcome: a supplied damage outcome is one of the whole numbers from lo to hi.
    const agent = world.agents[instanceId];
    const enemy = world.enemies[instanceId];
    const weaponDamage =
      agent !== undefined
        ? effectiveWeaponDamage(agent.state, bonusOf(world, gdrs))
        : enemy?.state.baseWeaponDamage;
    if (outcome.startsWith('combat.damage.') && weaponDamage !== undefined && isWhole(value)) {
      const bounds = damageBounds(weaponDamage, gdrs.combatParameters);
      if (value < bounds.lo || value > bounds.hi) {
        return reject(
          'damage_out_of_range',
          `The damage outcome of ${instanceId} must be a whole number from ${bounds.lo} to ${bounds.hi}.`,
        );
      }
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
  random: Random | null = null,
): Rejection | null {
  const rejection = dispatchAction(world, record, gdrs, random);
  // LEAD, Lead discovery: `discovered_when` is evaluated in the World state that every Player action produces.
  if (rejection === null) {
    discoverLeads(world, gdrs.leads);
  }
  return rejection;
}

function dispatchAction(
  world: CurrentWorldState,
  record: ActionRecord,
  gdrs: GdrCatalog,
  random: Random | null,
): Rejection | null {
  // ENDING, After a Campaign ending: every Player action is rejected, whatever else also fails.
  if (world.ending !== null) {
    return reject('campaign_ended', `The Campaign has ended in ${world.ending}.`, 'campaign_ended');
  }
  const args: Args =
    typeof record.args === 'object' && record.args !== null ? (record.args as Args) : ({} satisfies Args);
  if (record.surface === 'player') {
    // DEC-089: a Timeline entry written before hiring took a count names `hireAgent`, which hired one Agent.
    if (record.name === 'hireAgent') {
      return hireAgents(world, { count: 1 }, gdrs);
    }
    switch (record.name as PlayerActionName) {
      case 'assignAgents':
        return assignAgents(world, args, gdrs);
      case 'hireAgents':
        return hireAgents(world, args, gdrs);
      case 'dismissAgents':
        return dismissAgents(world, args, gdrs);
      case 'purchaseUpgrade':
        return purchaseUpgrade(world, args, gdrs);
      case 'startInvestigation':
        return startInvestigation(world, args, gdrs, random);
      case 'assignAgentsToInvestigation':
        return assignAgentsToInvestigation(world, args, gdrs);
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
        return overrideRandomOutcome(world, args, gdrs);
    }
  }
  return reject('unknown_action', 'There is no such action.', 'invalid_input');
}
