/**
 * CSCR, Globe devastation: the devastation the globe shows is Panic as a share of the Panic limit, and never above
 * 100%. CSCR, Globe devastation controls: the controls set it by hand until "Follow Panic" is pressed, and switch its
 * effects. What they hold belongs to the Session, not to a Campaign or to Global configuration: a Session starts with
 * the globe following Panic and every effect on. While the controls are not shown, the globe follows Panic with every
 * effect on, and the controls come back holding what they held. These rules need no browser.
 */
import { useSyncExternalStore } from 'react';
import type { GlobalConfigurationReport, SessionStatus } from '../engine/index.ts';
import type { DevastationEffect } from './globe/globe.js';
import { settingValue } from './store.ts';

type Effects = Readonly<Record<DevastationEffect, boolean>>;

/** What the globe shows. */
export interface GlobeDevastation {
  /** From 0, the Earth as it is, to 100. */
  readonly percent: number;
  readonly effects: Effects;
}

/** What the controls hold. */
export interface HeldDevastation {
  /** The devastation set by hand, in whole percents from 0 to 100, or null while the globe follows Panic. */
  readonly byHand: number | null;
  readonly effects: Effects;
}

const EVERY_EFFECT: Effects = { debris: true, bloom: true, sky: true };

/** What a Session starts with. */
export const FOLLOWING_PANIC: HeldDevastation = { byHand: null, effects: EVERY_EFFECT };

let held = FOLLOWING_PANIC;
const listeners = new Set<() => void>();

function hold(next: HeldDevastation): void {
  held = next;
  for (const listener of listeners) {
    listener();
  }
}

/** What the controls hold. */
export function heldDevastation(): HeldDevastation {
  return held;
}

/** Sets the devastation by hand, kept to whole percents from 0 to 100. */
export function setDevastationByHand(percent: number): void {
  const whole = Number.isFinite(percent) ? Math.round(percent) : 0;
  hold({ ...held, byHand: Math.min(100, Math.max(0, whole)) });
}

/** "Follow Panic": the globe shows the devastation Panic gives again. */
export function followPanic(): void {
  hold({ ...held, byHand: null });
}

/** Switches one effect of devastation on or off. */
export function setDevastationEffect(effect: DevastationEffect, on: boolean): void {
  hold({ ...held, effects: { ...held.effects, [effect]: on } });
}

/** A new Session: the globe follows Panic, with every effect on. */
export function startDevastationSession(): void {
  hold(FOLLOWING_PANIC);
}

export function useHeldDevastation(): HeldDevastation {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => held,
  );
}

/**
 * The devastation Panic gives, in percent: Panic, in hundredths, as a share of the Panic limit, and never above 100,
 * e.g. Panic 52.00 against a Panic limit of 100 gives 52.
 */
export function panicDevastation(panicHundredths: number, panicLimit: number): number {
  if (!(panicLimit > 0)) {
    return 0;
  }
  return Math.min(100, Math.max(0, panicHundredths / panicLimit));
}

/** The controls are shown while the setting Globe devastation controls shown is on and Dev mode is enabled. */
export function devastationControlsShown(
  configuration: GlobalConfigurationReport,
  status: Pick<SessionStatus, 'devMode'>,
): boolean {
  return settingValue(configuration, 'globeDevastationControlsShown') === true && status.devMode;
}

/**
 * What the globe shows: the devastation Panic gives with every effect on, unless the controls are shown, which then
 * give their effects and, when one is set, their devastation by hand.
 */
export function shownDevastation(
  holding: HeldDevastation,
  controlsShown: boolean,
  fromPanic: number,
): GlobeDevastation {
  return controlsShown
    ? { percent: holding.byHand ?? fromPanic, effects: holding.effects }
    : { percent: fromPanic, effects: EVERY_EFFECT };
}
