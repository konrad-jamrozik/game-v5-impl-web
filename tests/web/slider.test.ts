/** VIS, Sliders: the filled share of the track, and the drawing that keeps the track within the thumb's travel. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { sliderFill } from '../../src/web/slider.ts';

describe('VIS: Sliders', () => {
  it('fills none of the track at the least value and all of it at the greatest', () => {
    expect(sliderFill(0, 0, 100)).toBe('0%');
    expect(sliderFill(100, 0, 100)).toBe('100%');
    expect(sliderFill(53, 0, 100)).toBe('53%');
    expect(sliderFill(150, 0, 100)).toBe('100%');
    expect(sliderFill(-5, 0, 100)).toBe('0%');
  });

  it('draws its own track, inset by half the thumb, instead of the browser track that shows past the thumb', () => {
    const css = readFileSync(new URL('../../src/web/styles.css', import.meta.url), 'utf8');
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(rule('.slider::before')).toMatch(/left: 7px;[\s\S]*right: 7px;[\s\S]*height: 4px;/);
    expect(rule('.slider::before')).toContain('var(--accent) var(--fill)');
    expect(rule('.slider input')).toContain('appearance: none');
    // The padding and border of other inputs would stop the thumb short of the track's ends.
    expect(rule('.slider input')).toMatch(/padding: 0;[\s\S]*border: none;/);
    expect(rule('.slider input::-webkit-slider-thumb')).toMatch(/width: 14px;[\s\S]*height: 14px;/);
    expect(rule('.slider input::-moz-range-thumb')).toMatch(/width: 14px;[\s\S]*height: 14px;/);
  });
});
