/** Tests, from the former Acceptance examples, of ENDING (Panic and Endings). */
import { describe, expect, it } from 'vite-plus/test';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import { applyPendingPanicChange, checkEnding } from '../../src/engine/mechanics/endings/endings.ts';
import { isRejection } from '../../src/engine/result.ts';
import { checkInvariants } from '../../src/engine/state/invariants.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentLiveWorldStateView } from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agentIds,
  catalogWith,
  completeLead,
  effect,
  expectDefective,
  expectRejected,
  finishingInvestigation,
  funding,
  gdrs,
  losing,
  money,
  newCampaign,
  onlyFaction,
  tweak,
  winning,
} from '../helpers/game.ts';

/** Sets Panic, in hundredths, money, funding, and the turn number directly. */
const set = (
  state: CampaignState,
  values: { panicHundredths?: number; money?: number; funding?: number; turn?: number },
) =>
  tweak(state, (world) => {
    world.panicHundredths = values.panicHundredths ?? world.panicHundredths;
    world.agency.state.money = values.money ?? world.agency.state.money;
    world.agency.state.funding = values.funding ?? world.agency.state.funding;
    world.turn = values.turn ?? world.turn;
  });

const ending = (state: CampaignState) => currentLiveWorldStateView(state, gdrs).ending;
const check = (values: {
  panicHundredths?: number;
  panicLimit?: number;
  money?: number;
  pendingVictory?: boolean;
  pendingDefeat?: boolean;
}) =>
  checkEnding({
    pendingVictory: values.pendingVictory ?? false,
    pendingDefeat: values.pendingDefeat ?? false,
    panicHundredths: values.panicHundredths ?? 0,
    panicLimit: values.panicLimit ?? 100,
    money: values.money ?? 500,
  });

/** The state after `terminate_red_dawn` is completed, in which `peace_on_earth` is discovered and Available. */
const peaceDiscovered = (state: CampaignState) => completeLead(state, 'terminate_red_dawn');

