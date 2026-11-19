/**
 * AGENT (Agents): effective skill, attribute clamps, which Agents can be ordered, the start-work gate, work
 * exhaustion, and Agent creation. Every function
 * receives only the values it needs; see DEC-003.
 */
import { EngineDefect, fromHundredths, roundDown, roundUp, type Rational } from '../../../kernel/index.ts';
import type { AgentArchetypeGdr, AgentParametersGdr, WeaponGdr } from '../../../gdr/index.ts';
import type { Agent, AgentState, Assignment } from '../../state/types.ts';

/**
 * The values of a Combatant that effective skill reads, in the form of an Agent: base skill, current health, and Exact
 * exhaustion in hundredths, under NUMBERS, Decimal quantities, and the effective max health. An Agent's are read
 * through agentCombatantValues and an Enemy's through enemyCombatantValues.
 */
export interface CombatantValues {
  readonly skillHundredths: number;
  readonly currentHealthHundredths: number;
  /** AGENT, Effective max health and current health: the effective max health, a whole number of at least 1. */
  readonly maxHealth: number;
  readonly exactExhaustionHundredths: number;
}

/**
 * ECON, Upgrade bonus: what the Agency's acquired Upgrades add to the max health and to the weapon damage of every
 * Serving Agent; see AGENT, Effective max health and current health, and Effective weapon damage.
 */
export interface AgentUpgradeBonus {
  readonly maxHealth: number;
  readonly weaponDamage: number;
}

/**
 * AGENT, Effective max health and current health: an Agent's effective max health is its Final max health when it is
 * Terminated, and otherwise its base health plus the Upgrade bonus of agent_max_health.
 */
export function effectiveMaxHealth(
  agent: Pick<AgentState, 'baseHealth' | 'finalMaxHealth'>,
  bonus: AgentUpgradeBonus,
): number {
  return agent.finalMaxHealth ?? agent.baseHealth + bonus.maxHealth;
}

/** AGENT, Effective max health and current health: current health = effective max health − health lost, in hundredths. */
export function agentCurrentHealthHundredths(
  agent: Pick<AgentState, 'baseHealth' | 'finalMaxHealth' | 'healthLostHundredths'>,
  bonus: AgentUpgradeBonus,
): number {
  return effectiveMaxHealth(agent, bonus) * 100 - agent.healthLostHundredths;
}

/**
 * AGENT, Effective weapon damage: an Agent's is its Final weapon damage when it is Terminated, and otherwise its base
 * weapon damage plus the Upgrade bonus of agent_weapon_damage.
 */
export function effectiveWeaponDamage(
  agent: Pick<AgentState, 'baseWeaponDamage' | 'finalWeaponDamage'>,
  bonus: AgentUpgradeBonus,
): number {
  return agent.finalWeaponDamage ?? agent.baseWeaponDamage + bonus.weaponDamage;
}

/** The values of an Agent as CombatantValues. */
export function agentCombatantValues(agent: AgentState, bonus: AgentUpgradeBonus): CombatantValues {
  return {
    skillHundredths: agent.skillHundredths,
    currentHealthHundredths: agentCurrentHealthHundredths(agent, bonus),
    maxHealth: effectiveMaxHealth(agent, bonus),
    exactExhaustionHundredths: agent.exactExhaustionHundredths,
  };
}

/**
 * AGENT, Effective max health and current health: a rule that changes current health changes health lost by the
 * opposite amount, so setting current health stores the health lost it leaves.
 */
export function setAgentCurrentHealth(
  agent: AgentState,
  currentHealthHundredths: number,
  bonus: AgentUpgradeBonus,
): void {
  agent.healthLostHundredths = effectiveMaxHealth(agent, bonus) * 100 - currentHealthHundredths;
}

/**
 * AGENT, Service record: an Agent that becomes Terminated loses its Assignment and records Turn terminated, and its
 * Final max health and Final weapon damage from the World state before it became Terminated.
 */
export function terminateAgent(
  agent: AgentState,
  status: 'Killed' | 'Dismissed',
  turn: number,
  bonus: AgentUpgradeBonus,
): void {
  agent.finalMaxHealth = effectiveMaxHealth(agent, bonus);
  agent.finalWeaponDamage = effectiveWeaponDamage(agent, bonus);
  agent.status = status;
  agent.assignment = null;
  agent.turnTerminated = turn;
}

/**
 * The values of an Enemy, whose base skill, current health, and exhaustion are whole numbers, as CombatantValues. An
 * Enemy's effective max health is its base health.
 */
