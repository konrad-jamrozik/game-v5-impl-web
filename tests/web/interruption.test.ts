/** GUI, Confirming interrupted Assignments. */
import { describe, expect, it } from 'vitest';
import { currentStateView, previewProgressLoss } from '../../src/engine/views/views.ts';
import { interruptionMessage } from '../../src/web/interruption.ts';
import { act, agentIds, gdrs, newCampaign, setAssignment, tweak, withAgents } from '../helpers/game.ts';

describe('GUI: Confirming interrupted Assignments', () => {
  let state = withAgents(newCampaign(), 6);
  const [a1, a2, a3, a4, a5, a6] = agentIds(state) as [string, string, string, string, string, string];
  state = setAssignment(state, [a1], 'Contracting');
  state = setAssignment(state, [a2], 'Training');
  state = setAssignment(state, [a6], 'Contracting', 'InTransit');
  state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [a3, a4] });
  const i1 = Object.keys(state.world.current.investigations)[0]!;
  state = tweak(state, (world) => {
    world.agents[a3]!.state.status = 'AtAssignment';
    world.agents[a4]!.state.status = 'AtAssignment';
    world.agents[a4]!.state.skill = 300;
    world.investigations[i1]!.state.progress = 449;
  });
  const view = currentStateView(state, gdrs);
  /** The message for an order, with the progress losses the engine previews for it. */
  const message = (ids: readonly string[]) =>
    interruptionMessage(view, ids, previewProgressLoss(state, gdrs, ids));

  it('needs no confirmation for an order that interrupts no work', () => {
    // e.g. moving Agents between Standby and Training, or an Agent In transit that cannot be assigned.
    expect(message([a2, a5])).toBeNull();
    expect(message([a6])).toBeNull();
  });

  it('names each interrupted Agent and says it spends the next Advance turn In transit', () => {
    const text = message([a1, a5])!;
    expect(text).toContain(`${a1}, on Contracting`);
    expect(text).toContain('next Advance turn In transit doing nothing');
    expect(text).not.toContain(a5);
    expect(text).not.toContain('Investigations that');
  });

  it('names each Investigation that loses members, with its progress before and after, and each Abandoned', () => {
    // a3 takes 100 of the 400 effective skill At assignment: round down(449 × 300 / 400) = 336.
    expect(previewProgressLoss(state, gdrs, [a3])).toEqual([
      { investigation: i1, progressBefore: 449, progressAfter: 336, abandoned: false },
    ]);
    const reduced = message([a3])!;
    expect(reduced).toContain(`${a3}, on Investigation ${i1}`);
    expect(reduced).toContain(
      `Investigations that lose members, with their progress before and after the loss: ${i1} (Locate Red Dawn member) 4.49 to 3.36`,
    );
    expect(reduced).not.toContain('Abandoned');
    const abandoned = message([a3, a4])!;
    expect(abandoned).toContain(
      `Investigations that become Abandoned and lose all their progress: ${i1} (Locate Red Dawn member), 4.49 lost`,
    );
    expect(abandoned).not.toContain('lose members');
    // The preview agrees with the action itself.
    const after = act(state, 'assignAgents', { agents: [a3], assignment: 'Standby' });
    expect(after.world.current.investigations[i1]!.state.progress).toBe(336);
  });
});
