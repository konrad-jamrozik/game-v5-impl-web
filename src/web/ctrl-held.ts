/**
 * GUI, Ctrl: whether the Player holds Ctrl now, for controls whose step changes while it is held, e.g. CSCR, Undo and
 * redo. Leaving the window counts as releasing it, since the key-up then never reaches the page.
 */
import { useEffect, useState } from 'react';

export function useCtrlHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      setHeld(event.ctrlKey);
    };
    const onPointer = (event: PointerEvent) => {
      setHeld(event.ctrlKey);
    };
    const release = () => {
      setHeld(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('blur', release);
    };
  }, []);
  return held;
}
