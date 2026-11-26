/**
 * CVIEW, Agency charts: the five Agency charts, each as its title, series, and per-Turn values, read from the History
 * entries, the Open History entry, and the Turn series of money, as AGENT, Turn report, MISSION, Turn report, and ECON,
 * Turn report declare them, and from the Creation Combat ratings of the Mission sites. Colours are the Chart series
 * colours of VIS.
 *
 * The Autopilot Bench of the Spec repo draws these same charts: it loads this module and `series-chart-scene.ts` into
 * its page with their types stripped, so both import types alone and nothing else, and every chart decision made here
 * reaches the bench too.
 */
import type {
  HistoryEntry,
  MissionSiteView,
  OpenHistoryEntry,
  StateSummary,
  TurnSeriesValue,
} from '../engine/index.ts';

/**
 * GUI, Digit grouping: a whole number with a comma between each group of three digits, e.g. 45817 as "45,817". A copy
 * of `groupDigits` of `format.ts`, since this module imports types alone.
 */
function groupDigits(n: number): string {
  const [whole = '', fraction] = String(Math.abs(n)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${fraction === undefined ? grouped : `${grouped}.${fraction}`}`;
}

export interface Series {
  readonly name: string;
  readonly color: string;
  /** A bar series that the "Total" of the readout leaves out, e.g. Killed, which counts Agents no longer Serving. */
  readonly outsideTotal?: boolean;
}

/** One Turn of a stacked bar chart: the values stacked above the baseline and those stacked below it. */
export interface Bar {
  readonly turn: number;
  readonly above: readonly number[];
  readonly below: readonly number[];
}

export interface Point {
  readonly turn: number;
  readonly value: number;
}

export interface LineSeries extends Series {
  readonly points: readonly Point[];
  readonly axis?: 'left' | 'right';
}

/** One Agency chart: what a chart with several series draws. */
export interface AgencyChart {
  /** Names the chart, e.g. for its Last 100 Turns checkbox and as its test ID. */
  readonly key: string;
  readonly title: string;
  /** The bar series, those stacked above the baseline first, then those below it. */
  readonly barSeries: readonly Series[];
  readonly bars: readonly Bar[];
  readonly lines: readonly LineSeries[];
  /** VIS, Charts: the stacked bars all count one quantity above the baseline, so the readout starts with "Total". */
  readonly total: boolean;
}

/**
 * The part of a History entry that the Agency charts read. A HistoryEntry is one; `chartEntryOf` reduces one to it, so
 * that the bench can send it cheaply.
 */
export interface ChartEntry {
  readonly turn: number;
  readonly turnStart: StateSummary;
  readonly turnEnd: StateSummary;
  readonly actions: readonly {
    readonly operation: string;
    readonly args: unknown;
    readonly moneyChange: number;
  }[];
  readonly report: {
    readonly fundingUsed: number;
    readonly income: number;
    readonly upkeep: number;
    readonly missions: readonly {
      readonly consequence: { readonly money: number };
      readonly killed: readonly string[];
    }[];
    readonly expiredConsequences: readonly { readonly consequence: { readonly money: number } }[];
  };
}

/** The part of the Open History entry that the Agency charts read. */
export type ChartOpenEntry = Pick<OpenHistoryEntry, 'turn' | 'turnStart' | 'turnEnd'>;

/** The part of a Mission site that the Combat strength chart reads. */
export type ChartSite = Pick<MissionSiteView, 'id' | 'turnCreated' | 'creationCombatRating'>;

/** GUI, Ranks: the part of a Rank GDR that the skill bands read. */
export interface BandRank {
  readonly name: string;
  readonly minBaseSkill: number;
}

/** Everything the five Agency charts are read from. */
export interface AgencyChartsInput {
  readonly entries: readonly ChartEntry[];
  readonly open: ChartOpenEntry | null;
  readonly moneyAtStartOfTurn: readonly TurnSeriesValue[];
  /** ECON, Glossary: the IDs of the Cap Upgrades; see `capUpgradeIds`. */
  readonly capUpgrades: ReadonlySet<string>;
  /** Every Mission site, live and Retired. */
  readonly sites: readonly ChartSite[];
  readonly ranks: readonly BandRank[];
  /** AgentParameters, by their camelCase names, e.g. `exhaustionWorkLimit`. */
  readonly agentParameters: Readonly<Record<string, number>>;
}

/** A History entry reduced to what the Agency charts read. */
export function chartEntryOf(entry: HistoryEntry): ChartEntry {
  return {
    turn: entry.turn,
    turnStart: entry.turnStart,
    turnEnd: entry.turnEnd,
    actions: entry.actions
      .filter((item) => item.moneyChange !== 0)
      .map((item) => ({ operation: item.operation, args: item.args, moneyChange: item.moneyChange })),
    report: {
      fundingUsed: entry.report.fundingUsed,
      income: entry.report.income,
      upkeep: entry.report.upkeep,
      missions: entry.report.missions.map((mission) => ({
        consequence: { money: mission.consequence.money },
        killed: mission.killed,
      })),
      expiredConsequences: entry.report.expiredConsequences.map((expired) => ({
        consequence: { money: expired.consequence.money },
      })),
    },
  };
}

/** ECON, Glossary: a Cap Upgrade raises the Agent cap, the Transport cap, or the Training cap. */
export function capUpgradeIds(
  upgrades: readonly { readonly id: string; readonly effect: string }[],
): Set<string> {
  return new Set(
    upgrades
      .filter((upgrade) => ['agent_cap', 'transport_cap', 'training_cap'].includes(upgrade.effect))
      .map((upgrade) => upgrade.id),
  );
}

/** CVIEW, Agency charts: Deployed last, on top of the bar. */
export const ACTIVITY_SERIES: readonly (Series & { readonly key: keyof StateSummary['agentActivity'] })[] = [
  { key: 'standby', name: 'Standby', color: '#7FD45F' },
  { key: 'training', name: 'Training', color: '#2E8B3E' },
  { key: 'contracting', name: 'Contracting', color: '#E8C547' },
  { key: 'investigating', name: 'Investigating', color: '#A77BDB' },
  { key: 'recovering', name: 'Recovering', color: '#D2453D' },
  { key: 'inTransit', name: 'In transit', color: '#3D8FD9' },
  { key: 'deployed', name: 'Deployed', color: '#F28C28' },
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

/** VIS, Chart series colours: the skill bands from the lowest; the last colour stands for every band above the twelfth. */
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

/** VIS, Chart series colours: the Agents Killed, on top of the skill bands. */
export const KILLED_SERIES: Series = { name: 'Killed', color: '#7A1C1C', outsideTotal: true };

export const COMBAT_BAR_SERIES: readonly Series[] = [
  { name: 'Deployable Agents', color: '#4A86D9' },
  { name: 'Other Agents', color: '#2E4E78' },
];

export const COMBAT_LINE_SERIES = {
  lastSite: { name: 'Last Mission site', color: '#E8605A' },
  lastFiveSites: { name: 'Last 5 Mission sites', color: '#E3C43A' },
} as const;

/** One series' value in a readout. */
export interface ReadoutItem {
  readonly name: string;
  readonly value: number;
  /** None for the Total. */
  readonly color: string | null;
  readonly line: boolean;
}

/**
 * VIS, Charts: the values that the line below a chart with a legend reads for the hovered Turn: each series with its
 * value in legend order, the bar series first, those below the baseline as negative values, leaving out every series
 * whose value is 0. With `total`, for a chart whose stacked bars all count one quantity above the baseline, the list
 * starts with "Total" and the sum of the bar, without the series outside the total. None while no Turn is hovered.
 */
export function readout(input: {
  readonly turn: number | null;
  readonly barSeries: readonly Series[];
  readonly bars: readonly Bar[];
  readonly lines: readonly LineSeries[];
  readonly total?: boolean;
}): ReadoutItem[] | null {
  const { turn } = input;
  if (turn === null) {
    return null;
  }
  const bar = input.bars.find((item) => item.turn === turn);
  const barValues = bar === undefined ? [] : [...bar.above, ...bar.below.map((value) => -value)];
  const details: ReadoutItem[] = [
    ...barValues.map((value, index) => ({
      name: input.barSeries[index]?.name ?? '',
      value,
      color: input.barSeries[index]?.color ?? null,
      line: false,
    })),
    ...input.lines.flatMap((line) => {
      const point = line.points.find((p) => p.turn === turn);
      return point === undefined
        ? []
        : [{ name: line.name, value: point.value, color: line.color, line: true }];
    }),
  ].filter((detail) => detail.value !== 0);
  const total =
    input.total === true && bar !== undefined
      ? [
          {
            name: 'Total',
            value: bar.above.reduce(
              (sum, value, index) => (input.barSeries[index]?.outsideTotal === true ? sum : sum + value),
              0,
            ),
            color: null,
            line: false,
          },
        ]
      : [];
  return [...total, ...details];
}

/**
 * VIS, Charts: the line below a chart with a legend that reads the hovered Turn's values: "Turn" and its number, then
 * the values of `readout`, e.g. "Turn 94: Total 40 · Standby 8". A single space while no Turn is hovered, so that the
 * line keeps its height.
 */
export function readoutText(input: Parameters<typeof readout>[0]): string {
  const items = readout(input);
  if (items === null || input.turn === null) {
    return ' ';
  }
  const text = items.map((item) => `${item.name} ${groupDigits(item.value)}`).join(' · ');
  return `Turn ${groupDigits(input.turn)}:${text === '' ? '' : ` ${text}`}`;
}

/** The Turn-end part of every ended Turn, then the Current world state for the current Turn. */
function turnEnds(
  entries: readonly ChartEntry[],
  open: ChartOpenEntry | null,
): { turn: number; summary: StateSummary }[] {
  const all = entries.map((entry) => ({ turn: entry.turn, summary: entry.turnEnd }));
  return open === null ? all : [...all, { turn: open.turn, summary: open.turnEnd }];
}

/** CVIEW, Agency charts, Agent activity: the Serving Agents of each Turn-end state by what each was doing. */
export function activityBars(entries: readonly ChartEntry[], open: ChartOpenEntry | null): Bar[] {
  return turnEnds(entries, open).map(({ turn, summary }) => ({
    turn,
    above: ACTIVITY_SERIES.map((series) => summary.agentActivity[series.key]),
    below: [],
  }));
}

/**
 * CVIEW, Agency charts, Agents by base skill: the Serving Agents of each Turn-end state, by base skill rounded down, in
 * the bands of the Ranks: one band for each Rank up to below the next, the highest open-ended, each named by its range
 * and the Rank's `name` in parentheses, e.g. "100–149 (Rookie)" and "750+ (Commander)", from the band of the lowest
 * Rank up to the highest that holds an Agent in any Turn shown. An Agent whose base skill reaches no Rank counts in the
 * band of the lowest. On top of the bands, the Agents Killed by the Advance turn that ended the Turn before.
 */
export function skillBands(
  entries: readonly ChartEntry[],
  open: ChartOpenEntry | null,
  ranks: readonly BandRank[],
): { series: Series[]; bars: Bar[] } {
  const ends = turnEnds(entries, open);
  const ordered = [...ranks].sort((a, b) => a.minBaseSkill - b.minBaseSkill);
  // Without a Rank GDR, a single band holds every Agent.
  const starts: { name: string | null; minBaseSkill: number }[] =
    ordered.length === 0 ? [{ name: null, minBaseSkill: 0 }] : ordered;
  const bandOf = (skill: number) => {
    let band = 0;
    starts.forEach((start, index) => {
      if (skill >= start.minBaseSkill) {
        band = index;
      }
    });
    return band;
  };
  const highest = Math.max(0, ...ends.flatMap(({ summary }) => summary.baseSkills.map(bandOf)));
  const count = highest + 1;
  const series: Series[] = starts.slice(0, count).map((start, band) => {
    const next = starts[band + 1];
    const range =
      next === undefined
        ? `${groupDigits(start.minBaseSkill)}+`
        : `${groupDigits(start.minBaseSkill)}–${groupDigits(next.minBaseSkill - 1)}`;
    return {
      name: start.name === null ? range : `${range} (${start.name})`,
      color: BAND_COLORS[Math.min(band, BAND_COLORS.length - 1)] ?? '#F4EFE6',
    };
  });
  // The Agents Killed by the Advance turn that ended Turn t, i.e. in a Mission of its Turn report, show in Turn t + 1.
  const killedAfter = new Map(
    entries.map((entry) => [
      entry.turn,
      entry.report.missions.reduce((total, mission) => total + mission.killed.length, 0),
    ]),
  );
  const bars = ends.map(({ turn, summary }) => {
    const above = Array.from({ length: count }, () => 0);
    for (const skill of summary.baseSkills) {
      const band = bandOf(skill);
      above[band] = (above[band] ?? 0) + 1;
    }
    return { turn, above: [...above, killedAfter.get(turn - 1) ?? 0], below: [] };
  });
  return { series: [...series, KILLED_SERIES], bars };
}

/** VIS, Chart series colours: the three lines over the Agents by base skill chart. */
const WORN_COLORS = { recovering: '#FF4D4D', aboveWorkLimit: '#FF9A2E', aboveFreePoints: '#FFE14D' } as const;

/**
 * CVIEW, Agency charts, Agents by base skill: the lines over the bars, of the Serving Agents of each Turn-end
 * state that are recovering, whose exhaustion is above `exhaustion_work_limit`, and whose exhaustion is above
 * `exhaustion_free_points`, named with those thresholds, e.g. "Exhaustion > 70" and "Exhaustion > 30".
 */
export function wornLines(
  entries: readonly ChartEntry[],
  open: ChartOpenEntry | null,
  thresholds: { readonly workLimit: number; readonly freePoints: number },
): LineSeries[] {
  const ends = turnEnds(entries, open);
  const line = (key: keyof StateSummary['wornAgents'], name: string) => ({
    name,
    color: WORN_COLORS[key],
    points: ends.map(({ turn, summary }) => ({ turn, value: summary.wornAgents[key] })),
  });
  return [
    line('recovering', 'Recovering'),
    line('aboveWorkLimit', `Exhaustion > ${groupDigits(thresholds.workLimit)}`),
    line('aboveFreePoints', `Exhaustion > ${groupDigits(thresholds.freePoints)}`),
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
  entries: readonly ChartEntry[],
  open: ChartOpenEntry | null,
  sites: readonly ChartSite[],
): {
  bars: Bar[];
  lastSite: Point[];
  lastFiveSites: Point[];
} {
  const ordered = [...sites].sort((a, b) => creationCount(a.id) - creationCount(b.id));
  const ends = turnEnds(entries, open);
  const bars = ends.map(({ turn, summary }) => ({
    turn,
    above: [summary.deployableCombatRating, summary.servingCombatRating - summary.deployableCombatRating],
    below: [],
  }));
  const lastSite: Point[] = [];
  const lastFiveSites: Point[] = [];
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
  entries: readonly ChartEntry[],
  moneyAtStartOfTurn: readonly TurnSeriesValue[],
  capUpgrades: ReadonlySet<string>,
): { bars: Bar[]; net: Point[] } {
  const startOf = new Map(moneyAtStartOfTurn.map((value) => [value.turn, value.value]));
  const bars: Bar[] = [];
  const net: Point[] = [];
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
  entries: readonly ChartEntry[],
  open: ChartOpenEntry | null,
  moneyAtStartOfTurn: readonly TurnSeriesValue[],
): Record<keyof typeof ASSET_SERIES, Point[]> {
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

/** CVIEW, Agency charts: the five charts, in their order on the Charts View. */
export function agencyCharts(input: AgencyChartsInput): AgencyChart[] {
  const { entries, open, moneyAtStartOfTurn } = input;
  const flow = moneyFlow(entries, moneyAtStartOfTurn, input.capUpgrades);
  const skills = skillBands(entries, open, input.ranks);
  // CVIEW, Agency charts, Agents by base skill: the thresholds of its exhaustion lines come from AgentParameters.
  const worn = wornLines(entries, open, {
    workLimit: input.agentParameters['exhaustionWorkLimit'] ?? 70,
    freePoints: input.agentParameters['exhaustionFreePoints'] ?? 30,
  });
  const assets = assetLines(entries, open, moneyAtStartOfTurn);
  const strength = combatStrength(entries, open, input.sites);
  return [
    {
      key: 'agent-activity-chart',
      title: 'Agents · end of Turn',
      barSeries: ACTIVITY_SERIES,
      bars: activityBars(entries, open),
      lines: [],
      total: true,
    },
    {
      key: 'money-flow-chart',
      title: 'Money flow',
      barSeries: [...INCOME_SERIES, ...EXPENDITURE_SERIES],
      bars: flow.bars,
      lines: [{ ...NET_FLOW, points: flow.net }],
      total: false,
    },
    {
      key: 'assets-chart',
      title: 'Assets · start of Turn',
      barSeries: [],
      bars: [],
      lines: [
        { ...ASSET_SERIES.money, points: assets.money },
        { ...ASSET_SERIES.servingAgents, points: assets.servingAgents, axis: 'right' },
        { ...ASSET_SERIES.agentCap, points: assets.agentCap, axis: 'right' },
        { ...ASSET_SERIES.transportCap, points: assets.transportCap, axis: 'right' },
        { ...ASSET_SERIES.trainingCap, points: assets.trainingCap, axis: 'right' },
        // CVIEW, Agency charts: the Contracting cap line and its legend entry only once the cap is at least 1 in a
        // Turn shown; the cap never falls, so that is the latest Turns whenever any Turn has it.
        ...(assets.contractingCap.some((point) => point.value >= 1)
          ? [{ ...ASSET_SERIES.contractingCap, points: assets.contractingCap, axis: 'right' as const }]
          : []),
      ],
      total: false,
    },
    {
      key: 'skill-chart',
      title: 'Agents by base skill · end of Turn',
      barSeries: skills.series,
      bars: skills.bars,
      lines: worn,
      total: true,
    },
    {
      key: 'combat-strength-chart',
      title: 'Combat ratings · end of Turn',
      barSeries: COMBAT_BAR_SERIES,
      bars: strength.bars,
      lines: [
        { ...COMBAT_LINE_SERIES.lastSite, points: strength.lastSite },
        { ...COMBAT_LINE_SERIES.lastFiveSites, points: strength.lastFiveSites },
      ],
      total: true,
    },
  ];
}
