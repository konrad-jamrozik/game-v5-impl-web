/**
 * CSCR, Globe devastation: the globe shows Panic as a share of the Panic limit. CSCR, Globe devastation controls: they
 * set the devastation by hand until "Follow Panic", what they hold belongs to the Session, and they are shown only
 * while their setting is on and Dev mode is enabled.
 */
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { MemoryStorage } from '../../src/engine/index.ts';
import { DEVASTATION_EFFECTS } from '../../src/web/globe/globe.js';
import {
  FOLLOWING_PANIC,
  devastationControlsShown,
  followPanic,
  heldDevastation,
  panicDevastation,
  setDevastationByHand,
  setDevastationEffect,
  shownDevastation,
  startDevastationSession,
} from '../../src/web/globe-devastation.ts';
import { boot, setSetting, snapshot } from '../../src/web/store.ts';

const EVERY_EFFECT = { debris: true, bloom: true, sky: true };

describe('Globe devastation', () => {
  it('is Panic as a share of the Panic limit', () => {
    // Panic 52.00 against a Panic limit of 100%.
    expect(panicDevastation(5200, 100)).toBe(52);
    expect(panicDevastation(0, 100)).toBe(0);
    expect(panicDevastation(10000, 100)).toBe(100);
    expect(panicDevastation(2500, 50)).toBe(50);
    expect(panicDevastation(1234, 100)).toBeCloseTo(12.34);
  });

  it('is never above 100% or below 0%', () => {
    expect(panicDevastation(12000, 100)).toBe(100);
    expect(panicDevastation(-500, 100)).toBe(0);
    expect(panicDevastation(5000, 0)).toBe(0);
  });

  it('follows Panic with every effect on while the controls are not shown', () => {
    expect(shownDevastation(FOLLOWING_PANIC, false, 52)).toEqual({ percent: 52, effects: EVERY_EFFECT });
  });
});

describe('Globe devastation controls', () => {
  beforeEach(() => {
    startDevastationSession();
  });

  it('start a Session with the globe following Panic and every effect on', () => {
    expect(heldDevastation()).toEqual({ byHand: null, effects: EVERY_EFFECT });
    expect(shownDevastation(heldDevastation(), true, 37)).toEqual({ percent: 37, effects: EVERY_EFFECT });
  });

  it('offer the three effects Ash in orbit, Bloom, and Dim sun', () => {
    expect(DEVASTATION_EFFECTS.map((effect) => effect.label)).toEqual(['Ash in orbit', 'Bloom', 'Dim sun']);
    expect(DEVASTATION_EFFECTS.map((effect) => effect.name).sort()).toEqual(Object.keys(EVERY_EFFECT).sort());
  });

  it('set the devastation by hand in whole percents from 0 to 100', () => {
    setDevastationByHand(62.4);
    expect(heldDevastation().byHand).toBe(62);
    setDevastationByHand(250);
    expect(heldDevastation().byHand).toBe(100);
    setDevastationByHand(-3);
    expect(heldDevastation().byHand).toBe(0);
    setDevastationByHand(Number.NaN);
    expect(heldDevastation().byHand).toBe(0);
  });

  it('show the devastation set by hand in place of the one Panic gives, until Follow Panic', () => {
    setDevastationByHand(80);
    expect(shownDevastation(heldDevastation(), true, 52).percent).toBe(80);
    followPanic();
    expect(heldDevastation().byHand).toBeNull();
    expect(shownDevastation(heldDevastation(), true, 52).percent).toBe(52);
  });

  it('switch one effect without changing the others or the devastation', () => {
    setDevastationByHand(40);
    setDevastationEffect('bloom', false);
    expect(heldDevastation()).toEqual({ byHand: 40, effects: { debris: true, bloom: false, sky: true } });
    setDevastationEffect('bloom', true);
    expect(heldDevastation().effects.bloom).toBe(true);
  });

  it('leave the globe following Panic with every effect on while they are not shown, and come back as they were', () => {
    setDevastationByHand(80);
    setDevastationEffect('sky', false);
    expect(shownDevastation(heldDevastation(), false, 52)).toEqual({ percent: 52, effects: EVERY_EFFECT });
    expect(shownDevastation(heldDevastation(), true, 52)).toEqual({
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
