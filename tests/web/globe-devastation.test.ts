/**
 * CSCR, Globe devastation controls: what the controls hold belongs to the Session, they are shown only while their
 * setting is on and Dev mode is enabled, and while they are not shown the globe shows the Earth as it is.
 */
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { MemoryStorage } from '../../src/engine/index.ts';
import { DEVASTATION_EFFECTS } from '../../src/web/globe/globe.js';
import {
  NO_DEVASTATION,
  devastationControlsShown,
  heldDevastation,
  setDevastationEffect,
  setDevastationPercent,
  shownDevastation,
  startDevastationSession,
} from '../../src/web/globe-devastation.ts';
import { boot, setSetting, snapshot } from '../../src/web/store.ts';

describe('Globe devastation controls', () => {
  beforeEach(() => {
    startDevastationSession();
  });

  it('start a Session with devastation at 0% and every effect on', () => {
    expect(heldDevastation()).toEqual({ percent: 0, effects: { debris: true, bloom: true, sky: true } });
  });

  it('offer the three effects Ash in orbit, Bloom, and Dim sun', () => {
    expect(DEVASTATION_EFFECTS.map((effect) => effect.label)).toEqual(['Ash in orbit', 'Bloom', 'Dim sun']);
    expect(DEVASTATION_EFFECTS.map((effect) => effect.name).sort()).toEqual(
      Object.keys(NO_DEVASTATION.effects).sort(),
    );
  });

  it('hold whole percents from 0 to 100', () => {
    setDevastationPercent(62.4);
    expect(heldDevastation().percent).toBe(62);
    setDevastationPercent(250);
    expect(heldDevastation().percent).toBe(100);
    setDevastationPercent(-3);
    expect(heldDevastation().percent).toBe(0);
    setDevastationPercent(Number.NaN);
    expect(heldDevastation().percent).toBe(0);
  });

  it('switch one effect without changing the others or the devastation', () => {
    setDevastationPercent(40);
    setDevastationEffect('bloom', false);
    expect(heldDevastation()).toEqual({ percent: 40, effects: { debris: true, bloom: false, sky: true } });
    setDevastationEffect('bloom', true);
    expect(heldDevastation().effects.bloom).toBe(true);
  });

  it('show the Earth as it is while the controls are not shown, and what they hold once they are back', () => {
    setDevastationPercent(80);
    setDevastationEffect('sky', false);
    expect(shownDevastation(heldDevastation(), false)).toEqual(NO_DEVASTATION);
    expect(shownDevastation(heldDevastation(), true)).toEqual({
      percent: 80,
      effects: { debris: true, bloom: true, sky: false },
    });
  });

  it('are shown only while their setting is on and Dev mode is enabled', async () => {
    await boot(new MemoryStorage());
    const configuration = () => snapshot().configuration;
    expect(devastationControlsShown(configuration(), { devMode: true })).toBe(false);
    await setSetting('globeDevastationControlsShown', true);
    expect(devastationControlsShown(configuration(), { devMode: true })).toBe(true);
    expect(devastationControlsShown(configuration(), { devMode: false })).toBe(false);
  });

  it('keep whether they are shown in a later Session', async () => {
    const storage = new MemoryStorage();
    await boot(storage);
    await setSetting('globeDevastationControlsShown', true);
    await boot(storage);
    expect(devastationControlsShown(snapshot().configuration, { devMode: true })).toBe(true);
  });
});
