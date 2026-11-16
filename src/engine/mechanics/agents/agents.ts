/**
 * AGENT (Agents): effective skill, attribute clamps, which Agents can be ordered, and Agent creation. Every function
 * receives only the values it needs; see DEC-003.
 */
import { q, roundDown } from '../../../kernel/index.ts';
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
  const over = Math.max(0, combatant.exhaustion - parameters.exhaustionFreePoints);
  const penaltyFactor = Math.max(0, 100 - parameters.skillPenaltyPctPerExhaustion * over);
  return roundDown(
    q(combatant.skill).mul(combatant.currentHealth).mul(penaltyFactor).div(q(combatant.baseHealth).mul(100)),
  );
}

/** AGENT, Attribute ranges: exhaustion stays from 0 to the exhaustion cap. */
export function clampExhaustion(value: number, parameters: AgentParametersGdr): number {
  return Math.min(parameters.exhaustionCap, Math.max(0, value));
}

/** AGENT, Attribute ranges: current health stays from 0 to base health. */
export function clampHealth(value: number, baseHealth: number): number {
  return Math.min(baseHealth, Math.max(0, value));
}

/** AGENT, Agents that can be assigned. */
export function canBeAssigned(agent: Pick<AgentState, 'status' | 'assignment'>): boolean {
  if (agent.status !== 'AtAssignment' || agent.assignment === null) {
    return false;
  }
  const kind = agent.assignment.kind;
  return kind === 'Standby' || kind === 'Contracting' || kind === 'Training' || kind === 'Investigation';
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
