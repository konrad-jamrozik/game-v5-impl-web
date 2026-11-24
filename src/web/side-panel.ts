/**
 * What the Player last chose about the Side panel. Each value belongs to the GUI alone: it has its starting value
 * whenever a Session starts and stays as the Player last left it for the rest of the Session, whatever Campaign is
 * loaded, so it lives here, outside the Campaign screen, which is mounted anew for each Campaign.
 * - CSCR, Hiding the Side panel: whether the Player has hidden the Side panel; shown when a Session starts.
 * - MUSIC, Music control in the Side panel: whether the Music control is collapsed; expanded when a Session starts.
 */
import { sessionValue } from './session-value.ts';

const hidden = sessionValue(false);
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

export function setMusicCollapsed(value: boolean): void {
  musicCollapsed.set(value);
}

/** Whether the Music control of the Side panel is collapsed to its Track title. */
export function useMusicCollapsed(): boolean {
  return musicCollapsed.use();
}
