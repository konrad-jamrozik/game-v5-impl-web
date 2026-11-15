/**
 * ECON (Economy and Upgrades): the Agency caps, income, upkeep, funding changes, and Upgrade effects. Every function
 * receives only the values it needs; see DEC-003.
 */
import type { EconomyParametersGdr, UpgradeEffect, UpgradeGdr } from '../../../gdr/index.ts';
import type { AgentState } from '../../state/types.ts';

type Acquisitions = Readonly<Record<string, number>>;

/** The sum over every Upgrade with the given effect of increment × acquisitions. */
export function effectTotal(
  effect: UpgradeEffect,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): number {
  let total = 0;
  for (const upgrade of upgrades) {
    if (upgrade.effect === effect) {
      total += upgrade.increment * (acquisitions[upgrade.id] ?? 0);
    }
  }
  return total;
}

export interface AgencyCaps {
  readonly agentCap: number;
  readonly transportCap: number;
  readonly trainingCap: number;
}

/** ECON, Agency caps: cap = base + Σ increment × acquisitions over the Upgrades of the cap's effect. */
export function agencyCaps(
  economy: EconomyParametersGdr,
  upgrades: readonly UpgradeGdr[],
  acquisitions: Acquisitions,
): AgencyCaps {
  return {
    agentCap: economy.baseAgentCap + effectTotal('agent_cap', upgrades, acquisitions),
    transportCap: economy.baseTransportCap + effectTotal('transport_cap', upgrades, acquisitions),
    trainingCap: economy.baseTrainingCap + effectTotal('training_cap', upgrades, acquisitions),
  };
}

type AgentLike = Pick<AgentState, 'lifecycle' | 'assignment' | 'taskPhase'>;

export function countServing(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => agent.lifecycle === 'Serving').length;
}

/** Serving Agents whose Current assignment is Training, At assignment or In transit. */
export function countTraining(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => agent.lifecycle === 'Serving' && agent.assignment?.kind === 'Training')
    .length;
}

/** Serving Agents whose Current assignment is Deployed, over every Mission together. */
export function countDeployed(agents: readonly AgentLike[]): number {
  return agents.filter((agent) => agent.lifecycle === 'Serving' && agent.assignment?.kind === 'Deployed')
    .length;
}

/** Serving Agents on Contracting and At assignment. */
export function countContractingAtAssignment(agents: readonly AgentLike[]): number {
  return agents.filter(
    (agent) =>
      agent.lifecycle === 'Serving' &&
      agent.assignment?.kind === 'Contracting' &&
      agent.taskPhase === 'AtAssignment',
  ).length;
}

/** ECON, Agency income: income = funding + contracting_income_per_agent × C. */
export function income(funding: number, contractingAgents: number, economy: EconomyParametersGdr): number {
  return funding + economy.contractingIncomePerAgent * contractingAgents;
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
