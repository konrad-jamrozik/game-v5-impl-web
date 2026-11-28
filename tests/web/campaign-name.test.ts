/** MENU, New Campaign: the Campaign name the GUI supplies. */
import { describe, expect, it } from 'vite-plus/test';
import { localDay, newCampaignName } from '../../src/web/campaign-name.ts';

// A time built from local parts is on that day in the time zone of the device, whatever the zone.
const evening = new Date(2026, 10, 27, 23, 30);

describe('MENU: the Campaign name', () => {
  it('names the day in the time zone of the device', () => {
    expect(localDay(evening)).toBe('2026-11-27');
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('numbers the first Campaign of a day 1', () => {
    expect(newCampaignName([], evening)).toBe('Campaign 2026-11-27 #1');
    expect(newCampaignName(['Campaign 2026-11-26 #4', ''], evening)).toBe('Campaign 2026-11-27 #1');
  });

  it('numbers a Campaign one more than the highest listed number of that day', () => {
    expect(
      newCampaignName(
        ['Campaign 2026-11-27 #1', 'Campaign 2026-11-27 #3', 'Campaign 2026-11-26 #9'],
        evening,
      ),
    ).toBe('Campaign 2026-11-27 #4');
    expect(newCampaignName(['Campaign 2026-11-27 #2x'], evening)).toBe('Campaign 2026-11-27 #1');
  });
});
