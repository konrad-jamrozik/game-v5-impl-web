/**
 * CSCR, Hiding the Side panel: whether the Player has hidden the Side panel. It belongs to the GUI alone: shown whenever
 * a Session starts and as the Player last left it for the rest of the Session, whatever Campaign is loaded, so it lives
 * here, outside the Campaign screen, which is mounted anew for each Campaign.
 */
import { useSyncExternalStore } from 'react';

let hidden = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSidePanelHidden(value: boolean): void {
  hidden = value;
  for (const listener of listeners) {
    listener();
  }
}

/** Whether the Side panel is hidden. */
export function useSidePanelHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  );
}

/** For tests: the Side panel as a new Session starts. */
export function sidePanelHidden(): boolean {
  return hidden;
}
