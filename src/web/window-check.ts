/**
 * VIS, Window check: whether the viewport holds the Reference window, what it lacks, whether the screen could hold it
 * at all, and the picture of the screen, the viewport, and the Reference window.
 */
import { REFERENCE_WINDOW } from './screen-limit.ts';

/**
 * What the browser reports. The viewport is in CSS pixels; the window and the screen are in whatever units the
 * browser uses for them, e.g. Chrome reports them unzoomed, and positions count from the corner of the main screen.
 */
export interface RawWindowMeasure {
  readonly viewport: { readonly width: number; readonly height: number };
  /** The screen the window is on: its corner and the part of it a window may take, without e.g. the taskbar. */
  readonly screen: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /** The whole browser window with its own frame; null when not reported. */
  readonly window: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the Window check works with, in CSS pixels at the browser's zoom, from the corner of the window's screen. */
export interface WindowMeasure {
  readonly viewport: Rect;
  /** Whether the viewport stands where the browser reports it, rather than centred because it reported nothing. */
  readonly placed: boolean;
  readonly screen: { readonly width: number; readonly height: number };
  /** The browser's own frame around the viewport, across and down. */
  readonly frame: { readonly width: number; readonly height: number };
}

/** The zoom levels a browser offers, so that a ratio blurred by the window's side borders snaps to the true one. */
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/**
 * How many of the units the window is reported in make one CSS pixel: the browser's zoom where the window is reported
 * unzoomed, as in Chrome, and 1 where it is reported in CSS pixels, as in Firefox. The window's side borders are thin,
 * so the window is about as wide as the viewport in its own units.
 */
export function zoomOf(raw: RawWindowMeasure): number {
  if (raw.window === null || raw.window.width <= 0 || raw.viewport.width <= 0) {
    return 1;
  }
  const ratio = raw.window.width / raw.viewport.width;
  const nearest = ZOOM_LEVELS.reduce((best, level) =>
    Math.abs(ratio / level - 1) < Math.abs(ratio / best - 1) ? level : best,
  );
  return Math.abs(ratio / nearest - 1) < 0.04 ? nearest : ratio;
}

export function normalizeMeasure(raw: RawWindowMeasure): WindowMeasure {
  const zoom = zoomOf(raw);
  const screen = { width: raw.screen.width / zoom, height: raw.screen.height / zoom };
  const { width, height } = raw.viewport;
  const outer = raw.window;
  if (outer === null) {
    return {
      viewport: { x: (screen.width - width) / 2, y: (screen.height - height) / 2, width, height },
      placed: false,
      screen,
      frame: { width: 0, height: 0 },
    };
  }
  const frame = {
    width: Math.max(0, outer.width / zoom - width),
    height: Math.max(0, outer.height / zoom - height),
  };
  return {
    viewport: {
      // The side and bottom edges of the frame are alike; what is left of it is above the viewport.
      x: (outer.x - raw.screen.left) / zoom + frame.width / 2,
      y: (outer.y - raw.screen.top) / zoom + frame.height - frame.width / 2,
      width,
      height,
    },
    placed: true,
    screen,
    frame,
  };
}

export function measureWindow(): WindowMeasure {
  // Chrome and Firefox report the corner of the window's screen; the standard does not.
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  return normalizeMeasure({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: {
      left: screen.availLeft ?? 0,
      top: screen.availTop ?? 0,
      width: screen.availWidth,
      height: screen.availHeight,
    },
    window:
      window.outerWidth > 0 && window.outerHeight > 0
        ? { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight }
        : null,
  });
}

export interface WindowAssessment {
  /** How many px the viewport lacks in each direction; 0 when it has enough. */
  readonly lackWidth: number;
  readonly lackHeight: number;
  readonly largeEnough: boolean;
  /** The largest viewport the screen can give, the screen less the browser's own frame. */
  readonly largestViewport: { readonly width: number; readonly height: number };
  /** Whether that is smaller than the Reference window, so that resizing the window cannot help. */
  readonly screenTooSmall: boolean;
}

export function assessWindow(measure: WindowMeasure): WindowAssessment {
  const lackWidth = Math.max(0, REFERENCE_WINDOW.width - measure.viewport.width);
  const lackHeight = Math.max(0, REFERENCE_WINDOW.height - measure.viewport.height);
  const largestViewport = {
    width: Math.round(Math.max(measure.viewport.width, measure.screen.width - measure.frame.width)),
    height: Math.round(Math.max(measure.viewport.height, measure.screen.height - measure.frame.height)),
  };
  return {
    lackWidth,
    lackHeight,
    largeEnough: lackWidth === 0 && lackHeight === 0,
    largestViewport,
    screenTooSmall:
      largestViewport.width < REFERENCE_WINDOW.width || largestViewport.height < REFERENCE_WINDOW.height,
  };
}

/**
 * VIS, Window check, Picture: the screen, the viewport on it, the Reference window grown from the viewport toward the
 * side of the screen with room, the direction of each arrow, and `bounds`, which holds them all.
 */
export function windowPicture(measure: WindowMeasure): {
  screen: Rect;
  viewport: Rect;
  reference: Rect;
  /** Where the arrow of each direction that lacks room points; null where nothing lacks. */
  across: 'left' | 'right' | null;
  down: 'up' | 'down' | null;
  bounds: Rect;
} {
  const screen = { x: 0, y: 0, width: measure.screen.width, height: measure.screen.height };
  const v = measure.viewport;
  const { lackWidth, lackHeight } = assessWindow(measure);
  const roomRight = screen.width - (v.x + v.width);
  const roomBelow = screen.height - (v.y + v.height);
  const across = lackWidth === 0 ? null : v.x >= lackWidth && roomRight < lackWidth ? 'left' : 'right';
  const down = lackHeight === 0 ? null : v.y >= lackHeight && roomBelow < lackHeight ? 'up' : 'down';
  const reference = {
    x: across === 'left' ? v.x + v.width - REFERENCE_WINDOW.width : v.x,
    y: down === 'up' ? v.y + v.height - REFERENCE_WINDOW.height : v.y,
    width: REFERENCE_WINDOW.width,
    height: REFERENCE_WINDOW.height,
  };
  const left = Math.min(screen.x, v.x, reference.x);
  const top = Math.min(screen.y, v.y, reference.y);
  const right = Math.max(screen.x + screen.width, v.x + v.width, reference.x + reference.width);
  const bottom = Math.max(screen.y + screen.height, v.y + v.height, reference.y + reference.height);
  return {
    screen,
    viewport: v,
    reference,
    across,
    down,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
  };
}
