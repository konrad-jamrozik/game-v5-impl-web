/** A single-series line chart in SVG with a crosshair and a tooltip. It only draws the values it is given. */
import { useState } from 'react';

export interface Point {
  readonly turn: number;
  readonly value: number;
}

const WIDTH = 520;
const HEIGHT = 170;
const PAD = { left: 48, right: 14, top: 12, bottom: 26 };

function niceStep(span: number): number {
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= rough) ?? 10;
  return Math.max(1, step * power);
}

export function LineChart(props: { title: string; points: readonly Point[]; unit?: string; limit?: number }) {
  const { points } = props;
  const [hover, setHover] = useState<number | null>(null);
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return (
      <figure className="chart">
        <figcaption>{props.title}</figcaption>
        <p className="muted small">No ended Turn yet.</p>
      </figure>
    );
  }
  const values = points.map((point) => point.value);
  const low = Math.min(0, ...values);
  const high = Math.max(props.limit ?? 1, ...values, low + 1);
  const step = niceStep(high - low);
  const top = Math.ceil(high / step) * step;
  const bottom = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let tick = bottom; tick <= top; tick += step) {
    ticks.push(tick);
  }
  const turnSpan = Math.max(1, last.turn - first.turn);
  const x = (turn: number) => PAD.left + ((turn - first.turn) / turnSpan) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * (HEIGHT - PAD.top - PAD.bottom);
  const path = points
    .map(
      (point, index) => `${index === 0 ? 'M' : 'L'}${x(point.turn).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .join(' ');
  const shown = hover === null ? null : (points[hover] ?? null);
  const unit = props.unit ?? '';

  return (
    <figure className="chart">
      <figcaption>
        {props.title}
        <span className="chart-value">
          {shown === null ? `now ${last.value}${unit}` : `Turn ${shown.turn}: ${shown.value}${unit}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${props.title}: ${first.value}${unit} in Turn ${first.turn}, ${last.value}${unit} in Turn ${last.turn}`}
        onMouseLeave={() => {
          setHover(null);
        }}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = ((event.clientX - box.left) / box.width) * WIDTH;
          let best = 0;
          points.forEach((point, index) => {
            if (Math.abs(x(point.turn) - at) < Math.abs(x(points[best]?.turn ?? 0) - at)) {
              best = index;
            }
          });
          setHover(best);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-tick" x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {props.limit === undefined ? null : (
          <line
            className="chart-limit"
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(props.limit)}
            y2={y(props.limit)}
          />
        )}
        <text className="chart-tick" x={PAD.left} y={HEIGHT - 6} textAnchor="start">
          Turn {first.turn}
        </text>
        <text className="chart-tick" x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end">
          Turn {last.turn}
        </text>
        <path className="chart-line" d={path} />
        {shown === null ? (
          <circle className="chart-dot" cx={x(last.turn)} cy={y(last.value)} r={4} />
        ) : (
          <>
            <line
              className="chart-cross"
              x1={x(shown.turn)}
              x2={x(shown.turn)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
            <circle className="chart-dot" cx={x(shown.turn)} cy={y(shown.value)} r={4} />
          </>
        )}
      </svg>
    </figure>
  );
}
