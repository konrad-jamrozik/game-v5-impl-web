/**
 * GUI, Confirming interrupted Assignments: before a Player action that takes an Agent off Contracting or an
 * Investigation, the GUI asks the Player to confirm, naming each such Agent, each Investigation that loses members
 * with its Investigation progress before and after the loss, and each that becomes Abandoned and loses all its
 * progress. An order that interrupts no such Agent needs no confirmation. The progress after the loss comes from
 * the engine's `previewProgressLoss` query, so the GUI applies no rule of Progress loss itself.
 */
import type { CurrentStateView, ProgressLossPreview } from '../engine/index.ts';
import { theEngine } from './store.ts';
import { progressPoints } from './format.ts';

/**
 * The confirmation text for ordering `agentIds` to a new Assignment, or null when the order interrupts no Agent on
 * Contracting or an Investigation. Only Agents that can be assigned are considered, because the action rejects the
 * others and so interrupts nothing.
 */
export function interruptionMessage(
  state: CurrentStateView,
  agentIds: readonly string[],
  losses: readonly ProgressLossPreview[],
): string | null {
  const moving = new Set(agentIds);
  const interrupted = state.agents.filter(
    (agent) =>
      moving.has(agent.id) &&
      agent.canBeAssigned &&
      (agent.assignment?.kind === 'Contracting' || agent.assignment?.kind === 'Investigation'),
  );
  if (interrupted.length === 0) {
    return null;
  }
  const lines = [
    `This interrupts the work of ${interrupted.length === 1 ? 'an Agent' : `${interrupted.length} Agents`}, ` +
      'each of which spends the next Advance turn In transit doing nothing:',
    ...interrupted.map((agent) => {
      const assignment = agent.assignment;
      const from =
        assignment?.kind === 'Investigation' ? `Investigation ${assignment.investigation}` : 'Contracting';
      return `- ${agent.id}, on ${from}`;
    }),
  ];
  const name = (id: string): string => {
    const investigation = state.investigations.find((item) => item.id === id);
    return investigation === undefined ? id : `${id} (${investigation.leadName})`;
  };
  const reduced = losses.filter((item) => !item.abandoned);
  const abandoned = losses.filter((item) => item.abandoned);
  if (reduced.length > 0) {
    lines.push(
      `Investigations that lose members, with their progress before and after the loss: ${reduced
        .map(
          (item) =>
            `${name(item.investigation)} ${progressPoints(item.progressBefore)} to ${progressPoints(item.progressAfter)}`,
        )
        .join(', ')}.`,
    );
  }
  if (abandoned.length > 0) {
    lines.push(
      `Investigations that become Abandoned and lose all their progress: ${abandoned
        .map((item) => `${name(item.investigation)}, ${progressPoints(item.progressBefore)} lost`)
        .join(', ')}.`,
    );
  }
  lines.push('Continue?');
  return lines.join('\n');
}

/** Asks the Player to confirm an order that interrupts work; true when nothing needs confirming. */
export function confirmInterruption(state: CurrentStateView, agentIds: readonly string[]): boolean {
  const preview = theEngine().player.queries.previewProgressLoss(agentIds);
  const message = interruptionMessage(state, agentIds, preview.ok ? preview.value : []);
  return message === null || window.confirm(message);
}
