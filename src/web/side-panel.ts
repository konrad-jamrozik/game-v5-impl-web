/**
 * CSCR, Hiding the Side panel: whether the Player last hid the Side panel. It is the Global configuration setting Side
 * panel hidden, off by default, so it stays as the Player last left it whatever Campaign is loaded and in every later
 * Session.
 */
import { setSetting, settingValue, useSnapshot } from './store.ts';

export function setSidePanelHidden(value: boolean): void {
  void setSetting('sidePanelHidden', value);
}

/** Whether the Side panel is hidden. */
export function useSidePanelHidden(): boolean {
  return settingValue(useSnapshot().configuration, 'sidePanelHidden') === true;
}
