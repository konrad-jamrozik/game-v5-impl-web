/**
 * VIS, Charts: the layout of a chart with several series, as plain shapes in the units of its viewBox, so that the
 * game's `SeriesChart` and the Autopilot Bench of the Spec repo draw the same chart from the same rules: stacked bars,
 * one per Turn and 70% as wide as a Turn's share of the plot, stacked outward from the baseline in legend order, and
 * lines with their latest point marked by a dot, on a left axis and optionally a right one. Like `agency-charts.ts`, it
 * imports types alone, so that the bench can load it into its page.
 */
import type { Bar, LineSeries, Series } from './agency-charts.ts';

/**
 * GUI, Digit grouping: a number with a comma between each group of three digits of its whole part, e.g. 45817 as
 * "45,817". A copy of `groupDigits` of `format.ts`, since this module imports types alone.
 */
function groupDigits(n: number): string {
  const [whole = '', fraction] = String(Math.abs(n)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${fraction === undefined ? grouped : `${grouped}.${fraction}`}`;
}

/** VIS, Charts: how many of the last Turns a chart shows while its Last 100 Turns checkbox is checked. */
export const LAST_TURNS = 100;

/**
 * VIS, Charts: the first Turn a chart shows, the last 100 of `turns` while `on`, otherwise all of them; the turn
 * numbers need not be consecutive, e.g. the ended Turns of Money flow.
 */
export function lastTurnsFrom(turns: readonly number[], on: boolean): number {
  if (!on || turns.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.max(...turns) - LAST_TURNS + 1;
}

/** VIS, Charts: the opacity of a line drawn over stacked bars, its outline, and its dot. */
export const LINE_OVER_BARS_OPACITY = 0.7;

/** What a chart with several series draws. */
export interface SeriesChartData {
  readonly barSeries: readonly Series[];
  readonly bars: readonly Bar[];
  readonly lines: readonly LineSeries[];
}

/** The chart with only the Turns from `from` on. */
export function chartFrom<T extends SeriesChartData>(chart: T, from: number): T {
  return {
    ...chart,
    bars: chart.bars.filter((bar) => bar.turn >= from),
    lines: chart.lines.map((line) => ({ ...line, points: line.points.filter((p) => p.turn >= from) })),
  };
}

/** VIS, Charts: the chart as its Last 100 Turns checkbox shows it. */
export function shownChart<T extends SeriesChartData>(chart: T, lastOnly: boolean): T {
  const turns = [
    ...chart.bars.map((bar) => bar.turn),
    ...chart.lines.flatMap((line) => line.points.map((p) => p.turn)),
  ];
  return chartFrom(chart, lastTurnsFrom(turns, lastOnly));
}

/** VIS, Charts: a legend lists the series in their order, the bar series first, each a line or a square. */
export function legendOf(
  chart: SeriesChartData,
): { readonly name: string; readonly color: string; readonly line: boolean }[] {
  return [
    ...chart.barSeries.map((series) => ({ name: series.name, color: series.color, line: false })),
    ...chart.lines.map((line) => ({ name: line.name, color: line.color, line: true })),
  ];
}

export interface SceneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

export interface SceneLine {
  readonly name: string;
  /** An SVG path. */
  readonly d: string;
  readonly color: string;
  /** VIS, Charts: a line over stacked bars has a 4 px Background outline beneath it. */
  readonly outline: boolean;
  /** 1 unless the line is over stacked bars. */
  readonly opacity: number;
  /** The dot that marks its latest point. */
  readonly dot: { readonly x: number; readonly y: number };
}

/** The shapes of a chart, in the units of a `width` × `height` viewBox, drawn in this order. */
export interface ChartScene {
  readonly width: number;
  readonly height: number;
  readonly first: number;
  readonly last: number;
  /** A Turn's share of the plot's width. */
  readonly slot: number;
  readonly plotLeft: number;
  readonly plotTop: number;
  readonly plotHeight: number;
  /** Grid lines in Raised, the baseline in Border. */
  readonly grid: readonly {
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
    readonly base: boolean;
  }[];
  /** Axis labels, in the Axis style. */
  readonly ticks: readonly {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly anchor: 'start' | 'middle' | 'end';
  }[];
  readonly rects: readonly SceneRect[];
  readonly lines: readonly SceneLine[];
}

/** The space around the plot for the axis labels, in viewBox units. */
const PAD = { left: 48, right: 40, top: 10, bottom: 22 };

function roundUp(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const factor = [1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10;
  return factor * power;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** VIS, Charts: the shapes of `chart` in a `width` × `height` viewBox; none while it has no Turn. */
export function seriesChartScene(chart: SeriesChartData, width: number, height: number): ChartScene | null {
  const { bars, lines, barSeries } = chart;
  const turns = [...bars.map((bar) => bar.turn), ...lines.flatMap((line) => line.points.map((p) => p.turn))];
  if (turns.length === 0) {
    return null;
  }
  const first = Math.min(...turns);
  const last = Math.max(...turns);
  const slot = (width - PAD.left - PAD.right) / (last - first + 1);
  const cx = (turn: number) => PAD.left + slot * (turn - first + 0.5);
  const leftLines = lines.filter((line) => line.axis !== 'right');
  const rightLines = lines.filter((line) => line.axis === 'right');
  const top = roundUp(
    Math.max(
      1,
      ...bars.map((bar) => sum(bar.above)),
      ...leftLines.flatMap((line) => line.points.map((p) => p.value)),
    ),
  );
  const lowest = Math.min(
    0,
    ...bars.map((bar) => -sum(bar.below)),
    ...leftLines.flatMap((line) => line.points.map((p) => p.value)),
  );
  const bottom = lowest < 0 ? -roundUp(-lowest) : 0;
  const rightTop = roundUp(Math.max(1, ...rightLines.flatMap((line) => line.points.map((p) => p.value))));
  const plot = height - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * plot;
  const yRight = (value: number) => PAD.top + ((rightTop - value) / rightTop) * plot;
  const x1 = PAD.left;
  const x2 = width - PAD.right;

  const grid = [
    { x1, x2, y: y(top), base: false },
    ...(bottom < 0 ? [{ x1, x2, y: y(bottom), base: false }] : []),
    { x1, x2, y: y(0), base: true },
  ];
  const left = (value: number) => ({
    x: PAD.left - 6,
    y: y(value) + 4,
    text: groupDigits(value),
    anchor: 'end' as const,
  });
  const ticks = [
    left(top),
    left(0),
    ...(bottom < 0 ? [left(bottom)] : []),
    ...(rightLines.length > 0
      ? [
          {
            x: width - PAD.right + 6,
            y: yRight(rightTop) + 4,
            text: groupDigits(rightTop),
            anchor: 'start' as const,
          },
          { x: width - PAD.right + 6, y: yRight(0) + 4, text: '0', anchor: 'start' as const },
        ]
      : []),
    { x: cx(first), y: height - 6, text: `T${groupDigits(first)}`, anchor: 'middle' as const },
    { x: cx(last), y: height - 6, text: `T${groupDigits(last)}`, anchor: 'middle' as const },
  ];

  const barWidth = slot * 0.7;
  const aboveCount = bars[0]?.above.length ?? 0;
  const rects: SceneRect[] = [];
  for (const bar of bars) {
    const x = cx(bar.turn) - barWidth / 2;
    let up = 0;
    bar.above.forEach((value, index) => {
      if (value > 0) {
        rects.push({
          x,
          y: y(up + value),
          width: barWidth,
          height: y(up) - y(up + value),
          color: color(index),
        });
        up += value;
      }
    });
    let down = 0;
    bar.below.forEach((value, index) => {
      if (value > 0) {
        rects.push({
          x,
          y: y(-down),
          width: barWidth,
          height: y(-down - value) - y(-down),
          color: color(aboveCount + index),
        });
        down += value;
      }
    });
  }
  function color(index: number): string {
    return barSeries[index]?.color ?? 'transparent';
  }

  const overBars = bars.length > 0;
  const sceneLines: SceneLine[] = lines.flatMap((line) => {
    const at = line.axis === 'right' ? yRight : y;
    const latest = line.points.at(-1);
    if (latest === undefined) {
      return [];
    }
    const d = line.points
      .map((p, index) => `${index === 0 ? 'M' : 'L'}${cx(p.turn).toFixed(1)},${at(p.value).toFixed(1)}`)
      .join(' ');
    return [
      {
        name: line.name,
        d,
        color: line.color,
        outline: overBars,
        opacity: overBars ? LINE_OVER_BARS_OPACITY : 1,
        dot: { x: cx(latest.turn), y: at(latest.value) },
      },
    ];
  });

  return {
    width,
    height,
    first,
    last,
    slot,
    plotLeft: PAD.left,
    plotTop: PAD.top,
    plotHeight: plot,
    grid,
    ticks,
    rects,
    lines: sceneLines,
  };
}

/** The Turn under the viewBox x coordinate `x`, kept within the Turns shown. */
export function sceneTurnAt(scene: ChartScene, x: number): number {
  const turn = Math.round((x - scene.plotLeft) / scene.slot - 0.5) + scene.first;
  return Math.min(scene.last, Math.max(scene.first, turn));
}

/** The highlight behind the hovered Turn. */
export function hoverRect(
  scene: ChartScene,
  turn: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return {
    x: scene.plotLeft + scene.slot * (turn - scene.first),
    y: scene.plotTop,
    width: scene.slot,
    height: scene.plotHeight,
  };
}
