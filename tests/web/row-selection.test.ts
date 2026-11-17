/** VIS, Tables: multi-row selection by click, Shift-click, and drag. */
import { describe, expect, it } from 'vitest';
import { setRange, setRow } from '../../src/web/row-selection.ts';

const order = Array.from({ length: 12 }, (_, i) => `agent-${i + 1}`);
const all = () => true;

describe('VIS: Tables, multi-row selection', () => {
  it('Shift-clicking agent-3 after selecting agent-10 selects agent-3 to agent-10', () => {
    const selected = setRow([], 'agent-10', true);
    expect(setRange(selected, order, 'agent-10', 'agent-3', true, all).sort()).toEqual(
      order.slice(2, 10).sort(),
    );
  });

  it('gives the range the state the anchor has, clearing it when the anchor is clear', () => {
    const selected = order.slice(0, 6);
    expect(setRange(selected, order, 'agent-2', 'agent-4', false, all)).toEqual([
      'agent-1',
      'agent-5',
      'agent-6',
    ]);
  });

  it('skips a row whose checkbox is disabled', () => {
    const selectable = (id: string) => id !== 'agent-5';
    const next = setRange([], order, 'agent-3', 'agent-7', true, selectable);
    expect(next.sort()).toEqual(['agent-3', 'agent-4', 'agent-6', 'agent-7']);
  });

  it('changes only the clicked row when the anchor is not shown', () => {
    expect(setRange(['agent-1'], order, 'agent-99', 'agent-4', true, all)).toEqual(['agent-1', 'agent-4']);
  });

  it('setRow keeps the order in which rows were selected', () => {
    expect(setRow(setRow(['agent-2'], 'agent-1', true), 'agent-2', false)).toEqual(['agent-1']);
    expect(setRow(['agent-1'], 'agent-1', true)).toEqual(['agent-1']);
  });
});
