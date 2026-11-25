/** VIS, Meters: a meter warms from Text to Danger deep as its value nears the limit. */
import { describe, expect, it } from 'vite-plus/test';
import { nearLimitColor } from '../../src/web/condition-scale.ts';

describe('VIS: Meters', () => {
  it('takes the stops of the current health scale run the other way', () => {
    expect(nearLimitColor(0, 100)).toBe('var(--text)');
    expect(nearLimitColor(25, 100)).toBe('var(--warning)');
    expect(nearLimitColor(50, 100)).toBe('var(--accent-text)');
    expect(nearLimitColor(75, 100)).toBe('var(--danger)');
    expect(nearLimitColor(100, 100)).toBe('var(--danger-deep)');
    expect(nearLimitColor(150, 100)).toBe('var(--danger-deep)');
  });

  it('mixes the two neighbouring stops in between, e.g. Panic 90 of 100 between Danger and Danger deep', () => {
    expect(nearLimitColor(90, 100)).toBe('color-mix(in srgb, var(--danger) 40%, var(--danger-deep))');
    expect(nearLimitColor(10, 100)).toBe('color-mix(in srgb, var(--text) 60%, var(--warning))');
  });
});
