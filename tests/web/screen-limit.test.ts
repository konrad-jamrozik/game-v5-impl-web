/** VIS, Screen limit: the area every screen is drawn in while the setting is on. */
import { describe, expect, it } from 'vite-plus/test';
import { SETTINGS } from '../../src/engine/session/global-configuration.ts';
import { REFERENCE_WINDOW, screenLimitOn, screenSpan } from '../../src/web/screen-limit.ts';

describe('VIS: Screen limit', () => {
  it('is a setting that is on or off, and off by default', () => {
    const setting = SETTINGS.find((item) => item.setting === 'screenLimit');
    expect(setting?.gameBuildDefault).toBe(false);
    expect(setting?.isPermitted(true)).toBe(true);
    expect(setting?.isPermitted('1408')).toBe(false);
  });

  it('reads whether it is on from the reported settings', () => {
    const report = (effectiveValue: boolean) => [
      {
        setting: 'screenLimit',
        name: 'Screen limit',
        effectiveValue,
        gameBuildDefault: false,
        stored: effectiveValue,
        permitted: 'true or false',
      },
    ];
    expect(screenLimitOn(report(true))).toBe(true);
    expect(screenLimitOn(report(false))).toBe(false);
    expect(screenLimitOn([])).toBe(false);
  });

  it('centres an area as tall as the Reference window in a taller window', () => {
    expect(REFERENCE_WINDOW).toEqual({ width: 1408, height: 784 });
    expect(screenSpan(true, 1080)).toEqual({ top: 148, bottom: 932 });
  });

  it('takes the whole height of a window no taller than the Reference window, and of any window while off', () => {
    expect(screenSpan(true, 700)).toEqual({ top: 0, bottom: 700 });
    expect(screenSpan(false, 1080)).toEqual({ top: 0, bottom: 1080 });
  });
});
