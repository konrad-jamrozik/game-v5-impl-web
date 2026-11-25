/** CVIEW, Agency charts. */
import { describe, expect, it } from 'vite-plus/test';
import type { HistoryEntry, OpenHistoryEntry, StateSummary } from '../../src/engine/index.ts';
import {
  ACTIVITY_SERIES,
  activityBars,
  assetLines,
  combatStrength,
  moneyFlow,
  readoutText,
  skillBands,
  wornLines,
} from '../../src/web/agency-charts.ts';

describe('CVIEW: the lines over Agents by base skill', () => {
  it('count the Agents recovering and above each exhaustion threshold, named with the thresholds', () => {
    const worn = (recovering: number, aboveWorkLimit: number, aboveFreePoints: number) =>
      summary({ wornAgents: { recovering, aboveWorkLimit, aboveFreePoints } });
    const lines = wornLines(
      [entry(1, { turnEnd: worn(1, 0, 2) }), entry(2, { turnEnd: worn(2, 1, 3) })],
      { turn: 3, turnEnd: worn(0, 0, 1) } as unknown as OpenHistoryEntry,
      { workLimit: 70, freePoints: 30 },
    );
    expect(lines.map((line) => [line.name, line.color])).toEqual([
      ['Recovering', '#FF4D4D'],
      ['Exhaustion > 70', '#FF9A2E'],
      ['Exhaustion > 30', '#FFE14D'],
    ]);
    expect(lines[0]!.points).toEqual([
      { turn: 1, value: 1 },
      { turn: 2, value: 2 },
      { turn: 3, value: 0 },
    ]);
    expect(lines[2]!.points.map((point) => point.value)).toEqual([2, 3, 1]);
  });
});

const summary = (over: Partial<StateSummary> = {}): StateSummary => ({
  money: 0,
  funding: 20,
  panicHundredths: 0,
  servingAgents: 0,
  activeInvestigations: 0,
  activeMissionSites: 0,
  agentActivity: {
    standby: 0,
    training: 0,
    contracting: 0,
    investigating: 0,
    deployed: 0,
    recovering: 0,
    inTransit: 0,
  },
  baseSkills: [],
  servingCombatRating: 0,
  deployableCombatRating: 0,
  wornAgents: { recovering: 0, aboveWorkLimit: 0, aboveFreePoints: 0 },
  caps: { agentCap: 20, transportCap: 8, trainingCap: 10, contractingCap: 0 },
  ...over,
});

const consequence = (money: number) => ({
  money,
  fundingChange: 0,
  panicIncreaseHundredths: 0,
  panicReductionHundredths: 0,
  eliminatedFaction: null,
  defeat: false,
});

