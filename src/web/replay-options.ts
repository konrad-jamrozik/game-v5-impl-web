/**
 * CRPLAY, Options: whether the Options of the Combat replay are shown is the Global configuration setting Combat replay
 * Options shown, hidden by default, so it stays as the Player last left it in every later Session.
 */
import { setSetting, settingValue, useSnapshot } from './store.ts';

export const replayOptionsShown = {
  /** Whether the Options are shown, for a component that follows its changes. */
  use: (): boolean => settingValue(useSnapshot().configuration, 'combatReplayOptionsShown') === true,
  set: (next: boolean): void => {
    void setSetting('combatReplayOptionsShown', next);
  },
};
