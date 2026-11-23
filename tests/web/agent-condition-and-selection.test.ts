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

  it('colours exhaustion from its thresholds, with a triangle from the Danger threshold', () => {
    expect(exhaustionTone(29, levels)).toEqual({ tone: '', triangle: false });
    expect(exhaustionTone(30, levels)).toEqual({ tone: 'tone-warning', triangle: false });
    expect(exhaustionTone(50, levels)).toEqual({ tone: 'tone-accent', triangle: false });
    expect(exhaustionTone(70, levels)).toEqual({ tone: 'tone-bad', triangle: true });
  });

  // The colours themselves are checked by looking (TFOCUS, Presentation by looking); the rule is that the colour
  // follows the share of effective max health alone, and changes smoothly along it.
  it('colours current health on a smooth scale over its share of effective max health', () => {
    for (const [health, max] of [
      [30, 30],
      [27, 30],
      [15, 30],
      [1, 30],
      [0, 30],
    ] as const) {
      expect(healthColor(health * 2, max * 2), `${health} of ${max}`).toBe(healthColor(health, max));
    }
    const shades = Array.from({ length: 31 }, (_, health) => healthColor(health, 30));
    // Every point of health lost changes the colour.
    expect(new Set(shades).size).toBe(shades.length);
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
    contractingPlacesLeft: 2,
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

  it('with the Contracting cap full, an Agent that could otherwise go is blocked by Contracting full', () => {
    const full = {
      ...base,
      acceptedAlone: { ...base.acceptedAlone, Contracting: [] },
      contractingPlacesLeft: 0,
    };
    expect(blocked(a4, full)).toBe('Contracting full');
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
