/** RECOVER (Agent Recovery): the Health recovery rate, Recovery turns remaining, and the recovery of one Agent. */
import { fromHundredths, percentOf, roundUp, roundUpToHundredths } from '../../../kernel/index.ts';
import type { AgentState } from '../../state/types.ts';
import type { UpgradedRates } from '../economy/economy.ts';

/** The rates the Agent recovery step reads: RecoveryParameters raised by Rate Upgrades; see ECON, Rate Upgrades. */
export type RecoveryRates = Pick<
  UpgradedRates,
  'healthRecoveryPctHundredths' | 'exhaustionRecoveryHundredths'
>;

/**
 * RECOVER, Health recovery: Health recovery rate = round up to hundredths( p × base health / 100 ), where p is the
 * health recovery percentage, a Decimal quantity in hundredths. The result is in hundredths, and it is both what the
 * engine API reports and what each recovery adds; see NUMBERS, Decimal quantities.
 */
export function healthRecoveryRateHundredths(
  baseHealth: number,
  healthRecoveryPctHundredths: number,
): number {
  return roundUpToHundredths(percentOf(fromHundredths(healthRecoveryPctHundredths), baseHealth));
}

/** RECOVER: Recovery turns remaining = round up( (base health − current health) / Health recovery rate ). */
export function recoveryTurnsRemaining(
  agent: Pick<AgentState, 'baseHealth' | 'currentHealthHundredths'>,
  healthRecoveryPctHundredths: number,
): number {
  return roundUp(
    fromHundredths(agent.baseHealth * 100 - agent.currentHealthHundredths).div(
      fromHundredths(healthRecoveryRateHundredths(agent.baseHealth, healthRecoveryPctHundredths)),
    ),
  );
}

/**
 * The recovery of one Agent in the Agent recovery step. The Current assignment that decides eligibility is the one
 * at the start of the step, so an Agent that leaves Recovery recovers exhaustion exactly once.
 */
export function recoverAgent(agent: AgentState, rates: RecoveryRates): void {
  const onRecovery = agent.assignment?.kind === 'Recovery';
  if (onRecovery) {
    // No rounding occurs: every term is a Decimal quantity, and the comparison with base health is exact.
    agent.currentHealthHundredths = Math.min(
      agent.baseHealth * 100,
      agent.currentHealthHundredths +
        healthRecoveryRateHundredths(agent.baseHealth, rates.healthRecoveryPctHundredths),
    );
  }
  // RECOVER, Exhaustion recovery: only this rule reads and lowers Exact exhaustion by an amount that need not be whole.
  agent.exactExhaustionHundredths = Math.max(
    0,
    agent.exactExhaustionHundredths - rates.exhaustionRecoveryHundredths,
  );
  if (onRecovery && agent.currentHealthHundredths === agent.baseHealth * 100) {
    agent.assignment = { kind: 'Standby' };
    agent.status = 'AtAssignment';
  }
}
