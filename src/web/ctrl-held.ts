/**
 * GUI, Ctrl: whether the Player holds Ctrl now, for controls whose step changes while it is held, e.g. CSCR, Undo and
 * redo. Leaving the window counts as releasing it, since the key-up then never reaches the page.
 */
import { useEffect, useRef, useState } from 'react';

export function useCtrlHeld(): boolean {
  const [held, setHeld] = useState(false);
  // Only a change of Ctrl renders again: a render on every key or pointer move would race the keys' own handlers,
  // e.g. the U key pressed right after the H key.
  const current = useRef(false);
  useEffect(() => {
    const update = (value: boolean) => {
      if (value !== current.current) {
        current.current = value;
        setHeld(value);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      update(event.ctrlKey);
    };
    const onPointer = (event: PointerEvent) => {
      update(event.ctrlKey);
    };
    const release = () => {
      update(false);
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
