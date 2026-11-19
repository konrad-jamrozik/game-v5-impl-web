/**
 * AGENT (Agents): effective skill, attribute clamps, which Agents can be ordered, the start-work gate, work
 * exhaustion, and Agent creation. Every function
 * receives only the values it needs; see DEC-003.
 */
import { fromHundredths, roundDown, roundUp, type Rational } from '../../../kernel/index.ts';
import type { AgentArchetypeGdr, AgentParametersGdr, WeaponGdr } from '../../../gdr/index.ts';
import type { Agent, AgentState, Assignment } from '../../state/types.ts';

/**
 * The values of a Combatant that effective skill reads, in the stored form of an Agent: base skill, current health,
 * and Exact exhaustion in hundredths, under NUMBERS, Decimal quantities. An Enemy's whole values are read through
 * enemyCombatantValues.
 */
export interface CombatantValues {
  readonly skillHundredths: number;
  readonly currentHealthHundredths: number;
  readonly baseHealth: number;
  readonly exactExhaustionHundredths: number;
}

/** The values of an Enemy, whose base skill, current health, and exhaustion are whole numbers, as CombatantValues. */
export function enemyCombatantValues(enemy: {
  readonly skill: number;
  readonly currentHealth: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
}): CombatantValues {
  return {
    skillHundredths: enemy.skill * 100,
    currentHealthHundredths: enemy.currentHealth * 100,
    baseHealth: enemy.baseHealth,
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
 * effective skill = round down( skill × current health × penalty factor / (base health × 100) )
 */
export function effectiveSkill(combatant: CombatantValues, parameters: AgentParametersGdr): number {
  return roundDown(
    fromHundredths(combatant.skillHundredths)
      .mul(fromHundredths(combatant.currentHealthHundredths))
      .mul(penaltyFactor(exhaustionOf(combatant), parameters))
      .div(combatant.baseHealth * 100),
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
 * current health × penalty factor / (base health × 100), exact and never rounded.
 */
export function trainingGainProbability(
  agent: Pick<CombatantValues, 'currentHealthHundredths' | 'baseHealth' | 'exactExhaustionHundredths'>,
  parameters: AgentParametersGdr,
): Rational {
  return fromHundredths(agent.currentHealthHundredths)
    .mul(penaltyFactor(exhaustionOf(agent), parameters))
    .div(agent.baseHealth * 100);
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

/** AGENT, Attribute ranges: current health stays from 0 to base health. */
export function clampHealth(value: number, baseHealth: number): number {
  return Math.min(baseHealth, Math.max(0, value));
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
  /** The weapon damage increments of the Upgrades acquired so far; see ECON, Weapon damage effect. */
  weaponDamageBonus: number;
  /** The base health increments of the Upgrades acquired so far; see ECON, Base health Upgrade. */
  baseHealthBonus: number;
}): Agent {
  const baseHealth = input.archetype.baseHealth + input.baseHealthBonus;
  return {
    id: input.id,
    archetype: input.archetype.id,
    constants: { agency: input.agencyId, turnHired: input.turn },
    state: {
      skillHundredths: input.archetype.skill * 100,
      currentHealthHundredths: baseHealth * 100,
      baseHealth,
      exactExhaustionHundredths: 0,
      weapon: input.weapon.id,
      weaponDamage: input.weapon.damage + input.weaponDamageBonus,
      assignment: { kind: 'Standby' },
      status: input.initialRoster ? 'AtAssignment' : 'InTransit',
      participationHistory: [],
      enemiesKilled: 0,
      turnTerminated: null,
      killedBy: null,
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
