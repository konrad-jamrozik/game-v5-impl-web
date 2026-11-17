/**
 * AGENT (Agents): effective skill, attribute clamps, which Agents can be ordered, the start-work gate, work
 * exhaustion, and Agent creation. Every function
 * receives only the values it needs; see DEC-003.
 */
import { q, roundDown, type Rational } from '../../../kernel/index.ts';
import type { AgentArchetypeGdr, AgentParametersGdr, WeaponGdr } from '../../../gdr/index.ts';
import type { Agent, AgentState, Assignment } from '../../state/types.ts';

/** The values of a Combatant that effective skill reads; Agents and Enemies both have them. */
export interface CombatantValues {
  readonly skill: number;
  readonly currentHealth: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
}

/**
 * AGENT, Effective skill:
 * penalty factor = max(0, 100 − p × max(0, exhaustion − f))
 * effective skill = round down( skill × current health × penalty factor / (base health × 100) )
 */
export function effectiveSkill(combatant: CombatantValues, parameters: AgentParametersGdr): number {
  return roundDown(
    q(combatant.skill)
      .mul(combatant.currentHealth)
      .mul(penaltyFactor(combatant.exhaustion, parameters))
      .div(q(combatant.baseHealth).mul(100)),
  );
}

/** AGENT, Effective skill: the penalty factor, max(0, 100 − p × max(0, exhaustion − f)). */
export function penaltyFactor(exhaustion: number, parameters: AgentParametersGdr): number {
  const over = Math.max(0, exhaustion - parameters.exhaustionFreePoints);
  return Math.max(0, 100 - parameters.skillPenaltyPctPerExhaustion * over);
}

/** AGENT, Attribute ranges: exhaustion is at least 0, with no upper bound. */
export function clampExhaustion(value: number): number {
  return Math.max(0, value);
}

/** AGENT, Start-work gate: an Agent is Fit for work exactly when its exhaustion is at most exhaustion_work_start_max. */
export function isFitForWork(agent: Pick<AgentState, 'exhaustion'>, parameters: AgentParametersGdr): boolean {
  return agent.exhaustion <= parameters.exhaustionWorkStartMax;
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
  agent: Pick<CombatantValues, 'currentHealth' | 'baseHealth' | 'exhaustion'>,
  parameters: AgentParametersGdr,
): Rational {
  return q(agent.currentHealth)
    .mul(penaltyFactor(agent.exhaustion, parameters))
    .div(q(agent.baseHealth).mul(100));
}

/**
 * AGENT, Work exhaustion and Forced return: adds the exhaustion of one Advance turn of work, then reports whether the
 * Agent has reached exhaustion_work_limit. The caller moves the Agent to Standby when it is still on that Work
 * Assignment.
 */
export function applyWorkExhaustion(
  agent: Pick<AgentState, 'exhaustion'>,
  gained: number,
  parameters: AgentParametersGdr,
): boolean {
  agent.exhaustion = clampExhaustion(agent.exhaustion + gained);
  return agent.exhaustion >= parameters.exhaustionWorkLimit;
}

/** AGENT, Attribute ranges: current health stays from 0 to base health. */
export function clampHealth(value: number, baseHealth: number): number {
  return Math.min(baseHealth, Math.max(0, value));
}

/** AGENT, Agents that can be assigned. */
export function canBeAssigned(agent: Pick<AgentState, 'status' | 'assignment'>): boolean {
  // AGENT, Agents that can be assigned: At assignment or In transit, on Standby, Contracting, Training, or an
  // Investigation. An Agent In transit to Recovery cannot be assigned.
  if ((agent.status !== 'AtAssignment' && agent.status !== 'InTransit') || agent.assignment === null) {
    return false;
  }
  const kind = agent.assignment.kind;
  return kind === 'Standby' || kind === 'Contracting' || kind === 'Training' || kind === 'Investigation';
}

/**
 * AGENT, Assignments: a Base Assignment is Standby or Training, carried out in the Agency's base. Moving between Base
 * Assignments takes no transit, and only an Agent on one can be deployed.
 */
export function isBaseAssignment(assignment: Assignment | null): boolean {
  return assignment !== null && (assignment.kind === 'Standby' || assignment.kind === 'Training');
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
}): Agent {
  return {
    id: input.id,
    archetype: input.archetype.id,
    constants: { agency: input.agencyId, turnHired: input.turn },
    state: {
      skill: input.archetype.skill,
      currentHealth: input.archetype.baseHealth,
      baseHealth: input.archetype.baseHealth,
      exhaustion: 0,
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
