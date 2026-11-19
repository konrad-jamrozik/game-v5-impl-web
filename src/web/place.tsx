/**
 * CSCR, View trail: what a Detail view keeps of the place it shows, so that Go back can show that place again as the
 * Player left it, and the Follow and Back control it offers. The Campaign screen provides it for the open Detail view.
 */
import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

/** The memo key under which a Detail view names what it shows one step away, e.g. "Combat report". */
export const PLACE_NAME_KEY = '@name';

export interface PlaceContextValue {
  /** What the place being shown again remembered; empty for a place shown afresh. */
  readonly restored: Readonly<Record<string, unknown>>;
  /** The scroll position of the place being shown again; 0 for a place shown afresh. */
  readonly restoredScrollTop: number;
  /** The memo of the shown place, kept current by the Detail view as it renders. */
  readonly live: { current: Record<string, unknown> };
  /**
   * CSCR, View trail, Follow: adds the shown place to the View trail, called by the Detail view just before it shows
   * something one step away in place of its content.
   */
  readonly follow: () => void;
  /**
   * CSCR, View trail: the Back control, present only while the View trail is not empty. `toSummary` says it shows the
   * Turn summary again, which SOUNDS, Turn summary makes a Main click rather than a Go back.
   */
  readonly back: { readonly label: string; readonly go: () => void; readonly toSummary: boolean } | null;
  /** CSCR, View trail, Close: closing the Detail view shows the Turn summary again, a Main click under SOUNDS. */
  readonly closeShowsSummary: boolean;
}

const NO_PLACE: PlaceContextValue = {
  restored: {},
  restoredScrollTop: 0,
  live: { current: {} },
  follow: () => undefined,
  back: null,
  closeShowsSummary: false,
};

export const PlaceContext = createContext<PlaceContextValue>(NO_PLACE);

export function usePlace(): PlaceContextValue {
  return useContext(PlaceContext);
}

/**
 * Like `useState`, but part of the place: its value starts from the place being shown again, when it remembered one,
 * and is remembered whenever the place is added to the View trail.
 */
export function usePlaceState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const place = useContext(PlaceContext);
  const [value, setValue] = useState<T>(() => (key in place.restored ? (place.restored[key] as T) : initial));
  place.live.current[key] = value;
  return [value, setValue];
}

/** Names what the Detail view shows one step away in place of its content, or null while it shows its content. */
export function usePlaceName(name: string | null): void {
  const place = useContext(PlaceContext);
  place.live.current[PLACE_NAME_KEY] = name;
}
