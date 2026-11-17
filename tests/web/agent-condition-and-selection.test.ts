/** VIS, Agent condition; AVIEW, Filters and Agent table. */
import { describe, expect, it } from 'vitest';
import { currentStateView } from '../../src/engine/views/views.ts';
import { isSelectable, unselectableReason, type Selectability } from '../../src/web/agent-selection.ts';
import { exhaustionTone, healthColor } from '../../src/web/condition-scale.ts';
import { agentIds, gdrs, newCampaign, setAssignment, tweak, withAgents } from '../helpers/game.ts';

describe('VIS: Agent condition', () => {
  const levels = { warning: 30, high: 50, danger: 70 };

  it('colours exhaustion from the AgentParameters thresholds, with a triangle from exhaustion_work_limit', () => {
    expect(exhaustionTone(29, levels)).toEqual({ tone: '', triangle: false });
    expect(exhaustionTone(30, levels)).toEqual({ tone: 'tone-warning', triangle: false });
    expect(exhaustionTone(50, levels)).toEqual({ tone: 'tone-accent', triangle: false });
    expect(exhaustionTone(70, levels)).toEqual({ tone: 'tone-bad', triangle: true });
  });

  it('colours current health on a smooth scale over its share of base health', () => {
    expect(healthColor(30, 30)).toBe('currentColor');
    expect(healthColor(15, 30)).toBe('var(--accent-text)');
    expect(healthColor(0, 30)).toBe('var(--danger-deep)');
    expect(healthColor(27, 30)).toBe('color-mix(in srgb, currentColor 60%, var(--warning))');
    expect(healthColor(1, 30)).toMatch(/var\(--danger\) 13\.3%, var\(--danger-deep\)/);
  });
});

describe('AVIEW: Selection filters and reasons', () => {
  let state = withAgents(newCampaign(), 5);
  const [a1, a2, a3, a4, a5] = agentIds(state) as [string, string, string, string, string];
  state = setAssignment(state, [a1], 'Contracting');
  state = setAssignment(state, [a2], 'Contracting', 'InTransit');
  state = tweak(state, (world) => {
    world.agents[a3]!.state.exhaustion = 52;
    world.agents[a5]!.state.assignment = { kind: 'Recovery' };
    world.agents[a5]!.state.status = 'Recovering';
    world.agents[a5]!.state.currentHealth = 10;
  });
  const agents = currentStateView(state, gdrs).agents;
  const view = (id: string) => agents.find((agent) => agent.id === id)!;
  const base: Selectability = {
    acceptedAlone: { Standby: [a1, a2, a3], Contracting: [a2, a4], Training: [a1, a2, a4] },
    dismissable: [a3, a4],
    trainingPlacesLeft: 4,
    selectionFilter: 'Contracting',
    allowReassign: false,
  };
  const reason = (id: string, s: Selectability) => unselectableReason(view(id), s, () => 'engine says no');

  it('mutes Agents the selection filter rules out, with the first reason that applies', () => {
    expect(isSelectable(view(a4), base)).toBe(true);
    expect(reason(a4, base)).toBe('');
    expect(reason(a1, base)).toBe('On assignment');
    expect(reason(a2, base)).toBe('In transit');
    expect(reason(a3, base)).toBe('Too exhausted');
    expect(reason(a5, base)).toBe('Recovering');
  });

  it('lets Allow re-assigning make Agents on assignment or In transit selectable', () => {
    const allow = { ...base, allowReassign: true };
    expect(isSelectable(view(a2), allow)).toBe(true);
    expect(reason(a1, allow)).toBe('Already on Contracting');
  });

  it('without a selection filter, selects an Agent any button would succeed with', () => {
    const none = { ...base, selectionFilter: null };
    expect(isSelectable(view(a3), none)).toBe(true);
    expect(isSelectable(view(a1), none)).toBe(false);
    expect(reason(a5, none)).toBe('Recovering');
  });
});
