/** VIS, Window check: what the viewport lacks, whether the screen could hold the Reference window, and the picture. */
import { describe, expect, it } from 'vite-plus/test';
import { assessWindow, windowPicture, type WindowMeasure } from '../../src/web/window-check.ts';

const measure = (
  viewport: [number, number],
  screen: [number, number],
  outer: [number, number, number, number] | null,
): WindowMeasure => ({
  viewport: { width: viewport[0], height: viewport[1] },
  screen: { width: screen[0], height: screen[1] },
  window: outer === null ? null : { x: outer[0], y: outer[1], width: outer[2], height: outer[3] },
});

describe('VIS: the Window check', () => {
  it('is satisfied by a viewport as large as the Reference window', () => {
    const assessment = assessWindow(measure([1408, 784], [1920, 1040], [0, 0, 1424, 900]));
    expect(assessment.largeEnough).toBe(true);
    expect([assessment.lackWidth, assessment.lackHeight]).toEqual([0, 0]);
  });

  it('says how many px the viewport lacks in each direction', () => {
    const assessment = assessWindow(measure([1280, 700], [1920, 1040], [100, 50, 1296, 816]));
    expect(assessment.largeEnough).toBe(false);
    expect([assessment.lackWidth, assessment.lackHeight]).toEqual([128, 84]);
    expect(assessment.screenTooSmall).toBe(false);
  });

  it('finds a screen too small when the screen less the browser frame cannot hold the Reference window', () => {
    // A 1366 × 728 screen, with a frame of 16 px across and 116 px down.
    const assessment = assessWindow(measure([1350, 612], [1366, 728], [0, 0, 1366, 728]));
    expect(assessment.screenTooSmall).toBe(true);
    expect(assessment.largestViewport).toEqual({ width: 1350, height: 612 });
  });

  it('ignores a frame reported in other units, e.g. while zoomed out', () => {
    const assessment = assessWindow(measure([2000, 1100], [1920, 1040], [0, 0, 1600, 900]));
    expect(assessment.largeEnough).toBe(true);
    expect(assessment.screenTooSmall).toBe(false);
  });

  it('places the viewport where the window stands on the screen, and centres it when that is unknown', () => {
    // A frame of 16 px across, 8 px each side, and 116 px down: 108 px of it above the viewport.
    const placed = windowPicture(measure([1280, 700], [1920, 1040], [100, 50, 1296, 816]));
    expect(placed.viewport).toEqual({ x: 108, y: 158, width: 1280, height: 700 });
    expect(placed.reference).toEqual({ x: 108, y: 158, width: 1408, height: 784 });
    const centred = windowPicture(measure([1000, 600], [1920, 1040], null));
    expect(centred.viewport).toEqual({ x: 460, y: 220, width: 1000, height: 600 });
    expect(centred.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
  });
});
