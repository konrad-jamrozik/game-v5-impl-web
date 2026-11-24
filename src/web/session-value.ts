/**
 * A value that belongs to the GUI alone and is kept for the Session: it has its starting value whenever a Session
 * starts and stays as the Player last left it for the rest of the Session, whatever Campaign is loaded. It lives
 * outside every screen, because the screens are mounted anew, e.g. the Campaign screen for each Campaign.
 */
import { useSyncExternalStore } from 'react';

export interface SessionValue<T> {
  readonly get: () => T;
  readonly set: (next: T) => void;
  /** The value, for a component that shows it and follows its changes. */
  readonly use: () => T;
}

export function sessionValue<T>(start: T): SessionValue<T> {
  let value = start;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    get: () => value,
    set: (next) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    use: () =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => start,
      ),
  };
}

/** CRPLAY, Playback, Options: whether the options of the Combat replay are shown; hidden when a Session starts. */
export const replayOptionsShown = sessionValue(false);
