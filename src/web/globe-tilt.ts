/**
 * CSCR, Regions: how the globe's Tilt control leans the globe's axis. It is the Global configuration setting Globe tilt,
 * Level by default, so the Player who has chosen a view of the Earth keeps it in every later Session.
 */
import type { GlobeTilt } from './globe/globe.js';
import { setSetting, settingValue, useSnapshot } from './store.ts';

const TILTS: readonly GlobeTilt[] = ['Level', 'Mild', 'Earth'];

/** The Globe tilt the Player last chose, or Level. */
export function useGlobeTilt(): GlobeTilt {
  const value = settingValue(useSnapshot().configuration, 'globeTilt');
  return TILTS.find((tilt) => tilt === value) ?? 'Level';
}

/** GLOBE, Nothing from the game: the GUI, not the globe, keeps each tilt the globe reports. */
export function setGlobeTilt(tilt: GlobeTilt): void {
  void setSetting('globeTilt', tilt);
}
