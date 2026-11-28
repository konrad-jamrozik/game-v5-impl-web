/**
 * VIS, Window check: whether the viewport holds the Reference window, what it lacks, whether the screen could hold it
 * at all, and the picture of the screen, the viewport, and the Reference window.
 */
import { REFERENCE_WINDOW } from './screen-limit.ts';

/** What the browser reports, in CSS pixels. */
export interface WindowMeasure {
  readonly viewport: { readonly width: number; readonly height: number };
  /** The part of the screen a window may take, without e.g. the taskbar. */
  readonly screen: { readonly width: number; readonly height: number };
  /** The whole browser window with its own frame, and where it stands on the screen; null when not reported. */
  readonly window: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface WindowAssessment {
  /** How many px the viewport lacks in each direction; 0 when it has enough. */
  readonly lackWidth: number;
  readonly lackHeight: number;
  readonly largeEnough: boolean;
  /**
   * The largest viewport the screen can give, the screen less the browser's own frame, and whether it is smaller than
   * the Reference window, so that resizing the window cannot help.
   */
  readonly largestViewport: { readonly width: number; readonly height: number };
  readonly screenTooSmall: boolean;
}

export function measureWindow(): WindowMeasure {
  const outer =
    window.outerWidth > 0 && window.outerHeight > 0
      ? { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight }
      : null;
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.availWidth, height: window.screen.availHeight },
    window: outer,
  };
}

/** The browser's own frame around the viewport, or none when the browser reports it in other units, e.g. zoomed. */
function frameOf(measure: WindowMeasure): { width: number; height: number } {
  const outer = measure.window;
  if (outer === null || outer.width < measure.viewport.width || outer.height < measure.viewport.height) {
    return { width: 0, height: 0 };
  }
  return { width: outer.width - measure.viewport.width, height: outer.height - measure.viewport.height };
}

export function assessWindow(measure: WindowMeasure): WindowAssessment {
  const lackWidth = Math.max(0, REFERENCE_WINDOW.width - measure.viewport.width);
  const lackHeight = Math.max(0, REFERENCE_WINDOW.height - measure.viewport.height);
  const frame = frameOf(measure);
  const largestViewport = {
    width: Math.max(measure.viewport.width, measure.screen.width - frame.width),
    height: Math.max(measure.viewport.height, measure.screen.height - frame.height),
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

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * VIS, Window check, Picture: the screen, the viewport placed where it stands on the screen when the browser reports
 * the window's position and centred otherwise, and the Reference window from the viewport's top left corner, in the
 * units of the screen; `bounds` holds them all.
 */
export function windowPicture(measure: WindowMeasure): {
  screen: Rect;
  viewport: Rect;
  reference: Rect;
  bounds: Rect;
} {
  const screen = { x: 0, y: 0, width: measure.screen.width, height: measure.screen.height };
  const frame = frameOf(measure);
  const outer = measure.window;
  const { width, height } = measure.viewport;
  const placed =
    outer !== null && (frame.width > 0 || frame.height > 0)
      ? {
          // The side and bottom edges of the frame are alike; what is left of it is above the viewport.
          x: outer.x + frame.width / 2,
          y: outer.y + frame.height - frame.width / 2,
        }
      : { x: (screen.width - width) / 2, y: (screen.height - height) / 2 };
  const viewport = { x: placed.x, y: placed.y, width, height };
  const reference = {
    x: placed.x,
    y: placed.y,
    width: REFERENCE_WINDOW.width,
    height: REFERENCE_WINDOW.height,
  };
  const left = Math.min(screen.x, viewport.x, reference.x);
  const top = Math.min(screen.y, viewport.y, reference.y);
  const right = Math.max(screen.x + screen.width, viewport.x + viewport.width, reference.x + reference.width);
  const bottom = Math.max(
    screen.y + screen.height,
    viewport.y + viewport.height,
    reference.y + reference.height,
  );
  return {
    screen,
    viewport,
    reference,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
  };
}
