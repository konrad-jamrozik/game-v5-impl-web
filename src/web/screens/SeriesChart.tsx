/**
 * A chart with several series in SVG, styled under VIS, Charts: stacked bars, one per Turn and 70% as wide as a Turn's
 * share of the plot, stacked outward from the baseline in legend order, and lines with their latest point marked by a
 * dot, on a left axis and optionally a right one. It shows a legend in place of a current value; hovering a Turn
 * writes that Turn's values under it.
 */
import { useState } from 'react';
import type { Bar, Series } from '../agency-charts.ts';

export interface LineSeries extends Series {
  readonly points: readonly { readonly turn: number; readonly value: number }[];
  readonly axis?: 'left' | 'right';
}

const WIDTH = 900;
const HEIGHT = 240;
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

export function SeriesChart(props: {
  title: string;
  /** The bar series, those stacked above the baseline first, then those below it. */
  barSeries?: readonly Series[];
  bars?: readonly Bar[];
  lines?: readonly LineSeries[];
  testId?: string;
}) {
  const bars = props.bars ?? [];
  const barSeries = props.barSeries ?? [];
  const lines = props.lines ?? [];
  const [hover, setHover] = useState<number | null>(null);
  const turns = [...bars.map((bar) => bar.turn), ...lines.flatMap((line) => line.points.map((p) => p.turn))];
  const legend = [
    ...barSeries.map((series) => ({ ...series, line: false })),
    ...lines.map((l) => ({ ...l, line: true })),
  ];
  const caption = (
    <figcaption>
      <h4>{props.title}</h4>
      <ul className="chart-legend">
        {legend.map((series) => (
          <li key={series.name}>
            <span
              className={series.line ? 'chart-key chart-key-line' : 'chart-key'}
              style={{ background: series.color }}
            />
            {series.name}
          </li>
        ))}
      </ul>
    </figcaption>
  );
  if (turns.length === 0) {
    return (
      <figure className="chart chart-wide" data-testid={props.testId}>
        {caption}
        <p className="muted small">No ended Turn yet.</p>
      </figure>
    );
  }
  const first = Math.min(...turns);
  const last = Math.max(...turns);
  const slot = (WIDTH - PAD.left - PAD.right) / (last - first + 1);
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
  const plot = HEIGHT - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * plot;
  const yRight = (value: number) => PAD.top + ((rightTop - value) / rightTop) * plot;
  const barWidth = slot * 0.7;
  const aboveCount = bars[0]?.above.length ?? 0;

  const shownTurn = hover;
  const shownBar = bars.find((bar) => bar.turn === shownTurn);
  const details = [
    ...(shownBar === undefined
      ? []
      : [...shownBar.above, ...shownBar.below.map((value) => -value)].map((value, index) => ({
          name: barSeries[index]?.name ?? '',
          value,
        }))),
    ...lines.flatMap((line) => {
      const point = line.points.find((p) => p.turn === shownTurn);
      return point === undefined ? [] : [{ name: line.name, value: point.value }];
    }),
  ].filter((detail) => detail.value !== 0);
  const detailText =
    shownTurn === null
      ? ' '
      : `Turn ${String(shownTurn)}: ${details.map((detail) => `${detail.name} ${String(detail.value)}`).join(' · ') || 'none'}`;

  return (
    <figure className="chart chart-wide" data-testid={props.testId}>
      {caption}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${props.title}, Turn ${first} to Turn ${last}`}
        onMouseLeave={() => {
          setHover(null);
        }}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = ((event.clientX - box.left) / box.width) * WIDTH;
          const turn = Math.round((at - PAD.left) / slot - 0.5) + first;
          setHover(Math.min(last, Math.max(first, turn)));
        }}
      >
        <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(top)} y2={y(top)} />
        {bottom < 0 ? (
          <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(bottom)} y2={y(bottom)} />
        ) : null}
        <line className="chart-base" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} />
        <text className="chart-tick" x={PAD.left - 6} y={y(top) + 4} textAnchor="end">
          {top}
        </text>
        <text className="chart-tick" x={PAD.left - 6} y={y(0) + 4} textAnchor="end">
          0
        </text>
        {bottom < 0 ? (
          <text className="chart-tick" x={PAD.left - 6} y={y(bottom) + 4} textAnchor="end">
            {bottom}
          </text>
        ) : null}
        {rightLines.length > 0 ? (
          <>
            <text
              className="chart-tick"
              x={WIDTH - PAD.right + 6}
              y={yRight(rightTop) + 4}
              textAnchor="start"
            >
              {rightTop}
            </text>
            <text className="chart-tick" x={WIDTH - PAD.right + 6} y={yRight(0) + 4} textAnchor="start">
              0
            </text>
          </>
        ) : null}
        <text className="chart-tick" x={cx(first)} y={HEIGHT - 6} textAnchor="middle">
          T{first}
        </text>
        <text className="chart-tick" x={cx(last)} y={HEIGHT - 6} textAnchor="middle">
          T{last}
        </text>
        {shownTurn === null ? null : (
          <rect className="chart-hover" x={cx(shownTurn) - slot / 2} y={PAD.top} width={slot} height={plot} />
        )}
        {bars.map((bar) => {
          const rects: React.JSX.Element[] = [];
          let up = 0;
          bar.above.forEach((value, index) => {
            if (value > 0) {
              rects.push(
                <rect
                  key={`a${index}`}
                  x={cx(bar.turn) - barWidth / 2}
                  y={y(up + value)}
                  width={barWidth}
                  height={y(up) - y(up + value)}
                  fill={barSeries[index]?.color}
                />,
              );
              up += value;
            }
          });
          let down = 0;
          bar.below.forEach((value, index) => {
            if (value > 0) {
              rects.push(
                <rect
                  key={`b${index}`}
                  x={cx(bar.turn) - barWidth / 2}
                  y={y(-down)}
                  width={barWidth}
                  height={y(-down - value) - y(-down)}
                  fill={barSeries[aboveCount + index]?.color}
                />,
              );
              down += value;
            }
          });
          return <g key={bar.turn}>{rects}</g>;
        })}
        {lines.map((line) => {
          const at = line.axis === 'right' ? yRight : y;
          const latest = line.points.at(-1);
          if (latest === undefined) {
            return null;
          }
          const path = line.points
            .map((p, index) => `${index === 0 ? 'M' : 'L'}${cx(p.turn).toFixed(1)},${at(p.value).toFixed(1)}`)
            .join(' ');
          return (
            <g key={line.name}>
              <path className="chart-series-line" d={path} style={{ stroke: line.color }} />
              <circle cx={cx(latest.turn)} cy={at(latest.value)} r={4} fill={line.color} />
            </g>
          );
        })}
      </svg>
      <p className="chart-details small muted">{detailText}</p>
    </figure>
  );
}
