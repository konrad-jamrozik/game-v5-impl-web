/**
 * CSCR, Autopilot controls: the Player sets up Autopilot once per Session. The GUI keeps whether the Autopilot controls
 * are expanded, the chosen Autopilot AI, and the number of Turns for the rest of the Session, as the Player last left
 * them; loading a Campaign save, Timeline navigation, creating a Campaign, and returning to the Main menu change none of
 * them. They belong to the GUI alone and are never persisted, so they live in this module for as long as the page,
 * which holds the Session, and a new Session starts with them collapsed.
 */
import { useState } from 'react';

export interface AutopilotControls {
  readonly expanded: boolean;
  /** The chosen Autopilot AI, or null before the Player chose one. */
  readonly aiId: string | null;
  readonly turns: number;
}

/** The Autopilot controls of a new Session: collapsed, with no Autopilot AI chosen, and 10 Turns. */
export const NEW_SESSION_CONTROLS: AutopilotControls = { expanded: false, aiId: null, turns: 10 };

let kept: AutopilotControls = NEW_SESSION_CONTROLS;

/** The Autopilot controls as the Player last left them in this Session. */
export function keptAutopilotControls(): AutopilotControls {
  return kept;
}

/** Keeps a change to the Autopilot controls for the rest of the Session. */
export function keepAutopilotControls(change: Partial<AutopilotControls>): AutopilotControls {
  kept = { ...kept, ...change };
  return kept;
}

/** Starts a new Session's Autopilot controls, e.g. between tests. */
export function resetAutopilotControls(): void {
  kept = NEW_SESSION_CONTROLS;
}

/**
 * The Autopilot AI the selector shows: the kept one when `listAutopilotAis()` reports it, and otherwise the first one
 * it reports, or '' when it reports none.
 */
export function shownAutopilotAi(keptAi: string | null, listed: readonly string[]): string {
  return keptAi !== null && listed.includes(keptAi) ? keptAi : (listed[0] ?? '');
}

/** The Autopilot controls of this Session as React state, kept for the rest of the Session on every change. */
export function useAutopilotControls(): [AutopilotControls, (change: Partial<AutopilotControls>) => void] {
  const [controls, setControls] = useState(keptAutopilotControls);
  return [
    controls,
    (change) => {
      setControls(keepAutopilotControls(change));
    },
  ];
}
