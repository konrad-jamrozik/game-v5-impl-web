/**
 * MENU, New Campaign: the Campaign name the GUI supplies, "Campaign" followed by the day of creation in the time zone
 * of the Player's device and the Campaign's number on that day, e.g. "Campaign 2026-11-27 #2".
 */

/** The day of a time in the time zone of the device, e.g. "2026-11-27". */
export function localDay(time: Date): string {
  const month = String(time.getMonth() + 1).padStart(2, '0');
  const day = String(time.getDate()).padStart(2, '0');
  return `${String(time.getFullYear())}-${month}-${day}`;
}

/**
 * The name of a Campaign created at `time`: the date alone for the first Campaign of the day, and otherwise the date
 * and a number one more than the highest number among the listed Campaigns named for that day, where a name without a
 * number counts as 1.
 */
export function newCampaignName(listedNames: Iterable<string>, time: Date): string {
  const day = `Campaign ${localDay(time)}`;
  const prefix = `${day} #`;
  let highest = 0;
  for (const name of listedNames) {
    if (name === day) {
      highest = Math.max(highest, 1);
    } else if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      if (/^\d+$/.test(rest)) {
        highest = Math.max(highest, Number(rest));
      }
    }
  }
  return highest === 0 ? day : `${prefix}${String(highest + 1)}`;
}
