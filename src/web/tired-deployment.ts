/**
 * GUI, Warning on deploying tired Agents: before a `deployAgents` Player action whose team includes an Agent with
 * exhaustion of 20 or more, the GUI warns the Player, naming each such Agent with its exhaustion and effective skill,
 * and asks to confirm. It is a warning, not a block.
 */
import type { CurrentLiveWorldStateView } from '../engine/index.ts';
import { groupDigits } from './format.ts';
import { confirmOrGoBack } from './sound-player.ts';

/** The exhaustion from which the GUI warns; a constant of the GUI, not a GDR value, because no game rule reads it. */
export const TIRED_DEPLOYMENT_EXHAUSTION = 20;

/** The warning text for deploying `agentIds`, or null when no Agent of the team is tired. */
export function tiredDeploymentMessage(
  state: CurrentLiveWorldStateView,
  agentIds: readonly string[],
): string | null {
  const team = new Set(agentIds);
  const tired = state.agents.filter(
    (agent) => team.has(agent.id) && agent.exhaustion >= TIRED_DEPLOYMENT_EXHAUSTION,
  );
  if (tired.length === 0) {
    return null;
  }
  return [
    `${tired.length === 1 ? 'An Agent' : `${groupDigits(tired.length)} Agents`} of this team ${tired.length === 1 ? 'is' : 'are'} ` +
      'tired, and so will fight worse and drop out of the Combat sooner:',
    ...tired.map(
      (agent) =>
        `- ${agent.id}: exhaustion ${groupDigits(agent.exhaustion)}, effective skill ${groupDigits(agent.effectiveSkill)}`,
    ),
    'Deploy anyway?',
  ].join('\n');
}

/** Warns the Player before deploying tired Agents; true when the Player confirms or nothing needs a warning. */
export function confirmTiredDeployment(
  state: CurrentLiveWorldStateView,
  agentIds: readonly string[],
): boolean {
  const message = tiredDeploymentMessage(state, agentIds);
  return message === null || confirmOrGoBack(message);
}
