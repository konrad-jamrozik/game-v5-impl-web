/**
 * What the Player last chose about the Side panel. Each value belongs to the GUI alone: it has its starting value
 * whenever a Session starts and stays as the Player last left it for the rest of the Session, whatever Campaign is
 * loaded, so it lives here, outside the Campaign screen, which is mounted anew for each Campaign.
 * - CSCR, Hiding the Side panel: whether the Player has hidden the Side panel; shown when a Session starts.
 * - CSCR, Navigation: the chosen tab of the navigation, by the name of its group; Operations when a Session starts.
 * - MUSIC, Music control in the Side panel: whether the Music control is collapsed; expanded when a Session starts.
 */
import { useSyncExternalStore } from 'react';

/** One value kept for the Session, with the components that show it. */
function sessionValue<T>(start: T) {
  let value = start;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    get: (): T => value,
    set: (next: T): void => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    use: (): T =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => start,
      ),
  };
}

const hidden = sessionValue(false);
const navigationTab = sessionValue('Operations');
const musicCollapsed = sessionValue(false);

export function setSidePanelHidden(value: boolean): void {
  hidden.set(value);
}

/** Whether the Side panel is hidden. */
export function useSidePanelHidden(): boolean {
  return hidden.use();
}

/** For tests: the Side panel as a new Session starts. */
export function sidePanelHidden(): boolean {
  return hidden.get();
}

export function setNavigationTab(group: string): void {
  navigationTab.set(group);
}

/** The name of the group whose tab is chosen. */
export function useNavigationTab(): string {
  return navigationTab.use();
}

export function setMusicCollapsed(value: boolean): void {
  musicCollapsed.set(value);
}

/** Whether the Music control of the Side panel is collapsed to its Track title. */
export function useMusicCollapsed(): boolean {
  return musicCollapsed.use();
}
