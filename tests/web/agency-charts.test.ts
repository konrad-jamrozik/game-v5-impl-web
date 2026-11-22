/** CVIEW, Agency charts. */
import { describe, expect, it } from 'vite-plus/test';
import type { HistoryEntry, OpenHistoryEntry, StateSummary } from '../../src/engine/index.ts';
import { activityBars, assetLines, moneyFlow, skillBands } from '../../src/web/agency-charts.ts';

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
  effectiveSkills: [],
  caps: { agentCap: 20, transportCap: 8, trainingCap: 10 },
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
  it('example: Turn 7 has 5 Agents at 0–49, none at 50–99, 7 at 100–149, none at 150–199, and 1 at 200–249', () => {
    const skills = [10, 20, 30, 40, 49, 100, 110, 120, 130, 140, 149, 100, 210];
    const open: OpenHistoryEntry = {
      turn: 7,
      turnStart: summary(),
      turnEnd: summary({ effectiveSkills: skills }),
      actions: [],
    };
    const { series, bars } = skillBands([], open);
    expect(series.map((band) => band.name)).toEqual(['0–49', '50–99', '100–149', '150–199', '200–249']);
    expect(bars).toEqual([{ turn: 7, above: [5, 0, 7, 0, 1], below: [] }]);
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
        { operation: 'hireAgent', args: {}, moneyChange: -100 },
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
        turnStart: summary({ servingAgents: 5, caps: { agentCap: 28, transportCap: 8, trainingCap: 10 } }),
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
