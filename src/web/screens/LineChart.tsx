/**
 * A single-series line chart in SVG with a crosshair. It only draws the values it is given, styled under VIS, Charts:
 * the vertical axis starts at 0 and labels its top and bottom values, the horizontal axis labels the first and last
 * Turn, and the latest point is marked by a dot. A headline chart, e.g. Panic, is taller, drawn in Accent with a fill
 * below the line, and marks its losing limit with a line and a band.
 */
import { useState } from 'react';
import { lastTurnsFrom, useLastTurns } from '../chart-range.ts';
import { LastTurnsCheckbox } from './LastTurnsCheckbox.tsx';
import { ChartDot } from './SeriesChart.tsx';
import { FullScreenButton, FullScreenFrame, useFullScreen, usePlotSize } from './ChartFullScreen.tsx';

export interface Point {
  readonly turn: number;
  readonly value: number;
}

const PAD = { left: 34, right: 10, top: 10, bottom: 22 };

/** The smallest round number at or above `value`, so that the top label reads cleanly. */
function roundUp(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const factor = [1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10;
  return factor * power;
}

export function LineChart(props: {
  title: string;
  points: readonly Point[];
  unit?: string;
  /** The losing limit, drawn as a line with a band below it. */
  limit?: number;
  /** Set for the chart that leads its tab. */
  headline?: boolean;
  /** Text after the current value, e.g. "of 100% limit". */
  valueNote?: string;
  /** How a value of the series is written, e.g. with two decimals for Panic; by default as it is. */
  valueText?: (value: number) => string;
  testId?: string;
}) {
  const [lastOnly, setLastOnly] = useLastTurns(props.testId ?? props.title);
  // VIS, Charts: while the Last 100 Turns checkbox is checked, only the last 100 of the Turns it would show.
  const from = lastTurnsFrom(
    props.points.map((point) => point.turn),
    lastOnly,
  );
  const points = props.points.filter((point) => point.turn >= from);
  const checkbox = (
    <LastTurnsCheckbox chart={props.testId ?? props.title} on={lastOnly} onChange={setLastOnly} />
  );
  const text = props.valueText ?? String;
  const [hover, setHover] = useState<number | null>(null);
  const headline = props.headline === true;
  // VIS, Charts: while the chart is shown full screen, its plot is drawn at the size it takes on screen.
  const screen = useFullScreen();
  const [plotRef, plotSize] = usePlotSize(screen.full);
  const width = plotSize?.width ?? (headline ? 760 : 300);
  const height = plotSize?.height ?? (headline ? 230 : 170);
  const first = points[0];
  const last = points.at(-1);
  const className = `${headline ? 'chart chart-headline' : 'chart'}${screen.full ? ' chart-full' : ''}`;
  if (first === undefined || last === undefined) {
    return (
      <figure className={className} data-testid={props.testId}>
        <figcaption>
          <h4>{props.title}</h4>
          {checkbox}
        </figcaption>
        <p className="muted small">No ended Turn yet.</p>
      </figure>
    );
  }
  const values = points.map((point) => point.value);
  const low = Math.min(0, ...values);
  const top = roundUp(Math.max(props.limit ?? 0, ...values, 1));
  const turnSpan = Math.max(1, last.turn - first.turn);
  // VIS, Charts: the vertical axis labels its top and bottom values, so the plot starts after the widest of them,
  // in the Axis style, 11 px JetBrains Mono, about 6.7 px a character, 6 px from the plot.
  const widestLabel = Math.max(...[top, top / 2, low].map((value) => String(value).length));
  const padLeft = Math.max(PAD.left, Math.ceil(widestLabel * 6.7) + 10);
  const x = (turn: number) => padLeft + ((turn - first.turn) / turnSpan) * (width - padLeft - PAD.right);
  const y = (value: number) => PAD.top + ((top - value) / (top - low)) * (height - PAD.top - PAD.bottom);
  const line = points
    .map(
      (point, index) => `${index === 0 ? 'M' : 'L'}${x(point.turn).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .join(' ');
  const area = `${line} L${x(last.turn).toFixed(1)},${y(0).toFixed(1)} L${x(first.turn).toFixed(1)},${y(0).toFixed(1)} Z`;
  const shown = hover === null ? null : (points[hover] ?? null);
  const unit = props.unit ?? '';
  const middle = top / 2;

  return (
    <FullScreenFrame screen={screen}>
      <figure className={className} data-testid={props.testId}>
        <figcaption>
          <h4>{props.title}</h4>
          <span className="chart-value">
            {shown === null ? (
              <>
                {text(last.value)}
                {unit}
                {props.valueNote === undefined ? null : <small>{props.valueNote}</small>}
              </>
            ) : (
              <>
                {text(shown.value)}
                {unit}
                <small>Turn {shown.turn}</small>
              </>
            )}
          </span>
          {checkbox}
          <FullScreenButton
            screen={screen}
            {...(props.testId === undefined ? {} : { testId: props.testId })}
          />
        </figcaption>
        <div className="chart-plot" ref={plotRef}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${props.title}: ${text(first.value)}${unit} in Turn ${first.turn}, ${text(last.value)}${unit} in Turn ${last.turn}`}
            onMouseLeave={() => {
              setHover(null);
            }}
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const at = ((event.clientX - box.left) / box.width) * width;
              let best = 0;
              points.forEach((point, index) => {
                if (Math.abs(x(point.turn) - at) < Math.abs(x(points[best]?.turn ?? 0) - at)) {
                  best = index;
                }
              });
              setHover(best);
            }}
          >
            {headline ? (
              <line
                className="chart-grid"
                x1={padLeft}
                x2={width - PAD.right}
                y1={y(middle)}
                y2={y(middle)}
              />
            ) : null}
            <line className="chart-grid" x1={padLeft} x2={width - PAD.right} y1={y(top)} y2={y(top)} />
            <line className="chart-base" x1={padLeft} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
            <text className="chart-tick" x={padLeft - 6} y={y(top) + 4} textAnchor="end">
              {top}
            </text>
            {headline ? (
              <text className="chart-tick" x={padLeft - 6} y={y(middle) + 4} textAnchor="end">
                {middle}
              </text>
            ) : null}
            <text className="chart-tick" x={padLeft - 6} y={y(0) + 4} textAnchor="end">
              0
            </text>
            {low < 0 ? (
              <text className="chart-tick" x={padLeft - 6} y={y(low) + 4} textAnchor="end">
                {low}
              </text>
            ) : null}
            {props.limit === undefined ? null : (
              <>
                <rect
                  className="chart-band"
                  x={padLeft}
                  y={y(props.limit)}
                  width={width - padLeft - PAD.right}
                  height={Math.min(14, y(0) - y(props.limit))}
                />
                <line
                  className="chart-limit"
                  x1={padLeft}
                  x2={width - PAD.right}
                  y1={y(props.limit)}
                  y2={y(props.limit)}
                />
                <text
                  className="chart-limit-label"
                  x={width - PAD.right - 4}
                  y={y(props.limit) + 11}
                  textAnchor="end"
                >
                  LOSS AT {props.limit}
                  {unit}
                </text>
              </>
            )}
            <text className="chart-tick" x={padLeft} y={height - 6} textAnchor="start">
              T{first.turn}
            </text>
            <text className="chart-tick" x={width - PAD.right} y={height - 6} textAnchor="end">
              T{last.turn}
            </text>
            <path className="chart-area" d={area} />
            <path className="chart-line" d={line} />
            {shown === null ? (
              <ChartDot className="chart-dot" x={x(last.turn)} y={y(last.value)} />
            ) : (
              <>
                <line
                  className="chart-cross"
                  x1={x(shown.turn)}
                  x2={x(shown.turn)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                />
                <ChartDot className="chart-dot" x={x(shown.turn)} y={y(shown.value)} />
              </>
            )}
          </svg>
        </div>
      </figure>
    </FullScreenFrame>
  );
}
