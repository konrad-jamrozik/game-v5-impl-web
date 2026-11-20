/** VIS, Agent condition; AVIEW, Assignment filters and Agent table. */
import { describe, expect, it } from 'vite-plus/test';
import { currentLiveWorldStateView } from '../../src/engine/views/views.ts';
import { blockedBy, isSelectable, type Selectability } from '../../src/web/agent-selection.ts';
import { exhaustionTone, healthColor } from '../../src/web/condition-scale.ts';
import {
  agentIds,
  gdrs,
  newCampaign,
  setAssignment,
  tweak,
  withAgents,
  setCurrentHealth,
} from '../helpers/game.ts';

describe('VIS: Agent condition', () => {
  const levels = { warning: 30, high: 50, danger: 70 };

  it('colours exhaustion from the AgentParameters thresholds, with a triangle from exhaustion_work_limit', () => {
    expect(exhaustionTone(29, levels)).toEqual({ tone: '', triangle: false });
    expect(exhaustionTone(30, levels)).toEqual({ tone: 'tone-warning', triangle: false });
    expect(exhaustionTone(50, levels)).toEqual({ tone: 'tone-accent', triangle: false });
    expect(exhaustionTone(70, levels)).toEqual({ tone: 'tone-bad', triangle: true });
  });

  it('colours current health on a smooth scale over its share of effective max health', () => {
    expect(healthColor(30, 30)).toBe('currentColor');
    expect(healthColor(15, 30)).toBe('var(--accent-text)');
    expect(healthColor(0, 30)).toBe('var(--danger-deep)');
    expect(healthColor(27, 30)).toBe('color-mix(in srgb, currentColor 60%, var(--warning))');
    expect(healthColor(1, 30)).toMatch(/var\(--danger\) 13\.3%, var\(--danger-deep\)/);
  });
});

describe('AVIEW: Assignment filters and Blocked by', () => {
  let state = withAgents(newCampaign(), 5);
  const [a1, a2, a3, a4, a5] = agentIds(state) as [string, string, string, string, string];
  state = setAssignment(state, [a1], 'Contracting');
  state = setAssignment(state, [a2], 'Contracting', 'InTransit');
  state = tweak(state, (world) => {
    world.agents[a3]!.state.exactExhaustionHundredths = 5200;
    world.agents[a5]!.state.assignment = { kind: 'Recovery' };
    world.agents[a5]!.state.status = 'Recovering';
    setCurrentHealth(world.agents[a5]!.state, 1000);
  });
  const agents = currentLiveWorldStateView(state, gdrs).agents;
  const view = (id: string) => agents.find((agent) => agent.id === id)!;
  const base: Selectability = {
    acceptedAlone: { Standby: [a1, a3], Contracting: [a4], Training: [a4] },
    trainingPlacesLeft: 4,
    assignmentFilter: 'Contracting',
  };
  const blocked = (id: string, s: Selectability) => blockedBy(view(id), s, () => 'engine says no');

  it('mutes Agents the Assignment filter rules out, with the first reason that applies', () => {
    expect(isSelectable(view(a4), base)).toBe(true);
    expect(blocked(a4, base)).toBe('');
    expect(blocked(a1, base)).toBe('On assignment');
    expect(blocked(a2, base)).toBe('In transit');
    expect(blocked(a3, base)).toBe('Too exhausted');
    expect(blocked(a5, base)).toBe('Recovering');
  });

  it('with the Standby Assignment filter, an Agent on Contracting can be selected and one In transit cannot', () => {
    const standby = { ...base, assignmentFilter: 'Standby' as const };
    expect(isSelectable(view(a1), standby)).toBe(true);
    expect(blocked(a2, standby)).toBe('In transit');
    expect(blocked(a4, standby)).toBe('Already on Standby');
  });

  it('without an Assignment filter, every shown Agent can be selected and no row is blocked', () => {
    const none = { ...base, assignmentFilter: null };
    for (const id of [a1, a2, a3, a4, a5]) {
      expect(isSelectable(view(id), none)).toBe(true);
      expect(blocked(id, none)).toBe('');
    }
  });
});
