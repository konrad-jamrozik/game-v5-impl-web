/**
 * VIS, Screen limit: while the Global configuration setting Screen limit is on, every screen is drawn in an area as
 * wide and as tall as the Reference window, centred in the window; in a direction in which the window is smaller, the
 * area is as large as the window. The style sheet lays the area out from the `screen-limited` class of the page; this
 * module sets that class and tells scripts where the area is.
 */
import type { SettingReport } from '../engine/index.ts';

/** VIS, Reference window: the window size every screen is designed for. */
export const REFERENCE_WINDOW = { width: 1408, height: 784 } as const;

const LIMITED = 'screen-limited';

/** Whether the Screen limit is on, by the settings `session.globalConfiguration.get()` reports. */
export function screenLimitOn(settings: readonly SettingReport[]): boolean {
  return settings.find((setting) => setting.setting === 'screenLimit')?.effectiveValue === true;
}

/** Draws every screen in the limited area, or in the whole window again. */
export function applyScreenLimit(on: boolean, page: Document = document): void {
  page.documentElement.classList.toggle(LIMITED, on);
}

/**
 * Where the area that a screen is drawn in starts and ends from the top of a window of the given height: the whole
 * height while the Screen limit is off, and otherwise the Reference window's height, centred.
 */
export function screenSpan(limited: boolean, windowHeight: number): { top: number; bottom: number } {
  const height = limited ? Math.min(windowHeight, REFERENCE_WINDOW.height) : windowHeight;
  const top = (windowHeight - height) / 2;
  return { top, bottom: top + height };
}

/** The top and bottom of the area the current screen is drawn in, in the window's coordinates. */
export function currentScreenSpan(): { top: number; bottom: number } {
  return screenSpan(document.documentElement.classList.contains(LIMITED), window.innerHeight);
}
