/**
 * CSCR, Globe devastation controls: what the controls hold, and when they are shown. What they hold belongs to the
 * Session, not to a Campaign or to Global configuration: a Session starts with devastation at 0% and every effect on.
 * While the controls are not shown, the globe shows the Earth as it is, and the controls come back holding what they
 * held. These rules need no browser.
 */
import { useSyncExternalStore } from 'react';
import type { GlobalConfigurationReport, SessionStatus } from '../engine/index.ts';
import type { DevastationEffect } from './globe/globe.js';
import { settingValue } from './store.ts';

export interface GlobeDevastation {
  /** From 0, the Earth as it is, to 100. */
  readonly percent: number;
  readonly effects: Readonly<Record<DevastationEffect, boolean>>;
}

/** What a Session starts with, which is also the Earth as it is. */
export const NO_DEVASTATION: GlobeDevastation = {
  percent: 0,
  effects: { debris: true, bloom: true, sky: true },
};

let held = NO_DEVASTATION;
const listeners = new Set<() => void>();

function hold(next: GlobeDevastation): void {
  held = next;
  for (const listener of listeners) {
    listener();
  }
}

/** What the controls hold. */
export function heldDevastation(): GlobeDevastation {
  return held;
}

/** Sets the devastation, kept to whole percents from 0 to 100. */
export function setDevastationPercent(percent: number): void {
  const whole = Number.isFinite(percent) ? Math.round(percent) : 0;
  hold({ ...held, percent: Math.min(100, Math.max(0, whole)) });
}

/** Switches one effect of devastation on or off. */
export function setDevastationEffect(effect: DevastationEffect, on: boolean): void {
  hold({ ...held, effects: { ...held.effects, [effect]: on } });
}

/** A new Session: devastation at 0% and every effect on. */
export function startDevastationSession(): void {
  hold(NO_DEVASTATION);
}

export function useHeldDevastation(): GlobeDevastation {
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

/** The controls are shown while the setting Globe devastation controls shown is on and Dev mode is enabled. */
export function devastationControlsShown(
  configuration: GlobalConfigurationReport,
  status: Pick<SessionStatus, 'devMode'>,
): boolean {
  return settingValue(configuration, 'globeDevastationControlsShown') === true && status.devMode;
}

/** What the globe shows: what the controls hold while they are shown, and otherwise the Earth as it is. */
export function shownDevastation(holding: GlobeDevastation, controlsShown: boolean): GlobeDevastation {
  return controlsShown ? holding : NO_DEVASTATION;
}