describe('ENDING: examples', () => {
  it('Panic is summed, clamped, and reaches Defeat', () => {
    let state = set(newCampaign(), { panicHundredths: 9995, money: 40, funding: 0, turn: 12 });
    const raid = addMissionSite(state, 'raid_safehouse');
    const response = addMissionSite(raid.state, 'counter_civilian_terror', { turnsUntilExpiration: 1 });
    state = act(response.state, 'deployAgents', { missionSite: raid.site, agents: agentIds(response.state) });
    state = advance(state, winning(state, raid.site));
    const report = state.world.history.turnReport!;
    expect(report.upkeep.moneyAfter).toBe(0);
    expect(report.missions[0]!.consequence).toMatchObject({
      money: 200,
      fundingChange: 10,
      panicReductionHundredths: 100,
    });
    expect(report.expiredMissionSites[0]!.consequence).toMatchObject({
      panicIncreaseHundredths: 1000,
      fundingChange: -25,
      defeat: false,
    });
    // 99.95 − 1.00 + 10.00 is clamped to 100.
    expect(report.panicHundredths).toEqual({ before: 9995, after: 10_000 });
    expect(state.world.current).toMatchObject({
      panicHundredths: 10_000,
      ending: 'Defeat',
      endingReasons: ['PanicAtTheLimit'],
      endingTurn: 12,
      turn: 13,
    });
    expect([money(state), funding(state)]).toEqual([200, 0]);

    // Rejected actions after a Campaign ending.
    const [a1] = agentIds(state) as [string];
    expectRejected(state, 'assignAgents', { agents: [a1], assignment: 'Standby' }, 'campaign_ended');
    expectRejected(state, 'addMoney', { amount: 100 }, 'campaign_ended', 'developer');
    expectRejected(state, 'hireAgent', {}, 'campaign_ended');
    const again = advanceTurnOf(state, gdrs);
    expect(isRejection(again) && again.code).toBe('campaign_ended');
    expect(ending(state)).toEqual({ ending: 'Defeat', reasons: ['PanicAtTheLimit'], turn: 12 });
    expect(currentLiveWorldStateView(state, gdrs)).toMatchObject({
      panicHundredths: 10_000,
      panicLimit: 100,
      turn: 13,
    });
  });

  it('Clamping once, not at each contribution; a cancelling pair; the floor; the ordinary case', () => {
    expect(applyPendingPanicChange(9800, 800 - 200 - 200)).toBe(10_000);
    expect(applyPendingPanicChange(9800, -200 + 800 - 200)).toBe(10_000);
    expect(applyPendingPanicChange(9900, 800 - 200 - 600)).toBe(9900);
    expect(applyPendingPanicChange(100, -200)).toBe(0);
    expect(applyPendingPanicChange(0, 0)).toBe(0);
    expect(applyPendingPanicChange(5000, 300 + 800 - 100 - 200)).toBe(5800);
    expect(applyPendingPanicChange(10_000, 500)).toBe(10_000);
    // Panic is a Decimal quantity: one event can change it by less than one percentage point, e.g. 40 + 0.30.
    expect(applyPendingPanicChange(4000, 30)).toBe(4030);
    expect(applyPendingPanicChange(2, 2 - 5)).toBe(0);
  });

  it('The Panic limit is inclusive, to the hundredth', () => {
    expect(check({ panicHundredths: 7999, panicLimit: 80 })).toBeNull();
    expect(check({ panicHundredths: 8000, panicLimit: 80 })).toEqual({
      ending: 'Defeat',
      reasons: ['PanicAtTheLimit'],
    });
    expect(check({ panicHundredths: 9999, panicLimit: 100 })).toBeNull();
    expect(check({ panicHundredths: 10_000, panicLimit: 100 })).toEqual({
      ending: 'Defeat',
      reasons: ['PanicAtTheLimit'],
    });
    const catalog = catalogWith((raw) => (raw.get('endings')['defeat_at_panic_pct'] = 80));
    const state = advance(set(newCampaign({ money: 5000, catalog }), { panicHundredths: 8000 }), {}, catalog);
    expect(state.world.current.ending).toBe('Defeat');
  });

  it('Money below zero is Defeat; zero is not', () => {
    expect(check({ panicHundredths: 4000, money: 1 })).toBeNull();
    expect(check({ panicHundredths: 4000, money: 0 })).toBeNull();
    expect(check({ panicHundredths: 4000, money: -1 })).toEqual({
      ending: 'Defeat',
      reasons: ['MoneyBelowZero'],
    });
    expect(check({ money: -10 })).toEqual({ ending: 'Defeat', reasons: ['MoneyBelowZero'] });
    // Exactly zero after Upkeep: 40 + 0 − 40.
    const zero = advance(set(newCampaign(), { money: 40, funding: 0 }));
    expect([money(zero), zero.world.current.ending]).toEqual([0, null]);
  });

  it('Several Defeat conditions hold', () => {
    expect(check({ panicHundredths: 10_000, money: -5, pendingDefeat: true })).toEqual({
      ending: 'Defeat',
      reasons: ['PanicAtTheLimit', 'MoneyBelowZero', 'ExistentialOperationNotStopped'],
    });
    let state = set(newCampaign(), { panicHundredths: 9900, money: 35, funding: 0 });
    state = advance(addMissionSite(state, 'counter_civilian_terror', { turnsUntilExpiration: 1 }).state);
    expect(state.world.current).toMatchObject({
      panicHundredths: 10_000,
      ending: 'Defeat',
      endingReasons: ['PanicAtTheLimit', 'MoneyBelowZero'],
    });
    expect(money(state)).toBe(-5);
  });

  it('An existential operation not stopped loses the Campaign outright, with Panic unchanged', () => {
    // Expired: a Response Mission site of Faction operation level 5.
    let state = set(newCampaign(), { panicHundredths: 3500, turn: 40 });
    state = advance(addMissionSite(state, 'defend_against_hq_assault', { turnsUntilExpiration: 1 }).state);
    expect(state.world.history.turnReport!.expiredMissionSites[0]!.consequence).toMatchObject({
      defeat: true,
      panicIncreaseHundredths: 0,
    });
    expect(state.world.current).toMatchObject({
      panicHundredths: 3500,
      ending: 'Defeat',
      endingReasons: ['ExistentialOperationNotStopped'],
      endingTurn: 40,
    });
    // Lost: its Mission Lost has the same Consequence.
    let lost = set(newCampaign(), { panicHundredths: 1234 });
    const site = addMissionSite(lost, 'defend_against_hq_assault');
    lost = act(site.state, 'deployAgents', { missionSite: site.site, agents: agentIds(site.state) });
    lost = advance(lost, losing(lost, site.site));
    expect(lost.world.history.turnReport!.missions[0]).toMatchObject({
      result: 'Lost',
      consequence: { defeat: true },
    });
    expect(lost.world.current).toMatchObject({
      panicHundredths: 1234,
      ending: 'Defeat',
      endingReasons: ['ExistentialOperationNotStopped'],
    });
    expect(check({ pendingDefeat: true })).toEqual({
      ending: 'Defeat',
      reasons: ['ExistentialOperationNotStopped'],
    });
  });

  it('Completing the Lead that wins the Campaign is Victory, and Victory prevails over Defeat', () => {
    let state = set(peaceDiscovered(newCampaign()), {
      panicHundredths: 9995,
      money: 30,
      funding: 0,
      turn: 150,
    });
    expect(state.world.current.discoveredLeads).toContain('peace_on_earth');
    const [a1] = agentIds(state) as [string];
    const peace = finishingInvestigation(state, 'peace_on_earth', a1);
    // An existential operation not stopped and Panic at the limit in the same Advance turn.
    const response = addMissionSite(peace.state, 'defend_against_hq_assault', { turnsUntilExpiration: 1 });
    const foil = addMissionSite(response.state, 'counter_civilian_terror', { turnsUntilExpiration: 1 });
    state = advance(foil.state);
    expect(state.world.current.investigations[peace.investigation]!.state.lifecycle).toBe('Completed');
    expect(state.world.current).toMatchObject({
      ending: 'Victory',
      endingReasons: ['CampaignObjectiveAchieved'],
      endingTurn: 150,
      panicHundredths: 10_000,
    });
    expect(money(state)).toBe(-10);
    expect(check({ pendingVictory: true, pendingDefeat: true, money: -1, panicHundredths: 10_000 })).toEqual({
      ending: 'Victory',
      reasons: ['CampaignObjectiveAchieved'],
    });
  });

  it('Every Faction Eliminated is not Victory', () => {
    let state = tweak(newCampaign(), (world) => {
      for (const faction of Object.values(world.factions)) {
        faction.state.eliminated = true;
        faction.state.eliminatedTurn = 1;
      }
    });
    state = advance(state);
    expect(onlyFaction(state).state.eliminated).toBe(true);
    expect(state.world.current.ending).toBeNull();
    // A Game build without a Lead that wins the Campaign: the Campaign ends only in Defeat.
    const catalog = catalogWith((raw) => {
      const file = raw.files.find((item) => item.path.endsWith('/leads.yaml'))!;
      file.gdrs = file.gdrs.filter((gdr) => gdr['id'] !== 'peace_on_earth');
      raw.pruneArticles();
    });
    expect(catalog.leads.some((lead) => lead.onCompletion.winCampaign)).toBe(false);
    expect(advance(newCampaign({ catalog }), {}, catalog).world.current.ending).toBeNull();
    expect(check({ panicHundredths: 10_000 })?.ending).toBe('Defeat');
  });

  it('Player actions never end a Campaign', () => {
    let state = set(newCampaign(), { panicHundredths: 2000, turn: 5 });
    state = act(state, 'assignAgents', { agents: [agentIds(state)[0]], assignment: 'Training' });
    expectRejected(state, 'purchaseUpgrade', { upgrade: 'transport_cap' }, 'not_enough_money');
    expect([money(state), state.world.current.panicHundredths, ending(state)]).toEqual([500, 2000, null]);
  });

  it('Player-visible information', () => {
    const view = currentLiveWorldStateView(newCampaign(), gdrs);
    expect(view).toMatchObject({ panicHundredths: 0, panicLimit: 100, ending: null });
    expect(JSON.stringify(view)).not.toMatch(/pending/i);
  });

  it('State invariants', () => {
    const state = newCampaign();
    const invalid = (change: Parameters<typeof tweak>[1]) =>
      expect(checkInvariants(tweak(state, change), gdrs).length).toBeGreaterThan(0);
    invalid((world) => (world.panicHundredths = 10_001));
    invalid((world) => (world.panicHundredths = -1));
    invalid((world) => (world.panicHundredths = 12.5));
    // ECON, Agency properties: money is negative only in a Campaign that has a Campaign ending.
    invalid((world) => (world.agency.state.money = -1));
    // AGENT, Agent status: a Serving Agent that is not on Recovery has full current health.
    invalid((world) => (Object.values(world.agents)[0]!.state.healthLostHundredths += 100));
    invalid((world) => {
      world.ending = 'Victory';
      world.endingReasons = ['MoneyBelowZero'];
      world.endingTurn = 3;
    });
    invalid((world) => {
      world.ending = 'Defeat';
      world.endingReasons = ['CampaignObjectiveAchieved'];
      world.endingTurn = 3;
    });
    invalid((world) => (world.ending = 'Defeat'));
    expect(
      checkInvariants(
        tweak(state, (world) => {
          world.ending = 'Defeat';
          world.endingReasons = ['PanicAtTheLimit', 'MoneyBelowZero', 'ExistentialOperationNotStopped'];
          world.endingTurn = 3;
          world.agency.state.money = -1;
        }),
        gdrs,
      ),
    ).toEqual([]);
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
    // ENDING, Defeat Effect kind and Victory Effect kind: the value is `true`; any other value is invalid.
    expectDefective(
      (raw) => (raw.get('operation_level_5')['on_ignored_or_lost'] = [effect('defeat', false)]),
    );
    expectDefective((raw) => (raw.get('peace_on_earth')['on_completion'] = [effect('win_campaign', 1)]));
    // ENDING, Panic Effect kind: at most two decimal places.
    expectDefective(
      (raw) =>
        (raw.get('operation_level_1')['on_ignored_or_lost'] = [effect('panic', { $decimal: '0.025' })]),
    );
    expect(
      catalogWith(
        (raw) =>
          (raw.get('operation_level_1')['on_ignored_or_lost'] = [effect('panic', { $decimal: '0.25' })]),
      ).factionOperationLevels[0]!.onIgnoredOrLost.panicIncreaseHundredths,
    ).toBe(25);
    expect(gdrs.factionOperationLevels.find((level) => level.level === 5)!.onIgnoredOrLost).toEqual({
      panicIncreaseHundredths: 0,
      funding: 0,
      defeat: true,
    });
  });
});
