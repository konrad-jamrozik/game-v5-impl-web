/**
 * CSCR, Hiding the Side panel; VIS, Charts and Artwork tuning; CRPLAY,
 * Options: every interface choice is a Global configuration setting, kept in every later Session.
 */
import { describe, expect, it } from 'vite-plus/test';
import { MemoryStorage } from '../../src/engine/index.ts';
import { SETTINGS } from '../../src/engine/session/global-configuration.ts';
import { tuningsFrom } from '../../src/web/artwork-tuning.ts';
import { checkedCharts } from '../../src/web/chart-range.ts';
import { boot, resetSetting, setSetting, settingValue, snapshot } from '../../src/web/store.ts';

const permitted = (setting: string, value: unknown) =>
  SETTINGS.find((item) => item.setting === setting)!.isPermitted(value);

describe('interface choices kept across Sessions', () => {
  it('survive a new Session that reads the same Game storage', async () => {
    const storage = new MemoryStorage();
    await boot(storage);
    await setSetting('sidePanelHidden', true);
    await setSetting('combatReplayOptionsShown', true);
    await setSetting('lastTurnsCharts', JSON.stringify(['agents']));
    await setSetting('artworkTuning', JSON.stringify({ 'artwork-1': { opacityPct: 30, image: 'a.png' } }));

    await boot(storage);
    const configuration = snapshot().configuration;
    expect(settingValue(configuration, 'sidePanelHidden')).toBe(true);
    expect(settingValue(configuration, 'combatReplayOptionsShown')).toBe(true);
    expect(checkedCharts(settingValue(configuration, 'lastTurnsCharts'))).toEqual(['agents']);
    expect(tuningsFrom(settingValue(configuration, 'artworkTuning')).get('artwork-1')).toEqual({
      opacityPct: 30,
      image: 'a.png',
    });
  });

  it('show a value at once while it is stored, and Reset returns Artwork tuning to none', async () => {
    await boot(new MemoryStorage());
    const storing = setSetting('sidePanelHidden', true);
    expect(settingValue(snapshot().configuration, 'sidePanelHidden')).toBe(true);
    await storing;
    await setSetting('artworkTuning', JSON.stringify({ x: { opacityPct: 5, image: 'b.png' } }));
    await resetSetting('artworkTuning');
    expect(tuningsFrom(settingValue(snapshot().configuration, 'artworkTuning')).size).toBe(0);
  });

  it('permit only well-formed chart lists and tuned values', () => {
    expect(permitted('lastTurnsCharts', '[]')).toBe(true);
    expect(permitted('lastTurnsCharts', '["agents","money"]')).toBe(true);
    expect(permitted('lastTurnsCharts', '[1]')).toBe(false);
    expect(permitted('lastTurnsCharts', 'agents')).toBe(false);
    expect(permitted('artworkTuning', '{}')).toBe(true);
    expect(permitted('artworkTuning', '{"a":{"opacityPct":101,"image":"x"}}')).toBe(false);
    expect(permitted('artworkTuning', '{"a":{"opacityPct":40}}')).toBe(false);
  });
});
