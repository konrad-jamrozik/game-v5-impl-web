/** RECOVER (Agent Recovery): the Health recovery rate, Recovery turns remaining, and the recovery of one Agent. */
import { fromHundredths, percentOf, roundUp, roundUpToHundredths } from '../../../kernel/index.ts';
import type { AgentState } from '../../state/types.ts';
import { effectiveMaxHealth, type AgentUpgradeBonus, type CombatantValues } from '../agents/agents.ts';
import type { UpgradedRates } from '../economy/economy.ts';

/** The rates the Agent recovery step reads: RecoveryParameters raised by Rate Upgrades; see ECON, Rate Upgrades. */
export type RecoveryRates = Pick<
  UpgradedRates,
  'healthRecoveryPctHundredths' | 'exhaustionRecoveryHundredths'
>;

/**
 * RECOVER, Health recovery: Health recovery rate = round up to hundredths( p × effective max health / 100 ), where p
 * is the health recovery percentage, a Decimal quantity in hundredths. The result is in hundredths, and it is both
 * what the engine API reports and what each recovery adds; see NUMBERS, Decimal quantities.
 */
export function healthRecoveryRateHundredths(maxHealth: number, healthRecoveryPctHundredths: number): number {
  return roundUpToHundredths(percentOf(fromHundredths(healthRecoveryPctHundredths), maxHealth));
}

/**
 * RECOVER: Recovery turns remaining = round up( (effective max health − current health) / Health recovery rate ).
 */
export function recoveryTurnsRemaining(
  agent: Pick<CombatantValues, 'maxHealth' | 'currentHealthHundredths'>,
  healthRecoveryPctHundredths: number,
): number {
  return roundUp(
    fromHundredths(agent.maxHealth * 100 - agent.currentHealthHundredths).div(
      fromHundredths(healthRecoveryRateHundredths(agent.maxHealth, healthRecoveryPctHundredths)),
    ),
  );
}

/**
 * The recovery of one Agent in the Agent recovery step. The Current assignment that decides eligibility is the one
 * at the start of the step, so an Agent that leaves Recovery recovers exhaustion exactly once.
 */
export function recoverAgent(agent: AgentState, rates: RecoveryRates, bonus: AgentUpgradeBonus): void {
  const onRecovery = agent.assignment?.kind === 'Recovery';
  if (onRecovery) {
    // AGENT, Effective max health and current health: raising current health by the Health recovery rate lowers
    // health lost by it, and the clamp at effective max health is a clamp of health lost at 0. No rounding occurs:
    // every term is a Decimal quantity, and the comparison with effective max health is exact.
    const rate = healthRecoveryRateHundredths(
      effectiveMaxHealth(agent, bonus),
      rates.healthRecoveryPctHundredths,
    );
    agent.healthLostHundredths = Math.max(0, agent.healthLostHundredths - rate);
  }
  // RECOVER, Exhaustion recovery: only this rule reads and lowers Exact exhaustion by an amount that need not be whole.
  agent.exactExhaustionHundredths = Math.max(
    0,
    agent.exactExhaustionHundredths - rates.exhaustionRecoveryHundredths,
  );
  if (onRecovery && agent.healthLostHundredths === 0) {
    agent.assignment = { kind: 'Standby' };
    agent.status = 'AtAssignment';
  }
}
