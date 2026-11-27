/**
 * TSUM, Special events: which Special event the GUI shows, and when. A Special event of `campaign_start` is shown as
 * soon as the GUI first shows a Campaign just created, and never again for that Campaign, e.g. not after loading a
 * Campaign save of its first Turn.
 */
import type { GameDataView } from '../engine/index.ts';

export type SpecialEventView = GameDataView['specialEvents'][number];

/**
 * TSUM, Special events: the text of a Special event in parts, each phrase between double asterisks a part drawn in
 * Special, without the asterisks. An unpaired `**` stays as it is written.
 */
export function emphasized(text: string): { readonly text: string; readonly emphasis: boolean }[] {
  const parts: { text: string; emphasis: boolean }[] = [];
  let rest = text;
  for (;;) {
    const open = rest.indexOf('**');
    const close = open < 0 ? -1 : rest.indexOf('**', open + 2);
    if (close < 0) {
      break;
    }
    if (open > 0) {
      parts.push({ text: rest.slice(0, open), emphasis: false });
    }
    parts.push({ text: rest.slice(open + 2, close), emphasis: true });
    rest = rest.slice(close + 2);
  }
  if (rest !== '') {
    parts.push({ text: rest, emphasis: false });
  }
  return parts;
}

/** Set while a Campaign the Player is creating through the Main menu has not yet been shown. */
let campaignStartPending = false;

/** The Main menu calls this just before it creates a Campaign, and `failed` when the creation fails. */
export function noteCampaignCreation(): { failed: () => void } {
  campaignStartPending = true;
  return {
    failed: () => {
      campaignStartPending = false;
    },
  };
}

/**
 * The Special event of `campaign_start` when the Campaign screen is showing a Campaign just created, or null. Reading
 * it does not clear it, so that a render called twice reads the same; the Campaign screen clears it once shown.
 */
export function pendingCampaignStart(gameData: GameDataView | null): SpecialEventView | null {
  return campaignStartPending ? campaignStartEvent(gameData) : null;
}

/**
 * The Special event of `campaign_start`, or null when the Game build has none. TRVIEW, Turn summary button: it is
 * what the button replays while there is no Turn report yet.
 */
export function campaignStartEvent(gameData: GameDataView | null): SpecialEventView | null {
  return gameData?.specialEvents.find((event) => event.trigger === 'campaign_start') ?? null;
}

/** The Campaign screen calls this once it has taken the Special event of `campaign_start`, so it is not shown again. */
export function clearCampaignStart(): void {
  campaignStartPending = false;
}
