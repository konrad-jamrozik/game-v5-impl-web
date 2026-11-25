/**
 * CSCR, Autopilot controls and Autopilot settings: the Player sets up Autopilot once rather than in every Session or
 * Campaign. Whether the controls are shown, whether they are expanded, the chosen Autopilot AI, and the number of
 * Turns are Global configuration settings, so loading a Campaign save, Timeline navigation, creating a Campaign,
 * returning to the Main menu, and starting a new Session change none of them.
 */

/** CSCR, Autopilot settings: the effective Autopilot settings, from the Global configuration report. */
export interface AutopilotSettings {
  readonly shown: boolean;
  readonly turns: number;
  readonly expanded: boolean;
  /** The chosen Autopilot AI, or null before the Player chose one. */
  readonly aiId: string | null;
}

/** CSCR, Autopilot settings: the effective Autopilot settings, from the Global configuration report. */
export function autopilotSettings(
  settings: readonly { readonly setting: string; readonly effectiveValue: unknown }[],
): AutopilotSettings {
  const find = (setting: string) => settings.find((item) => item.setting === setting)?.effectiveValue;
  const turns = find('autopilotTurns');
  const aiId = find('autopilotAi');
  return {
    shown: find('autopilotControlsShown') === true,
    turns: typeof turns === 'number' ? turns : 10,
    expanded: find('autopilotControlsExpanded') === true,
    aiId: typeof aiId === 'string' && aiId !== '' ? aiId : null,
  };
}

/**
 * The Autopilot AI the selector shows: the chosen one when `listAutopilotAis()` reports it, and otherwise the first one
 * it reports, or '' when it reports none.
 */
export function shownAutopilotAi(chosenAi: string | null, listed: readonly string[]): string {
  return chosenAi !== null && listed.includes(chosenAi) ? chosenAi : (listed[0] ?? '');
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
