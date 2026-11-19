/** MENU, Layout: a Main menu reached by leaving a Campaign from the Campaign screen offers to close back to it. */
import { describe, expect, it } from 'vite-plus/test';
import { MemoryStorage } from '../../src/engine/index.ts';
import { boot, leaveCampaign, snapshot, theEngine } from '../../src/web/store.ts';

describe('MENU: leaving a Campaign for the Main menu', () => {
  it('remembers the Campaign left, so the Main menu shows its close button', async () => {
    await boot(new MemoryStorage());
    const created = await theEngine().session.campaign.create({});
    expect(created.ok).toBe(true);
    const status = theEngine().session.getStatus();
    const campaignId = status.ok ? status.value.campaignId : null;
    expect(campaignId).not.toBeNull();

    await leaveCampaign();

    const after = snapshot();
    expect(after.status.hasCurrentCampaign).toBe(false);
    expect(after.leftCampaign).toBe(campaignId);
  });
});
