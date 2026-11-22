/** VIS, Charts: the Last 100 Turns checkbox and the 7 px dot; CSCR, Hiding the Side panel. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { LAST_TURNS, lastTurnsFrom } from '../../src/web/chart-range.ts';
import { setSidePanelHidden, sidePanelHidden } from '../../src/web/side-panel.ts';

describe('VIS: the Last 100 Turns checkbox', () => {
  it('shows only the last 100 Turns while checked, and every Turn otherwise', () => {
    const turns = Array.from({ length: 150 }, (_, index) => index + 1);
    expect(LAST_TURNS).toBe(100);
    expect(lastTurnsFrom(turns, true)).toBe(51);
    expect(turns.filter((turn) => turn >= lastTurnsFrom(turns, true))).toHaveLength(100);
    expect(lastTurnsFrom(turns, false)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('changes nothing for a chart of 100 Turns or fewer', () => {
    const turns = Array.from({ length: 40 }, (_, index) => index + 1);
    expect(turns.filter((turn) => turn >= lastTurnsFrom(turns, true))).toEqual(turns);
  });
});

describe('VIS: a chart dot', () => {
  it('is 7 px across on screen, however wide the chart is drawn', () => {
    const css = readFileSync(new URL('../../src/web/styles.css', import.meta.url), 'utf8');
    const start = css.indexOf('.chart-dot,\n.chart-point {');
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('stroke-width: 7;');
    expect(rule).toContain('stroke-linecap: round;');
    expect(rule).toContain('vector-effect: non-scaling-stroke;');
  });
});

describe('CSCR: Hiding the Side panel', () => {
  it('starts shown and stays as last left', () => {
    expect(sidePanelHidden()).toBe(false);
    setSidePanelHidden(true);
    expect(sidePanelHidden()).toBe(true);
    setSidePanelHidden(false);
    expect(sidePanelHidden()).toBe(false);
  });
});
