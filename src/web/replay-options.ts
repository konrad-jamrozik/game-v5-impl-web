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

/**
 * CRPLAY, Options, Attacker mark: whether each attack begins with the ring around its attacker, the Global
 * configuration setting Combat replay Attacker mark, on by default. It holds for the pace buttons too.
 */
export const replayAttackerMark = {
  use: (): boolean => settingValue(useSnapshot().configuration, 'combatReplayAttackerMark') !== false,
  set: (next: boolean): void => {
    void setSetting('combatReplayAttackerMark', next);
  },
};
