/** RECOVER (Agent Recovery): the Health recovery rate, Recovery turns remaining, and the recovery of one Agent. */
import { percentOf, q, roundUp } from '../../../kernel/index.ts';
import type { RecoveryParametersGdr } from '../../../gdr/index.ts';
import type { AgentState } from '../../state/types.ts';

/** RECOVER, Health recovery: Health recovery rate = round up( p × base health / 100 ). */
export function healthRecoveryRate(baseHealth: number, parameters: RecoveryParametersGdr): number {
  return roundUp(percentOf(parameters.healthRecoveryPctPerTurn, baseHealth));
}

/** RECOVER: Recovery turns remaining = round up( (base health − current health) / Health recovery rate ). */
export function recoveryTurnsRemaining(
  agent: Pick<AgentState, 'baseHealth' | 'currentHealth'>,
  parameters: RecoveryParametersGdr,
): number {
  return roundUp(
    q(agent.baseHealth - agent.currentHealth).div(healthRecoveryRate(agent.baseHealth, parameters)),
  );
}

/**
 * The recovery of one Agent in the Agent recovery step. The Current assignment that decides eligibility is the one
 * at the start of the step, so an Agent that leaves Recovery recovers exhaustion exactly once.
 */
export function recoverAgent(agent: AgentState, parameters: RecoveryParametersGdr): void {
  const onRecovery = agent.assignment?.kind === 'Recovery';
  if (onRecovery) {
    agent.currentHealth = Math.min(
      agent.baseHealth,
      agent.currentHealth + healthRecoveryRate(agent.baseHealth, parameters),
    );
  }
  agent.exhaustion = Math.max(0, agent.exhaustion - parameters.exhaustionRecoveryPerTurn);
  if (onRecovery && agent.currentHealth === agent.baseHealth) {
    agent.assignment = { kind: 'Standby' };
    agent.taskPhase = 'AtAssignment';
  }
}
