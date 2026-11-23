/**
 * CVIEW, Agency charts: the per-Turn values of the five Agency charts, read from the History entries, the Open History
 * entry, and the Turn series of money, as AGENT, Turn report, MISSION, Turn report, and ECON, Turn report declare
 * them, and from the Creation Combat ratings of the Mission sites. Colours are the Chart series colours of VIS.
 */
import type {
  HistoryEntry,
  MissionSiteView,
  OpenHistoryEntry,
  StateSummary,
  TurnSeriesValue,
} from '../engine/index.ts';

export interface Series {
  readonly name: string;
  readonly color: string;
}

/** One Turn of a stacked bar chart: the values stacked above the baseline and those stacked below it. */
export interface Bar {
  readonly turn: number;
  readonly above: readonly number[];
  readonly below: readonly number[];
}

export const ACTIVITY_SERIES: readonly (Series & { readonly key: keyof StateSummary['agentActivity'] })[] = [
  { key: 'standby', name: 'Standby', color: '#7FD45F' },
  { key: 'training', name: 'Training', color: '#2E8B3E' },
  { key: 'contracting', name: 'Contracting', color: '#E8C547' },
  { key: 'investigating', name: 'Investigating', color: '#A77BDB' },
  { key: 'deployed', name: 'Deployed', color: '#F28C28' },
  { key: 'recovering', name: 'Recovering', color: '#D2453D' },
  { key: 'inTransit', name: 'In transit', color: '#3D8FD9' },
];

export const INCOME_SERIES: readonly Series[] = [
  { name: 'Funding', color: '#3E8E41' },
  { name: 'Contracting income', color: '#6CC05B' },
  { name: 'Mission rewards', color: '#A9DD8F' },
];

export const EXPENDITURE_SERIES: readonly Series[] = [
  { name: 'Upkeep', color: '#A8322D' },
  { name: 'Hiring', color: '#D9473F' },
  { name: 'Cap Upgrades', color: '#FF6F61' },
  { name: 'Other Upgrades', color: '#F2A39B' },
];

export const NET_FLOW: Series = { name: 'Net flow', color: '#E8C547' };

export const ASSET_SERIES = {
  money: { name: 'Money', color: '#8BC34A' },
  servingAgents: { name: 'Serving Agents', color: '#A1887F' },
  agentCap: { name: 'Agent cap', color: '#D7CCC8' },
  transportCap: { name: 'Transport cap', color: '#3D8FD9' },
  trainingCap: { name: 'Training cap', color: '#E8C547' },
  contractingCap: { name: 'Contracting cap', color: '#C77DDB' },
} as const;

/** VIS, Chart series colours: skill bands 1 to 12, from the lowest. */
const BAND_COLORS = [
  '#6A5ACD',
  '#4A86D9',
  '#2FB0B8',
  '#45BF6E',
  '#A3CC3F',
  '#E3C43A',
  '#F0913A',
  '#E8605A',
  '#D94A8C',
  '#B45AD6',
  '#F2A6D8',
  '#F4EFE6',
];
const BAND_WIDTH = 50;
/** CVIEW, Agents by effective skill: twelve bands, eleven 50 wide and a last one of every effective skill from 550 up. */
const BAND_COUNT = BAND_COLORS.length;

export const COMBAT_BAR_SERIES: readonly Series[] = [
  { name: 'Deployable Agents', color: '#4A86D9' },
  { name: 'Other Agents', color: '#2E4E78' },
];

export const COMBAT_LINE_SERIES = {
  lastSite: { name: 'Last Mission site', color: '#E8605A' },
  lastFiveSites: { name: 'Last 5 Mission sites', color: '#E3C43A' },
} as const;

/**
 * VIS, Charts: the line below a chart with a legend that reads the hovered Turn's values: "Turn" and its number, then
 * each series with its value in legend order, the bar series first, those below the baseline as negative values,
 * leaving out every series whose value is 0. With `total`, for a chart whose stacked bars all count one quantity above
 * the baseline, the list starts with "Total" and the sum of the bar. A single space while no Turn is hovered, so that
 * the line keeps its height.
 */
export function readoutText(input: {
  readonly turn: number | null;
  readonly barSeries: readonly Series[];
  readonly bars: readonly Bar[];
  readonly lines: readonly (Series & { readonly points: readonly { turn: number; value: number }[] })[];
  readonly total?: boolean;
}): string {
  const { turn } = input;
  if (turn === null) {
    return ' ';
  }
  const bar = input.bars.find((item) => item.turn === turn);
  const barValues = bar === undefined ? [] : [...bar.above, ...bar.below.map((value) => -value)];
  const details = [
    ...barValues.map((value, index) => ({ name: input.barSeries[index]?.name ?? '', value })),
    ...input.lines.flatMap((line) => {
      const point = line.points.find((p) => p.turn === turn);
      return point === undefined ? [] : [{ name: line.name, value: point.value }];
    }),
  ].filter((detail) => detail.value !== 0);
  const total =
    input.total === true && bar !== undefined
      ? [{ name: 'Total', value: bar.above.reduce((sum, value) => sum + value, 0) }]
      : [];
  const text = [...total, ...details].map((detail) => `${detail.name} ${String(detail.value)}`).join(' · ');
  return `Turn ${String(turn)}:${text === '' ? '' : ` ${text}`}`;
}

