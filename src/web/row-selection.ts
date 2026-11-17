/**
 * VIS, Tables: a table whose rows each have a selection checkbox lets the Player select several rows at once. A click
 * on a row's checkbox, or on the row outside its links and buttons, selects or clears that row and makes it the
 * anchor; a Shift-click gives every row from the anchor to the clicked row, both included, the state the anchor has;
 * and pressing on a row and moving the pointer across others gives each row passed over the state the pressed row
 * took. A row whose checkbox is disabled is skipped by each of these, and pressing or dragging never selects text.
 */
import { useEffect, useRef, type MouseEvent } from 'react';

/** The selection after giving `value` to `id`, keeping the order in which rows were selected. */
export function setRow(selected: readonly string[], id: string, value: boolean): string[] {
  const has = selected.includes(id);
  if (value === has) {
    return [...selected];
  }
  return value ? [...selected, id] : selected.filter((item) => item !== id);
}

/**
 * The selection after a Shift-click on `target`: every selectable row from `anchor` to `target` in the shown `order`,
 * both included, takes the state `value` the anchor has. With no anchor among the shown rows, only `target` changes.
 */
export function setRange(
  selected: readonly string[],
  order: readonly string[],
  anchor: string | null,
  target: string,
  value: boolean,
  selectable: (id: string) => boolean,
): string[] {
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) {
    return selectable(target) ? setRow(selected, target, value) : [...selected];
  }
  let next = [...selected];
  for (const id of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (selectable(id)) {
      next = setRow(next, id, value);
    }
  }
  return next;
}

/** Whether a press started on a link, a button, or another control that is not the row's own checkbox. */
function onOwnControl(event: MouseEvent): boolean {
  const target = event.target as HTMLElement;
  return target.closest('a, button, select, textarea, input:not([type="checkbox"])') !== null;
}

/**
 * Row and checkbox handlers for a multi-select table. `order` lists the shown rows in their shown order; `selected`
 * and `onChange` hold the selection.
 */
export function useRowSelection(options: {
  order: readonly string[];
  selected: readonly string[];
  selectable: (id: string) => boolean;
  onChange: (ids: string[]) => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const anchor = useRef<string | null>(null);
  const drag = useRef<{ value: boolean } | null>(null);

  useEffect(() => {
    const end = () => {
      drag.current = null;
    };
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mouseup', end);
    };
  }, []);

  const press = (event: MouseEvent, id: string): void => {
    const { order, selected, selectable, onChange } = latest.current;
    if (event.button !== 0 || onOwnControl(event) || !selectable(id)) {
      return;
    }
    // VIS, Tables: pressing or dragging over the rows never selects their text.
    event.preventDefault();
    const anchorId = anchor.current;
    if (event.shiftKey && anchorId !== null && order.includes(anchorId)) {
      onChange(setRange(selected, order, anchorId, id, selected.includes(anchorId), selectable));
      return;
    }
    const value = !selected.includes(id);
    anchor.current = id;
    drag.current = { value };
    onChange(setRow(selected, id, value));
  };

  const enter = (event: MouseEvent, id: string): void => {
    const { selected, selectable, onChange } = latest.current;
    if (drag.current === null || (event.buttons & 1) === 0) {
      drag.current = null;
      return;
    }
    if (selectable(id) && selected.includes(id) !== drag.current.value) {
      onChange(setRow(selected, id, drag.current.value));
    }
  };

  return {
    /** Spread onto each row's `<tr>`. */
    row: (id: string) => ({
      onMouseDown: (event: MouseEvent) => {
        press(event, id);
      },
      onMouseEnter: (event: MouseEvent) => {
        enter(event, id);
      },
    }),
    /** Spread onto each row's checkbox: pointer presses are handled by the row, the keyboard by the checkbox. */
    checkbox: (id: string) => ({
      checked: latest.current.selected.includes(id),
      disabled: !latest.current.selectable(id),
      onChange: () => {
        // Checked state is controlled; the row's press or the click below changes it.
      },
      onClick: (event: MouseEvent) => {
        if (event.detail === 0) {
          const { selected, onChange } = latest.current;
          anchor.current = id;
          onChange(setRow(selected, id, !selected.includes(id)));
        }
      },
    }),
  };
}
