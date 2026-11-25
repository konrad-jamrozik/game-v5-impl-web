/**
 * What the Player last chose about the Side panel. Each is a Global configuration setting, so it stays as the Player
 * last left it whatever Campaign is loaded and in every later Session.
 * - CSCR, Hiding the Side panel: Side panel hidden, off by default.
 * - MUSIC, Music control in the Side panel: Music control collapsed, off by default.
 */
import { setSetting, settingValue, useSnapshot } from './store.ts';

export function setSidePanelHidden(value: boolean): void {
  void setSetting('sidePanelHidden', value);
}

/** Whether the Side panel is hidden. */
export function useSidePanelHidden(): boolean {
  return settingValue(useSnapshot().configuration, 'sidePanelHidden') === true;
}

export function setMusicCollapsed(value: boolean): void {
  void setSetting('musicControlCollapsed', value);
}

/** Whether the Music control of the Side panel is collapsed to its Track title. */
export function useMusicCollapsed(): boolean {
  return settingValue(useSnapshot().configuration, 'musicControlCollapsed') === true;
}
