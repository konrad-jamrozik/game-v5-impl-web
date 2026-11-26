/** VIS, Charts: the layout of a chart with several series. */
import { describe, expect, it } from 'vite-plus/test';
import {
  hoverRect,
  LINE_OVER_BARS_OPACITY,
  sceneTurnAt,
  seriesChartScene,
  shownChart,
} from '../../src/web/series-chart-scene.ts';

const red = { name: 'Red', color: '#F00' };
const blue = { name: 'Blue', color: '#00F' };

describe('VIS: Charts, a chart with several series', () => {
  it('stacks each bar outward from the baseline in legend order, a 0 drawing no segment', () => {
    const scene = seriesChartScene(
      {
        barSeries: [red, blue],
        bars: [
          { turn: 1, above: [1, 1], below: [] },
          { turn: 2, above: [0, 2], below: [] },
        ],
        lines: [],
      },
      900,
      240,
    )!;
    expect(scene.rects.map((rect) => rect.color)).toEqual(['#F00', '#00F', '#00F']);
    const [low, high] = scene.rects;
    // The first series sits on the baseline, the second on top of it.
    expect(low!.y).toBeGreaterThan(high!.y);
    // 70% as wide as one Turn's share of the plot.
    expect(low!.width).toBeCloseTo(scene.slot * 0.7);
  });

  it('draws a line over stacked bars with an outline at 70% opacity, and a line alone fully opaque', () => {
    const line = { ...red, points: [{ turn: 1, value: 3 }] };
    const over = seriesChartScene(
      { barSeries: [blue], bars: [{ turn: 1, above: [2], below: [] }], lines: [line] },
      900,
      240,
    )!;
    expect(LINE_OVER_BARS_OPACITY).toBe(0.7);
    expect(over.lines[0]).toMatchObject({ outline: true, opacity: 0.7 });
    const alone = seriesChartScene({ barSeries: [], bars: [], lines: [line] }, 900, 240)!;
    expect(alone.lines[0]).toMatchObject({ outline: false, opacity: 1 });
  });

  it('labels the top and the baseline, and the first and last Turn', () => {
    const scene = seriesChartScene(
      { barSeries: [red], bars: [3, 4, 5].map((turn) => ({ turn, above: [7], below: [] })), lines: [] },
      900,
      240,
    )!;
    expect(scene.ticks.map((tick) => tick.text)).toEqual(['10', '0', 'T3', 'T5']);
    expect(sceneTurnAt(scene, 0)).toBe(3);
    expect(sceneTurnAt(scene, 900)).toBe(5);
    expect(hoverRect(scene, 4).width).toBeCloseTo(scene.slot);
  });

  it('has nothing to draw without a Turn, and shows only the last 100 Turns while asked', () => {
    expect(seriesChartScene({ barSeries: [], bars: [], lines: [] }, 900, 240)).toBeNull();
    const chart = {
      barSeries: [red],
      bars: Array.from({ length: 150 }, (_, index) => ({ turn: index + 1, above: [1], below: [] })),
      lines: [],
    };
    expect(shownChart(chart, true).bars.map((bar) => bar.turn)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 51),
    );
    expect(shownChart(chart, false).bars).toHaveLength(150);
  });
});
