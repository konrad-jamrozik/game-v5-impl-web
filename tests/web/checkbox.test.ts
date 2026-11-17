/** VIS, Checkboxes: a checkbox is a 16 px square, whatever the rules of other inputs add. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('VIS: Checkboxes', () => {
  it('is a 16 px square with none of the padding of other inputs', () => {
    const css = readFileSync(new URL('../../src/web/styles.css', import.meta.url), 'utf8');
    const start = css.indexOf("input[type='checkbox'] {");
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('appearance: none');
    expect(rule).toMatch(/width: 16px;[\s\S]*height: 16px;/);
    // The generic input rule's horizontal padding would make the box wider than 16 px.
    expect(rule).toContain('padding: 0;');
  });
});
