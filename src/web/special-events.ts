/**
 * TSUM, Special events: which Special event the GUI shows, and when. A Special event of `campaign_start` is shown as
 * soon as the GUI first shows a Campaign just created, and never again for that Campaign, e.g. not after loading a
 * Campaign save of its first Turn.
 */
import type { GameDataView } from '../engine/index.ts';

export type SpecialEventView = GameDataView['specialEvents'][number];

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
  if (!campaignStartPending || gameData === null) {
    return null;
  }
  return gameData.specialEvents.find((event) => event.trigger === 'campaign_start') ?? null;
}

/** The Campaign screen calls this once it has taken the Special event of `campaign_start`, so it is not shown again. */
export function clearCampaignStart(): void {
  campaignStartPending = false;
}
