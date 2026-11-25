/**
 * VIS, Charts, Full screen, and CRPLAY, Whole screen: a chart's ⤢ button shows the chart alone, one step away as a
 * Follow, and its view then covers the whole screen as the Combat replay does; the Back control and Escape return.
 * The Equip table of AVIEW covers the whole screen the same way.
 */
import { createContext, use, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** CRPLAY, Whole screen: its content covers the status bar, the Side panel, and the Globe stage while `active`. */
export function WholeScreen(props: { active: boolean; children: ReactNode }) {
  if (!props.active) {
    return props.children;
  }
  return createPortal(<div className="whole-screen">{props.children}</div>, document.body);
}

/** VIS, Charts, Full screen: the chart of a view shown full screen, by its key, or null when none is. */
export interface ChartsFullScreen {
  readonly fullKey: string | null;
  readonly open: (key: string) => void;
}

export const ChartsFullScreenContext = createContext<ChartsFullScreen>({
  fullKey: null,
  open: () => undefined,
});

/** Whether this chart is the one shown full screen, or is hidden because another one is. */
export function useChartFullScreen(key: string): { full: boolean; hidden: boolean; open: () => void } {
  const { fullKey, open } = use(ChartsFullScreenContext);
  return {
    full: fullKey === key,
    hidden: fullKey !== null && fullKey !== key,
    open: () => {
      open(key);
    },
  };
}

/** VIS, Charts: the ⤢ button at the very right end of a chart's title row. */
export function FullScreenButton(props: { onPress: () => void; testId?: string }) {
  return (
    <button
      type="button"
      className="chart-full-button"
      title="Show full screen"
      aria-label="Show full screen"
      data-testid={props.testId === undefined ? undefined : `${props.testId}-full-screen`}
      onClick={props.onPress}
    >
      ⤢
    </button>
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