export function enemyCombatantValues(enemy: {
  readonly skill: number;
  readonly healthLost: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
}): CombatantValues {
  return {
    skillHundredths: enemy.skill * 100,
    currentHealthHundredths: (enemy.baseHealth - enemy.healthLost) * 100,
    maxHealth: enemy.baseHealth,
    exactExhaustionHundredths: enemy.exhaustion * 100,
  };
}

/** AGENT, Exhaustion and Exact exhaustion: exhaustion = round up( Exact exhaustion ), a whole number. */
export function exhaustionOf(combatant: Pick<CombatantValues, 'exactExhaustionHundredths'>): number {
  return roundUp(fromHundredths(combatant.exactExhaustionHundredths));
}

/**
 * AGENT, Effective skill:
 * penalty factor = max(0, 100 − p × max(0, exhaustion − f))
 * effective skill = round down( skill × current health × penalty factor / (effective max health × 100) )
 */
export function effectiveSkill(combatant: CombatantValues, parameters: AgentParametersGdr): number {
  return roundDown(
    fromHundredths(combatant.skillHundredths)
      .mul(fromHundredths(combatant.currentHealthHundredths))
      .mul(penaltyFactor(exhaustionOf(combatant), parameters))
      .div(combatant.maxHealth * 100),
  );
}

/** AGENT, Effective skill: the penalty factor, max(0, 100 − p × max(0, exhaustion − f)). */
export function penaltyFactor(exhaustion: number, parameters: AgentParametersGdr): number {
  const over = Math.max(0, exhaustion - parameters.exhaustionFreePoints);
  return Math.max(0, 100 - parameters.skillPenaltyPctPerExhaustion * over);
}

/** AGENT, Attribute ranges: exhaustion, and an Agent's Exact exhaustion, is at least 0, with no upper bound. */
export function clampExhaustion(value: number): number {
  return Math.max(0, value);
}

/**
 * AGENT, Exhaustion and Exact exhaustion, statement 2: a rule that raises an Agent's exhaustion by a whole number of
 * points raises its Exact exhaustion by that number.
 */
export function addExhaustion(agent: Pick<AgentState, 'exactExhaustionHundredths'>, points: number): void {
  agent.exactExhaustionHundredths = clampExhaustion(agent.exactExhaustionHundredths + points * 100);
}

/** AGENT, Start-work gate: an Agent is Fit for work exactly when its exhaustion is at most exhaustion_work_start_max. */
export function isFitForWork(
  agent: Pick<AgentState, 'exactExhaustionHundredths'>,
  parameters: AgentParametersGdr,
): boolean {
  return exhaustionOf(agent) <= parameters.exhaustionWorkStartMax;
}

/** AGENT, Assignments: a Work Assignment is Contracting, Training, or an Investigation. */
export function isWorkAssignment(kind: Assignment['kind']): boolean {
  return kind === 'Contracting' || kind === 'Training' || kind === 'Investigation';
}

/**
 * AGENT, Training growth: the Probability of the Training gain outcome,
 * current health × penalty factor / (effective max health × 100), exact and never rounded.
 */
export function trainingGainProbability(
  agent: Pick<CombatantValues, 'currentHealthHundredths' | 'maxHealth' | 'exactExhaustionHundredths'>,
  parameters: AgentParametersGdr,
): Rational {
  return fromHundredths(agent.currentHealthHundredths)
    .mul(penaltyFactor(exhaustionOf(agent), parameters))
    .div(agent.maxHealth * 100);
}

/**
 * AGENT, Work exhaustion and Forced return: adds the exhaustion of one Advance turn of work, then reports whether the
 * Agent has reached exhaustion_work_limit. The caller moves the Agent to Standby when it is still on that Work
 * Assignment.
 */
export function applyWorkExhaustion(
  agent: Pick<AgentState, 'exactExhaustionHundredths'>,
  gained: number,
  parameters: AgentParametersGdr,
): boolean {
  addExhaustion(agent, gained);
  return exhaustionOf(agent) >= parameters.exhaustionWorkLimit;
}

/**
 * AGENT, Mission growth: the survival skill gain of the n-th Mission survived, n counted from 1; the last entry of
 * skill_gain_per_mission_survived applies to every Mission beyond the list.
 */
export function survivalSkillGain(missionsSurvived: number, parameters: AgentParametersGdr): number {
  const list = parameters.skillGainPerMissionSurvived;
  const value = list[Math.min(missionsSurvived, list.length) - 1];
  if (missionsSurvived < 1 || value === undefined) {
    throw new EngineDefect('A survivor has survived at least one Mission');
  }
  return value;
}

/** What Mission growth gave one survivor of one Mission; see AGENT, Mission growth. */
export interface MissionGrowth {
  readonly survivalSkillGain: number;
  readonly missionSkillGain: number;
}

