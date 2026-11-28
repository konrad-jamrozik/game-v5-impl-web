/** VIS, Window check: what the viewport lacks, whether the screen could hold the Reference window, and the picture. */
import { describe, expect, it } from 'vite-plus/test';
import {
  assessWindow,
  normalizeMeasure,
  windowPicture,
  zoomOf,
  type RawWindowMeasure,
} from '../../src/web/window-check.ts';

const raw = (
  viewport: [number, number],
  screen: [number, number, number, number],
  outer: [number, number, number, number] | null,
): RawWindowMeasure => ({
  viewport: { width: viewport[0], height: viewport[1] },
  screen: { left: screen[0], top: screen[1], width: screen[2], height: screen[3] },
  window: outer === null ? null : { x: outer[0], y: outer[1], width: outer[2], height: outer[3] },
});

const measure = (...args: Parameters<typeof raw>) => normalizeMeasure(raw(...args));

describe('VIS: the Window check', () => {
  it('is satisfied by a viewport as large as the Reference window', () => {
    const assessment = assessWindow(measure([1408, 784], [0, 0, 1920, 1040], [0, 0, 1424, 900]));
    expect(assessment.largeEnough).toBe(true);
    expect([assessment.lackWidth, assessment.lackHeight]).toEqual([0, 0]);
  });

  it('says how many px the viewport lacks in each direction', () => {
    const assessment = assessWindow(measure([1280, 700], [0, 0, 1920, 1040], [100, 50, 1296, 816]));
    expect(assessment.largeEnough).toBe(false);
    expect([assessment.lackWidth, assessment.lackHeight]).toEqual([128, 84]);
    expect(assessment.screenTooSmall).toBe(false);
  });

  it('finds a screen too small when the screen less the browser frame cannot hold the Reference window', () => {
    // A 1366 × 728 screen, with a frame of 16 px across and 116 px down.
    const assessment = assessWindow(measure([1350, 612], [0, 0, 1366, 728], [0, 0, 1366, 728]));
    expect(assessment.screenTooSmall).toBe(true);
    expect(assessment.largestViewport).toEqual({ width: 1350, height: 612 });
  });

  it('reads the zoom from a window reported unzoomed, and works in CSS pixels at that zoom', () => {
    // Chrome at 125%: the window is 1,480 × 900 unzoomed, the viewport 1,170 × 669 CSS px.
    const zoomed = raw([1170, 669], [0, 0, 2048, 1104], [200, 100, 1480, 900]);
    expect(zoomOf(zoomed)).toBe(1.25);
    const normalized = normalizeMeasure(zoomed);
    expect(normalized.screen).toEqual({ width: 1638.4, height: 883.2 });
    expect(normalized.frame.width).toBeCloseTo(14);
    expect(normalized.viewport.x).toBeCloseTo(167);
    // The screen at 125% holds 1,624 × 832 CSS px of viewport, so a larger window can hold the Reference window.
    expect(assessWindow(normalized).screenTooSmall).toBe(false);
    // Firefox reports the window in CSS pixels, so its zoom reads as 1.
    expect(zoomOf(raw([1170, 669], [0, 0, 1638, 883], [160, 80, 1184, 760]))).toBe(1);
  });

  it('places a window on a screen left of the main screen from the corner of its own screen', () => {
    // The window's screen starts 1,920 px left of the main screen's corner.
    const placed = normalizeMeasure(raw([1126, 627], [-1920, 0, 1920, 1040], [-1150, 50, 1142, 743]));
    expect(placed.viewport.x).toBe(778);
    expect(placed.viewport.y).toBe(158);
  });

  it('grows the Reference window toward the side of the screen with room, and points the arrows that way', () => {
    // Room to the right and below: the outline grows right and down from the viewport's corner.
    const roomy = windowPicture(measure([1280, 700], [0, 0, 1920, 1040], [100, 50, 1296, 816]));
    expect([roomy.across, roomy.down]).toEqual(['right', 'down']);
    expect(roomy.reference).toEqual({ x: 108, y: 158, width: 1408, height: 784 });
    // Against the right and bottom edges: the outline grows left and up from the opposite corner.
    const cornered = windowPicture(measure([1000, 600], [0, 0, 1920, 1040], [904, 324, 1016, 716]));
    expect([cornered.across, cornered.down]).toEqual(['left', 'up']);
    expect(cornered.reference.x + cornered.reference.width).toBe(912 + 1000);
    expect(cornered.reference.y + cornered.reference.height).toBe(432 + 600);
    // Centred when the browser reports no window.
    const centred = windowPicture(measure([1000, 600], [0, 0, 1920, 1040], null));
    expect(centred.viewport).toEqual({ x: 460, y: 220, width: 1000, height: 600 });
  });
});
