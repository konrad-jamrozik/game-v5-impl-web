/**
 * VIS, Charts, Full screen: the ⤢ button at the right end of a chart's title row shows the chart alone over a Scrim,
 * inset 24 px, with its plot taking the rest of the height and drawn at the size it takes on screen, so that its lines,
 * dots, and labels keep their usual size. The button is then a close control, ✕, and it, the Escape key, and a press
 * on the Scrim each return the chart to its place.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';

export interface FullScreen {
  readonly full: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
}

/** Whether a chart is shown full screen; Escape closes it before any other use of the key. */
export function useFullScreen(): FullScreen {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playSound(SOUND.back);
      setFull(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [full]);
  return {
    full,
    toggle: () => {
      setFull(!full);
    },
    close: () => {
      setFull(false);
    },
  };
}

/** The ⤢ button of a chart's title row, or ✕ while the chart is shown full screen. */
export function FullScreenButton(props: { screen: FullScreen; testId?: string }) {
  const { full, toggle } = props.screen;
  const label = full ? 'Close (Esc)' : 'Show full screen';
  return (
    <button
      type="button"
      className="chart-full-button"
      title={label}
      aria-label={full ? 'Close' : 'Show full screen'}
      data-testid={props.testId === undefined ? undefined : `${props.testId}-full-screen`}
      data-sound={full ? 'back' : 'main'}
      onClick={toggle}
    >
      {full ? '✕' : '⤢'}
    </button>
  );
}

/** The chart in its place, or alone over a Scrim while it is shown full screen. */
export function FullScreenFrame(props: { screen: FullScreen; children: ReactNode }) {
  if (!props.screen.full) {
    return props.children;
  }
  return createPortal(
    <div
      className="scrim chart-scrim"
      data-testid="chart-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          playSound(SOUND.back);
          props.screen.close();
        }
      }}
    >
      {props.children}
    </div>,
    document.body,
  );
}

/**
 * The size of a chart's plot on screen while it is shown full screen, so that its viewBox matches it one to one;
 * null otherwise, or before it is first measured.
 */
export function usePlotSize(
  full: boolean,
): [RefObject<HTMLDivElement | null>, { width: number; height: number } | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!full || element === null) {
      setSize(null);
      return undefined;
    }
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [full]);
  return [ref, size];
}
