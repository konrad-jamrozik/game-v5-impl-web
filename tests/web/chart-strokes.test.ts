/**
 * VIS, Charts: a line is 2 px and the outline beneath a line over stacked bars 4 px, on screen. A chart's svg scales
 * its viewBox to the width of the Detail view, so a stroke given in viewBox units would grow with the window; every
 * chart stroke must therefore keep its width in screen pixels.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

const css = readFileSync(new URL('../../src/web/styles.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('VIS: Charts', () => {
  it.each([
    ['.chart-line', 2],
    ['.chart-series-line', 2],
    ['.chart-series-outline', 4],
  ])('draws %s %i px wide on screen, whatever the chart is scaled to', (selector, width) => {
    const body = rule(selector);
    expect(body).toContain(`stroke-width: ${width};`);
    expect(body).toContain('vector-effect: non-scaling-stroke;');
  });
});
