/**
 * A chart with several series in SVG, styled under VIS, Charts, drawn from the shapes `seriesChartScene` lays out. It
 * shows a legend in place of a current value; hovering a Turn writes that Turn's values under it, on a line that keeps
 * its height while no Turn is hovered.
 */
import { useState } from 'react';
import { readoutText, type AgencyChart } from '../agency-charts.ts';
import { hoverRect, legendOf, sceneTurnAt, seriesChartScene, shownChart } from '../series-chart-scene.ts';
import { useLastTurns } from '../chart-range.ts';
import { groupDigits } from '../format.ts';
import { LastTurnsCheckbox } from './LastTurnsCheckbox.tsx';
import { FullScreenButton, useChartFullScreen, usePlotSize } from './ChartFullScreen.tsx';

const WIDTH = 900;
const HEIGHT = 240;

/**
 * VIS, Charts: the dot that marks a line's latest point, 7 px across on screen however wide the chart is drawn: a
 * point of a 7 px round-capped stroke that keeps its width in screen pixels.
 */
export function ChartDot(props: { x: number; y: number; color?: string; className?: string }) {
  return (
    <path
      className={props.className ?? 'chart-point'}
      d={`M${props.x.toFixed(1)},${props.y.toFixed(1)}h0`}
      style={props.color === undefined ? undefined : { stroke: props.color }}
    />
  );
}

export function SeriesChart({ chart }: { chart: AgencyChart }) {
  const [lastOnly, setLastOnly] = useLastTurns(chart.key);
  // VIS, Charts: while the Last 100 Turns checkbox is checked, only the last 100 of the Turns it would show.
  const shown = shownChart(chart, lastOnly);
  const [hover, setHover] = useState<number | null>(null);
  // VIS, Charts: while the chart is shown full screen, its plot is drawn at the size it takes on screen.
  const screen = useChartFullScreen(chart.key);
  const [plotRef, plotSize] = usePlotSize(screen.full);
  // VIS, Charts: while another chart of the view is shown full screen, this one is not shown.
  if (screen.hidden) {
    return null;
  }
  const scene = seriesChartScene(shown, plotSize?.width ?? WIDTH, plotSize?.height ?? HEIGHT);
  const caption = (
    <figcaption>
      <h4>{chart.title}</h4>
      <LastTurnsCheckbox chart={chart.key} on={lastOnly} onChange={setLastOnly} />
      {screen.full ? null : <FullScreenButton onPress={screen.open} testId={chart.key} />}
    </figcaption>
  );
  // VIS, Charts: a chart with several series has its legend on a row of its own under the title row.
  const legendRow = (
    <ul className="chart-legend">
      {legendOf(shown).map((series) => (
        <li key={series.name}>
          <span
            className={series.line ? 'chart-key chart-key-line' : 'chart-key'}
            style={{ background: series.color }}
          />
          {series.name}
        </li>
      ))}
    </ul>
  );
  if (scene === null) {
    return (
      <figure className="chart chart-wide" data-testid={chart.key}>
        {caption}
        {legendRow}
        <p className="muted small">No ended Turn yet.</p>
      </figure>
    );
  }
  const shownTurn = hover;
  const detailText = readoutText({ turn: shownTurn, ...shown, total: chart.total });
  const highlight = shownTurn === null ? null : hoverRect(scene, shownTurn);

  return (
    <figure className={`chart chart-wide${screen.full ? ' chart-full' : ''}`} data-testid={chart.key}>
      {caption}
      {legendRow}
      <div className="chart-plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          role="img"
          aria-label={`${chart.title}, Turn ${groupDigits(scene.first)} to Turn ${groupDigits(scene.last)}`}
          onMouseLeave={() => {
            setHover(null);
          }}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setHover(sceneTurnAt(scene, ((event.clientX - box.left) / box.width) * scene.width));
          }}
        >
          {scene.grid.map((line, index) => (
            <line
              key={`g${index}`}
              className={line.base ? 'chart-base' : 'chart-grid'}
              x1={line.x1}
              x2={line.x2}
              y1={line.y}
              y2={line.y}
            />
          ))}
          {scene.ticks.map((tick, index) => (
            <text key={`t${index}`} className="chart-tick" x={tick.x} y={tick.y} textAnchor={tick.anchor}>
              {tick.text}
            </text>
          ))}
          {highlight === null ? null : (
            <rect
              className="chart-hover"
              x={highlight.x}
              y={highlight.y}
              width={highlight.width}
              height={highlight.height}
            />
          )}
          <g>
            {scene.rects.map((rect, index) => (
              <rect
                key={index}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={rect.color}
              />
            ))}
          </g>
          {scene.lines.map((line) => (
            <g
              key={line.name}
              opacity={line.opacity === 1 ? undefined : line.opacity}
              data-testid="chart-series-line"
            >
              {line.outline ? <path className="chart-series-outline" d={line.d} /> : null}
              <path className="chart-series-line" d={line.d} style={{ stroke: line.color }} />
              <ChartDot x={line.dot.x} y={line.dot.y} color={line.color} />
            </g>
          ))}
        </svg>
      </div>
      <p className="chart-details small muted">{detailText}</p>
    </figure>
  );
}
