import { describe, expect, it } from 'vite-plus/test';
import { stepOf, steppedCount } from '../../src/web/stepper.ts';

const click = { shiftKey: false, ctrlKey: false, metaKey: false };

describe('VIS: Steppers', () => {
  it('steps by 1, by 10 with Shift, and by 100 with Ctrl or Cmd', () => {
    expect(stepOf(click)).toBe(1);
    expect(stepOf({ ...click, shiftKey: true })).toBe(10);
    expect(stepOf({ ...click, ctrlKey: true })).toBe(100);
    expect(stepOf({ ...click, metaKey: true })).toBe(100);
    expect(stepOf({ ...click, shiftKey: true, ctrlKey: true })).toBe(100);
  });

  it('never steps past its bounds', () => {
    expect(steppedCount(5, -10, 50)).toBe(0);
    expect(steppedCount(45, 10, 50)).toBe(50);
    expect(steppedCount(3, 100, Number.MAX_SAFE_INTEGER)).toBe(103);
  });
});
