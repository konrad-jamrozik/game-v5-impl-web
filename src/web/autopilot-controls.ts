/**
 * CSCR, Autopilot controls: the Player sets up Autopilot once per Session. The GUI keeps whether the Autopilot controls
 * are expanded and the chosen Autopilot AI for the rest of the Session, as the Player last left them; loading a
 * Campaign save, Timeline navigation, creating a Campaign, and returning to the Main menu change neither. They belong
 * to the GUI alone and are never persisted, so they live in this module for as long as the page, which holds the
 * Session, and a new Session starts with them collapsed.
 *
 * CSCR, Autopilot settings: whether the controls are shown at all and the number of Turns are Global configuration
 * settings instead, kept across Sessions.
 */
import { useState } from 'react';

export interface AutopilotControls {
  readonly expanded: boolean;
  /** The chosen Autopilot AI, or null before the Player chose one. */
  readonly aiId: string | null;
}

/** The Autopilot controls of a new Session: collapsed, with no Autopilot AI chosen. */
export const NEW_SESSION_CONTROLS: AutopilotControls = { expanded: false, aiId: null };

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

/** CSCR, Autopilot settings: the effective Autopilot controls shown and Autopilot Turns, from the Global configuration report. */
export function autopilotSettings(
  settings: readonly { readonly setting: string; readonly effectiveValue: unknown }[],
): { shown: boolean; turns: number } {
  const find = (setting: string) => settings.find((item) => item.setting === setting)?.effectiveValue;
  const shown = find('autopilotControlsShown');
  const turns = find('autopilotTurns');
  return { shown: shown === true, turns: typeof turns === 'number' ? turns : 10 };
}

/** CSCR, Autopilot settings: the Autopilot Turns the Turns field holds, or null when it holds no permitted value. */
export function permittedAutopilotTurns(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const turns = Number(trimmed);
  return Number.isSafeInteger(turns) && turns >= 1 ? turns : null;
}
