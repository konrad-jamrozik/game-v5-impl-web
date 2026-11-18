/** RECOVER (Agent Recovery): the Health recovery rate, Recovery turns remaining, and the recovery of one Agent. */
import { percentOf, q, roundUp } from '../../../kernel/index.ts';
import type { AgentState } from '../../state/types.ts';
import type { UpgradedRates } from '../economy/economy.ts';

/** The rates the Agent recovery step reads: RecoveryParameters raised by Rate Upgrades; see ECON, Rate Upgrades. */
export type RecoveryRates = Pick<UpgradedRates, 'healthRecoveryPct' | 'exhaustionRecovery'>;

/**
 * RECOVER, Health recovery: Health recovery rate = round up( p × base health / 100 ), where p is the health recovery
 * percentage.
 */
export function healthRecoveryRate(baseHealth: number, healthRecoveryPct: number): number {
  return roundUp(percentOf(healthRecoveryPct, baseHealth));
}

/** RECOVER: Recovery turns remaining = round up( (base health − current health) / Health recovery rate ). */
export function recoveryTurnsRemaining(
  agent: Pick<AgentState, 'baseHealth' | 'currentHealth'>,
  healthRecoveryPct: number,
): number {
  return roundUp(
    q(agent.baseHealth - agent.currentHealth).div(healthRecoveryRate(agent.baseHealth, healthRecoveryPct)),
  );
}

/**
 * The recovery of one Agent in the Agent recovery step. The Current assignment that decides eligibility is the one
 * at the start of the step, so an Agent that leaves Recovery recovers exhaustion exactly once.
 */
export function recoverAgent(agent: AgentState, rates: RecoveryRates): void {
  const onRecovery = agent.assignment?.kind === 'Recovery';
  if (onRecovery) {
    agent.currentHealth = Math.min(
      agent.baseHealth,
      agent.currentHealth + healthRecoveryRate(agent.baseHealth, rates.healthRecoveryPct),
    );
  }
  agent.exhaustion = Math.max(0, agent.exhaustion - rates.exhaustionRecovery);
  if (onRecovery && agent.currentHealth === agent.baseHealth) {
    agent.assignment = { kind: 'Standby' };
    agent.status = 'AtAssignment';
  }
}