/**
 * AGENT, Mission growth: adds a survivor's combat skill gain and survival skill gain to its base skill and its
 * Experience. Every gain is a whole number, so the sums are exact. `missionsSurvived` is the number of Missions in its
 * Participation history, the resolved one included.
 */
export function applyMissionGrowth(
  agent: Pick<AgentState, 'skillHundredths' | 'experience'>,
  combatSkillGain: number,
  missionsSurvived: number,
  parameters: AgentParametersGdr,
): MissionGrowth {
  const survival = survivalSkillGain(missionsSurvived, parameters);
  const missionSkillGain = combatSkillGain + survival;
  agent.skillHundredths += missionSkillGain * 100;
  agent.experience += missionSkillGain;
  return { survivalSkillGain: survival, missionSkillGain };
}

/** AGENT, Attribute ranges: current health stays from 0 to effective max health. */
export function clampHealth(value: number, maxHealth: number): number {
  return Math.min(maxHealth, Math.max(0, value));
}

/** AGENT, Agents that can be assigned. */
export function canBeAssigned(agent: Pick<AgentState, 'status' | 'assignment'>): boolean {
  // AGENT, Agents that can be assigned: At assignment, on Standby, Contracting, Training, or an Investigation. An
  // Agent In transit, whatever its Assignment, must arrive first; see AGENT, Transit rule, No orders in transit.
  if (agent.status !== 'AtAssignment' || agent.assignment === null) {
    return false;
  }
  const kind = agent.assignment.kind;
  return kind === 'Standby' || kind === 'Contracting' || kind === 'Training' || kind === 'Investigation';
}

/**
 * AGENT, Assignments: a Base Assignment is Standby or Training, carried out in the Agency's base. Moving between Base
 * Assignments takes no transit, and only an Agent on one can be deployed or given an Away Assignment. An Agent on an
 * Away Assignment, Contracting or an Investigation, can only be recalled to Standby.
 */
export function isBaseAssignment(assignment: Assignment | null): boolean {
  return assignment !== null && (assignment.kind === 'Standby' || assignment.kind === 'Training');
}

/**
 * AGENT, Agent statuses: a Serving Agent is In base exactly when it is At assignment on Standby or Training, or
 * Recovering, whatever its current health and exhaustion. A Terminated Agent is neither In base nor Away.
 */
export function isInBase(agent: Pick<AgentState, 'status' | 'assignment'>): boolean {
  return (
    agent.status === 'Recovering' || (agent.status === 'AtAssignment' && isBaseAssignment(agent.assignment))
  );
}

/**
 * AGENT, Agent statuses: a Serving Agent is Away exactly when it is not In base, i.e. In transit, Deployed, or At
 * assignment on Contracting or an Investigation.
 */
export function isAway(agent: Pick<AgentState, 'status' | 'assignment'>): boolean {
  const serving =
    agent.status === 'AtAssignment' || agent.status === 'InTransit' || agent.status === 'Recovering';
  return serving && !isInBase(agent);
}

/** AGENT, Agent creation: the initial values of a new Agent. */
export function createAgent(input: {
  id: string;
  agencyId: string;
  turn: number;
  initialRoster: boolean;
  archetype: AgentArchetypeGdr;
  weapon: WeaponGdr;
}): Agent {
  // No Upgrade changes an initial value: a new Agent has no health lost, and its effective values follow the Upgrade
  // bonus like every other Serving Agent's.
  return {
    id: input.id,
    archetype: input.archetype.id,
    constants: { agency: input.agencyId, turnHired: input.turn },
    state: {
      skillHundredths: input.archetype.skill * 100,
      experience: 0,
      healthLostHundredths: 0,
      baseHealth: input.archetype.baseHealth,
      exactExhaustionHundredths: 0,
      weapon: input.weapon.id,
      baseWeaponDamage: input.weapon.damage,
      assignment: { kind: 'Standby' },
      status: input.initialRoster ? 'AtAssignment' : 'InTransit',
      participationHistory: [],
      enemiesKilled: 0,
      turnTerminated: null,
      killedBy: null,
      finalMaxHealth: null,
      finalWeaponDamage: null,
    },
  };
}

/** AGENT, Participation history records: adds an Investigation or a Mission unless it is already there. */
export function recordParticipation(
  agent: { participationHistory: { kind: 'Investigation' | 'Mission'; id: string }[] },
  kind: 'Investigation' | 'Mission',
  id: string,
): void {
  if (!agent.participationHistory.some((item) => item.kind === kind && item.id === id)) {
    agent.participationHistory.push({ kind, id });
  }
}

export function sameAssignment(a: Assignment | null, kind: Assignment['kind']): boolean {
  return a !== null && a.kind === kind;
}