/** The Turn-end part of every ended Turn, then the Current world state for the current Turn. */
function turnEnds(
  entries: readonly HistoryEntry[],
  open: OpenHistoryEntry | null,
): { turn: number; summary: StateSummary }[] {
  const all = entries.map((entry) => ({ turn: entry.turn, summary: entry.turnEnd }));
  return open === null ? all : [...all, { turn: open.turn, summary: open.turnEnd }];
}

/** CVIEW, Agency charts, Agent activity: the Serving Agents of each Turn-end state by what each was doing. */
export function activityBars(entries: readonly HistoryEntry[], open: OpenHistoryEntry | null): Bar[] {
  return turnEnds(entries, open).map(({ turn, summary }) => ({
    turn,
    above: ACTIVITY_SERIES.map((series) => summary.agentActivity[series.key]),
    below: [],
  }));
}

/**
 * CVIEW, Agency charts, Agents by effective skill: the Serving Agents of each Turn-end state in twelve bands, eleven
 * 50 wide and a last one, "550+", from 0–49 up to the highest band that holds an Agent in any Turn shown.
 */
export function skillBands(
  entries: readonly HistoryEntry[],
  open: OpenHistoryEntry | null,
): { series: Series[]; bars: Bar[] } {
  const ends = turnEnds(entries, open);
  const bandOf = (skill: number) => Math.min(BAND_COUNT - 1, Math.floor(skill / BAND_WIDTH));
  const highest = Math.max(0, ...ends.flatMap(({ summary }) => summary.effectiveSkills.map(bandOf)));
  const count = highest + 1;
  const series = Array.from({ length: count }, (_, band) => ({
    name:
      band === BAND_COUNT - 1
        ? `${band * BAND_WIDTH}+`
        : `${band * BAND_WIDTH}–${band * BAND_WIDTH + BAND_WIDTH - 1}`,
    color: BAND_COLORS[band] ?? '#F4EFE6',
  }));
  const bars = ends.map(({ turn, summary }) => {
    const above = Array.from({ length: count }, () => 0);
    for (const skill of summary.effectiveSkills) {
      const band = bandOf(skill);
      above[band] = (above[band] ?? 0) + 1;
    }
    return { turn, above, below: [] };
  });
  return { series, bars };
}

/** VIS, Chart series colours: the three lines over the Agents by effective skill chart. */
const WORN_COLORS = { recovering: '#FF4D4D', aboveWorkLimit: '#FF9A2E', aboveFreePoints: '#FFE14D' } as const;

/**
 * CVIEW, Agency charts, Agents by effective skill: the lines over the bars, of the Serving Agents of each Turn-end
 * state that are recovering, whose exhaustion is above `exhaustion_work_limit`, and whose exhaustion is above
 * `exhaustion_free_points`, named with those thresholds, e.g. "Exhaustion > 70" and "Exhaustion > 30".
 */
export function wornLines(
  entries: readonly HistoryEntry[],
  open: OpenHistoryEntry | null,
  thresholds: { readonly workLimit: number; readonly freePoints: number },
): (Series & { readonly points: { turn: number; value: number }[] })[] {
  const ends = turnEnds(entries, open);
  const line = (key: keyof StateSummary['wornAgents'], name: string) => ({
    name,
    color: WORN_COLORS[key],
    points: ends.map(({ turn, summary }) => ({ turn, value: summary.wornAgents[key] })),
  });
  return [
    line('recovering', 'Recovering'),
    line('aboveWorkLimit', `Exhaustion > ${thresholds.workLimit}`),
    line('aboveFreePoints', `Exhaustion > ${thresholds.freePoints}`),
  ];
}

