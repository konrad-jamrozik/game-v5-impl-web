/**
 * VIS, Steppers: a click on "−" or "+" changes the count by 1, by 10 while Shift is held, and by 100 while Ctrl is
 * held. Cmd counts as Ctrl, because Ctrl-click opens the context menu on a Mac.
 */
export function stepOf(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): number {
  if (event.ctrlKey || event.metaKey) {
    return 100;
  }
  return event.shiftKey ? 10 : 1;
}

/** VIS, Steppers: the count after a step, never past the bounds 0 and `max`. */
export function steppedCount(value: number, delta: number, max: number): number {
  return Math.max(0, Math.min(max, value + delta));
}
