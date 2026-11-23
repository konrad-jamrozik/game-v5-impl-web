/**
 * ECON (Economy and Upgrades): the Agency caps, income, upkeep, funding changes, and Upgrade effects. Every function
 * receives only the values it needs.
 */
import { q, ratio, roundDown, type Rational } from '../../../kernel/index.ts';
import type {
  AgentParametersGdr,
  EconomyParametersGdr,
  RecoveryParametersGdr,
  UpgradeEffect,
  UpgradeGdr,
} from '../../../gdr/index.ts';
import { isServing, type AgentState } from '../../state/types.ts';
import type { AgentUpgradeBonus } from '../agents/agents.ts';

type Acquisitions = Readonly<Record<string, number>>;

/**
 * ECON, Upgrade bonus: the sum over every Upgrade with the given effect of increment × acquisitions, in hundredths.
 * No rounding occurs: a Decimal quantity times a whole number is a Decimal quantity.
 */
export function effectTotalHundredths(
  effect: UpgradeEffect,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): number {
  let total = 0;
  for (const upgrade of upgrades) {
    if (upgrade.effect === effect) {
      total += upgrade.incrementHundredths * (acquisitions[upgrade.id] ?? 0);
    }
  }
  return total;
}

export interface AgencyCaps {
  readonly agentCap: number;
  readonly transportCap: number;
  readonly trainingCap: number;
}

/**
 * The Upgrade bonus of an effect whose Increments are whole numbers, i.e. every effect but a Rate Upgrade's, in its
 * units; ECON, Upgrade makes the hundredths a multiple of 100.
 */
export function wholeBonus(
  effect: UpgradeEffect,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): number {
  return effectTotalHundredths(effect, upgrades, acquisitions) / 100;
}

/**
 * ECON, Upgrade effects: the Upgrade bonus of agent_max_health, which the effective max health of every Serving Agent
 * adds.
 */
export function agentUpgradeBonus(
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): AgentUpgradeBonus {
  return {
    maxHealth: wholeBonus('agent_max_health', upgrades, acquisitions),
  };
}

/** ECON, Agency caps: cap = base + Σ increment × acquisitions over the Upgrades of the cap's effect. */
export function agencyCaps(
  economy: EconomyParametersGdr,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): AgencyCaps {
  return {
    agentCap: economy.baseAgentCap + wholeBonus('agent_cap', upgrades, acquisitions),
    transportCap: economy.baseTransportCap + wholeBonus('transport_cap', upgrades, acquisitions),
    trainingCap: economy.baseTrainingCap + wholeBonus('training_cap', upgrades, acquisitions),
  };
}

/**
 * ECON, Contracting cap: 0 while Contracting is not unlocked, and otherwise base_contracting_cap plus
 * contracting_cap_per_initiative_level for each Initiative level won (LEAD, Contracting cap growth).
 */
export function contractingCap(
  economy: EconomyParametersGdr,
  unlocked: boolean,
  initiativeLevelsWon: number,
): number {
  return unlocked
    ? economy.baseContractingCap + economy.contractingCapPerInitiativeLevel * initiativeLevelsWon
    : 0;
}

/** The rates a Rate Upgrade raises, each a Decimal quantity held in hundredths; see ECON, Rate Upgrades. */
export interface UpgradedRates {
  readonly trainingSkillGainHundredths: number;
  readonly exhaustionRecoveryHundredths: number;
  /** The health recovery percentage, a Decimal quantity of percent. */
  readonly healthRecoveryPctHundredths: number;
}

/** ECON, Rate Upgrades: each rate = its GDR starting value + the Upgrade bonus of its effect. */
export function upgradedRates(
  agentParameters: Pick<AgentParametersGdr, 'trainingSkillGainPerTurnHundredths'>,
  recoveryParameters: Pick<
    RecoveryParametersGdr,
    'exhaustionRecoveryPerTurnHundredths' | 'healthRecoveryPctPerTurnHundredths'
  >,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): UpgradedRates {
  return {
    trainingSkillGainHundredths:
      agentParameters.trainingSkillGainPerTurnHundredths +
      effectTotalHundredths('training_skill_gain', upgrades, acquisitions),
    exhaustionRecoveryHundredths:
      recoveryParameters.exhaustionRecoveryPerTurnHundredths +
      effectTotalHundredths('exhaustion_recovery', upgrades, acquisitions),
    healthRecoveryPctHundredths:
      recoveryParameters.healthRecoveryPctPerTurnHundredths +
      effectTotalHundredths('health_recovery', upgrades, acquisitions),
  };
}

type AgentLike = Pick<AgentState, 'status' | 'assignment'>;

export function countServing(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => isServing(agent)).length;
}

/** Serving Agents whose Current assignment is Training, At assignment or In transit. */
export function countTraining(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => isServing(agent) && agent.assignment?.kind === 'Training').length;
}

/** ECON, Contracting cap: Serving Agents whose Assignment is Contracting, whatever their Agent status. */
export function countContracting(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => isServing(agent) && agent.assignment?.kind === 'Contracting').length;
}

/** Serving Agents whose Current assignment is Deployed, over every Mission together. */
export function countDeployed(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => isServing(agent) && agent.assignment?.kind === 'Deployed').length;
}

/** Serving Agents on Contracting and At assignment. */
export function contractingAtAssignment<T extends AgentLike>(agents: readonly T[]): T[] {
  return agents.filter(
    (agent) => agent.status === 'AtAssignment' && agent.assignment?.kind === 'Contracting',
  );
}

/** ECON, Agency income: the constant of the contribution rule, not a GDR value. */
export const CONTRACTING_REFERENCE_SKILL = 100;

/**
 * ECON, Agency income: contribution of one Agent =
 * contracting_income_per_agent × (1 + (effective skill − 100) / contracting_skill_scale).
 */
export function contractingContribution(effectiveSkill: number, economy: EconomyParametersGdr): Rational {
  return q(economy.contractingIncomePerAgent).mul(
    q(1).add(ratio(effectiveSkill - CONTRACTING_REFERENCE_SKILL, economy.contractingSkillScale)),
  );
}

/**
 * ECON, Agency income: income = funding + round down( sum of the contributions of the Agents in C ). Each
 * contribution is exact and the sum is rounded once.
 */
export function income(
  funding: number,
  contractingEffectiveSkills: readonly number[],
  economy: EconomyParametersGdr,
): number {
  let sum = q(0);
  for (const skill of contractingEffectiveSkills) {
    sum = sum.add(contractingContribution(skill, economy));
  }
  return funding + roundDown(sum);
}

/** ECON, Upkeep: upkeep = upkeep_per_agent × S. */
export function upkeep(servingAgents: number, economy: EconomyParametersGdr): number {
  return economy.upkeepPerAgent * servingAgents;
}

/** ECON, Funding changes: funding after = max(0, funding before + sum of the amounts of one step). */
export function fundingAfter(fundingBefore: number, amounts: readonly number[]): number {
  return Math.max(
    0,
    amounts.reduce((sum, amount) => sum + amount, fundingBefore),
  );
}