/** The creation count that ends an Instance ID, e.g. 12 for `mission-site-12`; see CINST, Campaign instance identity. */
function creationCount(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

/**
 * CVIEW, Agency charts, Combat strength: for each Turn, a bar of the Combat rating of the Deployable Agents and of the
 * other Serving Agents in its Turn-end state, and lines of the Creation Combat rating of the last Mission site created
 * and of the mean, rounded down, of the last five, over the Mission sites that exist in that Turn-end state, in their
 * creation order. A Mission site exists in the Turn-end state of every Turn after the one whose Advance turn created
 * it, i.e. of every Turn later than its Turn created, since only an Advance turn creates one. A Turn in which no
 * Mission site exists has no point. `sites` holds every Mission site, live and Retired.
 */
export function combatStrength(
  entries: readonly HistoryEntry[],
  open: OpenHistoryEntry | null,
  sites: readonly Pick<MissionSiteView, 'id' | 'turnCreated' | 'creationCombatRating'>[],
): {
  bars: Bar[];
  lastSite: { turn: number; value: number }[];
  lastFiveSites: { turn: number; value: number }[];
} {
  const ordered = [...sites].sort((a, b) => creationCount(a.id) - creationCount(b.id));
  const ends = turnEnds(entries, open);
  const bars = ends.map(({ turn, summary }) => ({
    turn,
    above: [summary.deployableCombatRating, summary.servingCombatRating - summary.deployableCombatRating],
    below: [],
  }));
  const lastSite: { turn: number; value: number }[] = [];
  const lastFiveSites: { turn: number; value: number }[] = [];
  for (const { turn } of ends) {
    const existing = ordered.filter((site) => site.turnCreated < turn);
    const last = existing.at(-1);
    if (last === undefined) {
      continue;
    }
    const five = existing.slice(-5);
    lastSite.push({ turn, value: last.creationCombatRating });
    lastFiveSites.push({
      turn,
      value: Math.floor(five.reduce((total, site) => total + site.creationCombatRating, 0) / five.length),
    });
  }
  return { bars, lastSite, lastFiveSites };
}

/**
 * CVIEW, Agency charts, Money flow: for each ended Turn, its income above the baseline, its expenditures below it, and
 * its Net flow, the next Turn's Money at the start of turn less its own. `capUpgrades` names the Cap Upgrades.
 */
export function moneyFlow(
  entries: readonly HistoryEntry[],
  moneyAtStartOfTurn: readonly TurnSeriesValue[],
  capUpgrades: ReadonlySet<string>,
): { bars: Bar[]; net: { turn: number; value: number }[] } {
  const startOf = new Map(moneyAtStartOfTurn.map((value) => [value.turn, value.value]));
  const bars: Bar[] = [];
  const net: { turn: number; value: number }[] = [];
  for (const entry of entries) {
    const rewards = [
      ...entry.report.missions.map((mission) => mission.consequence.money),
      ...entry.report.expiredConsequences.map((expired) => expired.consequence.money),
    ].reduce((sum, money) => sum + money, 0);
    let hiring = 0;
    let caps = 0;
    let other = 0;
    for (const item of entry.actions) {
      const spent = -item.moneyChange;
      if (item.operation === 'hireAgents' || item.operation === 'hireAgent') {
        hiring += spent;
      } else if (item.operation === 'purchaseUpgrade') {
        if (capUpgrades.has(upgradeOf(item.args))) {
          caps += spent;
        } else {
          other += spent;
        }
      }
    }
    bars.push({
      turn: entry.turn,
      above: [entry.report.fundingUsed, entry.report.income - entry.report.fundingUsed, rewards],
      below: [entry.report.upkeep, hiring, caps, other],
    });
    const start = startOf.get(entry.turn);
    const next = startOf.get(entry.turn + 1);
    if (start !== undefined && next !== undefined) {
      net.push({ turn: entry.turn, value: next - start });
    }
  }
  return { bars, net };
}

function upgradeOf(args: unknown): string {
  if (typeof args === 'object' && args !== null && 'upgrade' in args && typeof args.upgrade === 'string') {
    return args.upgrade;
  }
  return '';
}

/** CVIEW, Agency charts, Assets: for each Turn, its Turn-start state. */
export function assetLines(
  entries: readonly HistoryEntry[],
  open: OpenHistoryEntry | null,
  moneyAtStartOfTurn: readonly TurnSeriesValue[],
): Record<keyof typeof ASSET_SERIES, { turn: number; value: number }[]> {
  const starts = [
    ...entries.map((entry) => ({ turn: entry.turn, summary: entry.turnStart })),
    ...(open === null ? [] : [{ turn: open.turn, summary: open.turnStart }]),
  ];
  const line = (value: (summary: StateSummary) => number) =>
    starts.map(({ turn, summary }) => ({ turn, value: value(summary) }));
  return {
    money: moneyAtStartOfTurn.map((value) => ({ turn: value.turn, value: value.value })),
    servingAgents: line((summary) => summary.servingAgents),
    agentCap: line((summary) => summary.caps.agentCap),
    transportCap: line((summary) => summary.caps.transportCap),
    trainingCap: line((summary) => summary.caps.trainingCap),
    // A History entry written before the Contracting cap existed has none; it was 0 then.
    contractingCap: line((summary) => summary.caps.contractingCap ?? 0),
  };
}
