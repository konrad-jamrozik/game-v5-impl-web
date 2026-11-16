/** Acceptance examples of ENDING (Panic and Endings). */
import { describe, expect, it } from 'vitest';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import { applyPendingPanicChange, checkEnding } from '../../src/engine/mechanics/endings/endings.ts';
import { isRejection } from '../../src/engine/result.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agentIds,
  catalogWith,
  expectDefective,
  expectRejected,
  funding,
  gdrs,
  losing,
  money,
  newCampaign,
  tweak,
  winning,
} from '../helpers/game.ts';

const set = (
  state: CampaignState,
  values: { panic?: number; money?: number; funding?: number; turn?: number },
) =>
  tweak(state, (world) => {
    world.panic = values.panic ?? world.panic;
    world.agency.state.money = values.money ?? world.agency.state.money;
    world.agency.state.funding = values.funding ?? world.agency.state.funding;
    world.turn = values.turn ?? world.turn;
  });

const ending = (state: CampaignState) => currentStateView(state, gdrs).ending;

describe('ENDING: Acceptance examples', () => {
  it('Panic is summed, clamped, and reaches Defeat', () => {
    let state = set(newCampaign(), { panic: 97, money: 40, funding: 0, turn: 12 });
    const raid = addMissionSite(state, 'raid_safehouse');
    const response = addMissionSite(raid.state, 'foil_sabotage', { turnsUntilExpiration: 1 });
    state = act(response.state, 'deployAgents', { missionSite: raid.site, agents: agentIds(response.state) });
    state = advance(state, winning(state, raid.site));
    const report = state.world.history.turnReport!;
    expect(report.upkeep.moneyAfter).toBe(0);
    expect(report.missions[0]!.consequence).toMatchObject({
      money: 100,
      fundingChange: 5,
      panicReduction: 2,
    });
    expect(report.expiredMissionSites[0]!.consequence).toMatchObject({ panicIncrease: 8, fundingChange: -1 });
    expect(state.world.current).toMatchObject({
      panic: 100,
      ending: 'Defeat',
      endingReasons: ['PanicAtTheLimit'],
      endingTurn: 12,
      turn: 13,
    });
    expect([money(state), funding(state)]).toEqual([100, 4]);

    // Rejected actions after a Campaign ending.
    const [a1] = agentIds(state) as [string];
    expectRejected(state, 'assignAgents', { agents: [a1], assignment: 'Standby' }, 'campaign_ended');
    expectRejected(state, 'addMoney', { amount: 100 }, 'campaign_ended', 'developer');
    expectRejected(state, 'hireAgent', {}, 'campaign_ended');
    const again = advanceTurnOf(state, gdrs);
    expect(isRejection(again) && again.code).toBe('campaign_ended');
    expect(ending(state)).toEqual({ ending: 'Defeat', reasons: ['PanicAtTheLimit'], turn: 12 });
    expect(currentStateView(state, gdrs)).toMatchObject({ panic: 100, panicLimit: 100, turn: 13 });
  });

  it('Clamping once, not at each contribution; a cancelling pair; the floor; the ordinary case', () => {
    expect(applyPendingPanicChange(98, 8 - 2 - 2)).toBe(100);
    expect(applyPendingPanicChange(98, -2 + 8 - 2)).toBe(100);
    expect(applyPendingPanicChange(99, 8 - 2 - 6)).toBe(99);
    expect(applyPendingPanicChange(1, -2)).toBe(0);
    expect(applyPendingPanicChange(0, 0)).toBe(0);
    expect(applyPendingPanicChange(50, 3 + 8 - 1 - 2)).toBe(58);
    expect(applyPendingPanicChange(100, 5)).toBe(100);
  });

  it('The Panic limit is inclusive', () => {
    const check = (panic: number, panicLimit: number) =>
      checkEnding({ factionsEliminated: [false], panic, panicLimit, money: 500 });
    expect(check(79, 80)).toBeNull();
    expect(check(80, 80)).toEqual({ ending: 'Defeat', reasons: ['PanicAtTheLimit'] });
    expect(check(99, 100)).toBeNull();
    expect(check(100, 100)).toEqual({ ending: 'Defeat', reasons: ['PanicAtTheLimit'] });
    const catalog = catalogWith((raw) => (raw.get('endings')['defeat_at_panic_pct'] = 80));
    const state = advance(set(newCampaign({ money: 5000, catalog }), { panic: 80 }), {}, catalog);
    expect(state.world.current.ending).toBe('Defeat');
  });

  it('Money below zero is Defeat; zero is not', () => {
    const check = (amount: number) =>
      checkEnding({ factionsEliminated: [false], panic: 40, panicLimit: 100, money: amount });
    expect(check(1)).toBeNull();
    expect(check(0)).toBeNull();
    expect(check(-1)).toEqual({ ending: 'Defeat', reasons: ['MoneyBelowZero'] });
    expect(check(-10)).toEqual({ ending: 'Defeat', reasons: ['MoneyBelowZero'] });
    // Exactly zero after Upkeep: 40 + 0 − 40.
    const zero = advance(set(newCampaign(), { money: 40, funding: 0 }));
    expect([money(zero), zero.world.current.ending]).toEqual([0, null]);
  });

  it('Both Defeat conditions hold', () => {
    expect(checkEnding({ factionsEliminated: [false], panic: 100, panicLimit: 100, money: -5 })).toEqual({
      ending: 'Defeat',
      reasons: ['PanicAtTheLimit', 'MoneyBelowZero'],
    });
    let state = set(newCampaign(), { panic: 95, money: 35, funding: 0 });
    state = advance(addMissionSite(state, 'foil_sabotage', { turnsUntilExpiration: 1 }).state);
    expect(state.world.current).toMatchObject({
      panic: 100,
      ending: 'Defeat',
      endingReasons: ['PanicAtTheLimit', 'MoneyBelowZero'],
    });
    expect(money(state)).toBe(-5);
  });

  it('Victory prevails over Defeat', () => {
    let state = set(newCampaign(), { panic: 95, money: 30, funding: 0, turn: 150 });
    const [a1, a2, a3, a4] = agentIds(state) as [string, string, string, string];
    const hq = addMissionSite(state, 'raid_hq');
    const response = addMissionSite(hq.state, 'foil_sabotage');
    state = act(response.state, 'deployAgents', { missionSite: hq.site, agents: [a1, a2] });
    state = act(state, 'deployAgents', { missionSite: response.site, agents: [a3, a4] });
    // The team at raid_hq wins and the team at the Response Mission site loses.
    const injected = { ...losing(state, response.site), ...winning(state, hq.site) };
    for (const id of [a3, a4]) {
      injected[`combat.hit.${id}`] = new Array<boolean>(400).fill(false);
    }
    for (const id of state.world.current.missionSites[response.site]!.state.enemies) {
      injected[`combat.hit.${id}`] = new Array<boolean>(400).fill(true);
    }
    state = advance(state, injected);
    const report = state.world.history.turnReport!;
    expect(report.missions.map((m) => m.result)).toEqual(['Won', 'Lost']);
    expect(state.world.current).toMatchObject({
      ending: 'Victory',
      endingReasons: ['EveryFactionEliminated'],
      endingTurn: 150,
      panic: 100,
    });
    expect(money(state)).toBe(-10);
    expect(funding(state)).toBe(0);
    expect(Object.values(state.world.current.factions)[0]!.state.eliminatedTurn).toBe(150);
  });

  it('Victory needs a Faction', () => {
    const catalog = catalogWith((raw) => {
      raw.files.find((file) => file.path.endsWith('faction_archetypes.yaml'))!.gdrs.length = 0;
      raw.files.find((file) => file.path.endsWith('leads.yaml'))!.gdrs.length = 0;
    });
    let state = newCampaign({ catalog });
    expect(Object.keys(state.world.current.factions)).toHaveLength(0);
    state = advance(state, {}, catalog);
    expect(state.world.current.ending).toBeNull();
    expect(checkEnding({ factionsEliminated: [], panic: 0, panicLimit: 100, money: 500 })).toBeNull();
    expect(checkEnding({ factionsEliminated: [], panic: 100, panicLimit: 100, money: 500 })?.ending).toBe(
      'Defeat',
    );
  });

  it('Player actions never end a Campaign', () => {
    let state = set(newCampaign(), { panic: 20, turn: 5 });
    state = act(state, 'assignAgents', { agents: [agentIds(state)[0]], assignment: 'Training' });
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'transport_cap' }, 'not_enough_money');
    expect([money(state), state.world.current.panic, ending(state)]).toEqual([500, 20, null]);
  });

  it('Player-visible information', () => {
    const view = currentStateView(newCampaign(), gdrs);
    expect(view).toMatchObject({ panic: 0, panicLimit: 100, ending: null });
    expect(JSON.stringify(view)).not.toMatch(/pending/i);
  });

  it('State invariants', () => {
    const state = newCampaign();
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.panic = 101));
    invalid((world) => {
      world.ending = 'Victory';
      world.endingReasons = ['MoneyBelowZero'];
      world.endingTurn = 3;
    });
    invalid((world) => (world.ending = 'Defeat'));
  });

  it('GDR validation', () => {
    expectDefective((raw) => {
      raw.files.find((file) => file.path.endsWith('ending_parameters.yaml'))!.gdrs.length = 0;
    });
    expectDefective((raw) =>
      raw.add('panic-and-endings/ending_parameters.yaml', { ...raw.get('endings'), id: 'endings_alt' }),
    );
    expectDefective((raw) => (raw.get('endings')['defeat_at_panic_pct'] = 0));
    expectDefective((raw) => (raw.get('endings')['defeat_at_panic_pct'] = 101));
    expectDefective((raw) => (raw.get('endings')['defeat_at_panic_pct'] = { $decimal: '99.5' }));
    expectDefective((raw) => (raw.get('endings')['panic_floor'] = 0));
    expect(
      catalogWith((raw) => (raw.get('endings')['defeat_at_panic_pct'] = 1)).endingParameters.defeatAtPanicPct,
    ).toBe(1);
  });
});
