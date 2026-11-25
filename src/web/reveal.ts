/**
 * DEV, Revealed presentation, and GUI, Reveal hidden content: the setting Reveal hidden content, which the GUI keeps in
 * the Global configuration setting Reveal hidden content on and the Game rules never read. It is not Campaign state, no Campaign save holds it, and setting it is no Player
 * action. These rules need no browser.
 */
import type { SessionStatus } from '../engine/index.ts';

/** DEV, Revealed presentation, Dev mode only: the setting can be turned on only while Dev mode is enabled. */
export function canReveal(status: Pick<SessionStatus, 'devMode' | 'autopilot'>): boolean {
  return status.devMode && status.autopilot === null;
}

/**
 * DEV, Revealed presentation: whether the GUI presents the Current campaign under Revealed presentation. The setting
 * is in effect only while Dev mode is enabled, and the GUI keeps it while Dev mode is disabled, e.g. at the Main
 * menu (GUI, Developer tools, Kept across Sessions). While Autopilot is engaged it presents only Player-visible information,
 * because Developer API is unavailable, and it presents revealed values again once Autopilot is disengaged.
 */
export function revealInEffect(
  setting: boolean,
  status: Pick<SessionStatus, 'devMode' | 'autopilot' | 'hasCurrentCampaign'>,
): boolean {
  return setting && status.hasCurrentCampaign && canReveal(status);
}