const entry = (turn: number, over: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({
    turn,
    turnStart: summary(),
    turnEnd: summary(),
    actions: [],
    report: {
      fundingUsed: 20,
      income: 70,
      upkeep: 40,
      missions: [],
      expiredConsequences: [],
    },
    ...over,
  }) as unknown as HistoryEntry;

describe('CVIEW: Agency charts', () => {
  // GUI, Ranks: the Rank GDRs in any order.
  const ranks = [
    { name: 'Agent', minBaseSkill: 200 },
    { name: 'Rookie', minBaseSkill: 100 },
    { name: 'Junior Agent', minBaseSkill: 150 },
    { name: 'Commander', minBaseSkill: 750 },
  ];

  it('example: Turn 7 has 5 Agents at 0–99, 7 Rookies, no Junior Agent, and 1 Agent', () => {
    const skills = [10, 20, 30, 40, 99, 100, 110, 120, 130, 140, 149, 100, 210];
    const open: OpenHistoryEntry = {
      turn: 7,
      turnStart: summary(),
      turnEnd: summary({ baseSkills: skills }),
      actions: [],
    };
    const { series, bars } = skillBands([], open, ranks);
    expect(series.map((band) => band.name)).toEqual([
      '0–99',
      '100–149 (Rookie)',
      '150–199 (Junior Agent)',
      '200–749 (Agent)',
    ]);
    expect(bars).toEqual([{ turn: 7, above: [5, 7, 0, 1], below: [] }]);
  });

  it('puts every base skill from the highest Rank up in its open-ended band, with the colours in order', () => {
    const open: OpenHistoryEntry = {
      turn: 3,
      turnStart: summary(),
      turnEnd: summary({ baseSkills: [749, 750, 2000] }),
      actions: [],
    };
    const { series, bars } = skillBands([], open, ranks);
    expect(series).toHaveLength(5);
    expect(series.at(-2)).toEqual({ name: '200–749 (Agent)', color: '#45BF6E' });
    expect(series.at(-1)).toEqual({ name: '750+ (Commander)', color: '#A3CC3F' });
    expect(bars[0]?.above.slice(-2)).toEqual([1, 2]);
  });

  it('example: Combat strength stacks the Deployable and Other Agents and draws the last and last five Mission sites', () => {
    const sites = [10, 20, 30, 40, 50, 61].map((rating, index) => ({
      id: `mission-site-${index + 1}`,
      // Mission sites 1 and 2 were created by the Advance turn of Turn 1, the others by that of Turn 2.
      turnCreated: index < 2 ? 1 : 2,
      creationCombatRating: rating,
    }));
    const result = combatStrength(
      [
        entry(1, { turnEnd: summary({ servingCombatRating: 300, deployableCombatRating: 120 }) }),
        entry(2, { turnEnd: summary({ servingCombatRating: 310, deployableCombatRating: 310 }) }),
      ],
      {
        turn: 3,
        turnStart: summary(),
        turnEnd: summary({ servingCombatRating: 280, deployableCombatRating: 200 }),
        actions: [],
      },
      // Listed out of creation order, as the live and Retired Mission sites are.
      [...sites.slice(3), ...sites.slice(0, 3)],
    );
    expect(result.bars).toEqual([
      { turn: 1, above: [120, 180], below: [] },
      { turn: 2, above: [310, 0], below: [] },
      { turn: 3, above: [200, 80], below: [] },
    ]);
    // Turn 1 has no Mission site yet, so it has no point.
    expect(result.lastSite).toEqual([
      { turn: 2, value: 20 },
      { turn: 3, value: 61 },
    ]);
    // ⌊(20 + 30 + 40 + 50 + 61) / 5⌋ = ⌊40.2⌋ = 40; Turn 2 averages the two that exist.
    expect(result.lastFiveSites).toEqual([
      { turn: 2, value: 15 },
      { turn: 3, value: 40 },
    ]);
  });

  it('example: the readout starts with the Total of the bar and leaves out every series whose value is 0', () => {
    const bars = [{ turn: 94, above: [8, 6, 10, 0, 16, 0, 0], below: [] }];
    expect(readoutText({ turn: 94, barSeries: ACTIVITY_SERIES, bars, lines: [], total: true })).toBe(
      'Turn 94: Total 40 · Standby 8 · Training 6 · Contracting 10 · Deployed 16',
    );
    expect(readoutText({ turn: 94, barSeries: ACTIVITY_SERIES, bars, lines: [] })).toBe(
      'Turn 94: Standby 8 · Training 6 · Contracting 10 · Deployed 16',
    );
    // The line keeps its height while no Turn is hovered.
    expect(readoutText({ turn: null, barSeries: ACTIVITY_SERIES, bars, lines: [], total: true })).toBe(' ');
  });

  it('counts the Agents of each Turn-end state by activity, the current Turn from the Open History entry', () => {
    const activity = { ...summary().agentActivity, standby: 2, deployed: 3, inTransit: 1 };
    const bars = activityBars([entry(1, { turnEnd: summary({ agentActivity: activity }) })], {
      turn: 2,
      turnStart: summary(),
      turnEnd: summary({ agentActivity: { ...activity, deployed: 0, standby: 5 } }),
      actions: [],
    });
    expect(bars).toEqual([
      { turn: 1, above: [2, 0, 0, 0, 3, 0, 1], below: [] },
      { turn: 2, above: [5, 0, 0, 0, 0, 0, 1], below: [] },
    ]);
  });

  it('splits each ended Turn into income, expenditures, and a Net flow from the Turn series of money', () => {
    const ended = entry(1, {
      actions: [
        { operation: 'hireAgents', args: { count: 1 }, moneyChange: -100 },
        { operation: 'purchaseUpgrade', args: { upgrade: 'agent_cap' }, moneyChange: -300 },
        { operation: 'purchaseUpgrade', args: { upgrade: 'armor' }, moneyChange: -200 },
        { operation: 'addMoney', args: { amount: 1000 }, moneyChange: 1000 },
      ],
      report: {
        fundingUsed: 20,
        income: 70,
        upkeep: 40,
        missions: [{ consequence: consequence(200) }],
        expiredConsequences: [],
      } as unknown as HistoryEntry['report'],
    });
    const flow = moneyFlow(
      [ended],
      [
        { turn: 1, value: 500 },
        { turn: 2, value: 1130 },
      ],
      new Set(['agent_cap']),
    );
    expect(flow.bars).toEqual([{ turn: 1, above: [20, 50, 200], below: [40, 100, 300, 200] }]);
    expect(flow.net).toEqual([{ turn: 1, value: 630 }]);
  });

  it('reads the Assets from each Turn-start state and the Money at the start of turn', () => {
    const lines = assetLines(
      [entry(1, { turnStart: summary({ servingAgents: 4 }) })],
      {
        turn: 2,
        turnStart: summary({
          servingAgents: 5,
          caps: { agentCap: 28, transportCap: 8, trainingCap: 10, contractingCap: 4 },
        }),
        turnEnd: summary(),
        actions: [],
      },
      [
        { turn: 1, value: 500 },
        { turn: 2, value: 450 },
      ],
    );
    expect(lines.servingAgents).toEqual([
      { turn: 1, value: 4 },
      { turn: 2, value: 5 },
    ]);
    expect(lines.agentCap.map((point) => point.value)).toEqual([20, 28]);
    expect(lines.money.map((point) => point.value)).toEqual([500, 450]);
  });
});
