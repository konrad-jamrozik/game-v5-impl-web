/** VIS, Sliders: the filled share of the track. */
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
});
