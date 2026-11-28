/**
 * VIS, Window check: while the viewport is smaller than the Reference window, the Window too small dialog stands over
 * the screen, and the screen beneath is disabled; once it is large enough the dialog turns to success and waits for
 * Continue.
 */
import { useEffect, useState } from 'react';
import { groupDigits } from '../format.ts';
import { REFERENCE_WINDOW } from '../screen-limit.ts';
import { Button } from '../ui.tsx';
import {
  assessWindow,
  measureWindow,
  windowPicture,
  type Rect,
  type WindowMeasure,
} from '../window-check.ts';

/** `ok`: no dialog; `small`: the viewport is too small; `fixed`: large enough again, until Continue. */
export type WindowCheckState = 'ok' | 'small' | 'fixed';

/** VIS, Window check, When: measured when the GUI opens and whenever the window or the zoom changes. */
export function useWindowCheck(): {
  state: WindowCheckState;
  measure: WindowMeasure;
  dismiss: () => void;
} {
  const [measure, setMeasure] = useState(measureWindow);
  const [state, setState] = useState<WindowCheckState>(() =>
    assessWindow(measureWindow()).largeEnough ? 'ok' : 'small',
  );
  useEffect(() => {
    const update = (): void => {
      const next = measureWindow();
      setMeasure(next);
      const largeEnough = assessWindow(next).largeEnough;
      setState((previous) => (!largeEnough ? 'small' : previous === 'small' ? 'fixed' : previous));
    };
    // Zooming changes the viewport in CSS pixels, so it fires resize too; moving the window fires nothing, so its
    // position is read again now and then while the dialog stands.
    window.addEventListener('resize', update);
    const timer = setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      clearInterval(timer);
    };
  }, []);
  return {
    state,
    measure,
    dismiss: () => {
      setState('ok');
    },
  };
}

/** VIS, Window check, Blocking: keyboard shortcuts of the screen beneath do nothing while the dialog stands. */
export function useBlockedKeys(blocked: boolean): void {
  useEffect(() => {
    if (!blocked) {
      return undefined;
    }
    const swallow = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-window-check]') !== null) {
        return;
      }
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    window.addEventListener('keydown', swallow, true);
    window.addEventListener('keyup', swallow, true);
    // What a screen draws outside the page's root, e.g. a chart shown over the whole screen, is made inert too, and
    // so is whatever appears there while the dialog stands.
    const made = new Set<Element>();
    const inertOthers = (): void => {
      for (const child of document.body.children) {
        if (child.id !== 'root' && !child.hasAttribute('data-window-check') && !child.hasAttribute('inert')) {
          child.setAttribute('inert', '');
          made.add(child);
        }
      }
    };
    inertOthers();
    const observer = new MutationObserver(inertOthers);
    observer.observe(document.body, { childList: true });
    return () => {
      window.removeEventListener('keydown', swallow, true);
      window.removeEventListener('keyup', swallow, true);
      observer.disconnect();
      for (const element of made) {
        element.removeAttribute('inert');
      }
    };
  }, [blocked]);
}

const size = (width: number, height: number): string => `${groupDigits(width)} × ${groupDigits(height)} px`;

export function WindowCheckDialog(props: {
  state: Exclude<WindowCheckState, 'ok'>;
  measure: WindowMeasure;
  onContinue: () => void;
}) {
  const { measure } = props;
  const fixed = props.state === 'fixed';
  const assessment = assessWindow(measure);
  const needs = size(REFERENCE_WINDOW.width, REFERENCE_WINDOW.height);
  const lacks = [
    assessment.lackWidth > 0 ? `${groupDigits(assessment.lackWidth)} px wider` : null,
    assessment.lackHeight > 0 ? `${groupDigits(assessment.lackHeight)} px taller` : null,
  ].filter((part) => part !== null);
  return (
    <div className="scrim window-check-scrim" data-window-check="">
      <div
        className={fixed ? 'dialog window-check fixed' : 'dialog window-check'}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="window-check-title"
        data-testid="window-check"
        data-state={props.state}
      >
        <header className="dialog-head">
          <h2 id="window-check-title">
            {fixed ? (
              <>
                <span className="window-check-mark" aria-hidden="true">
                  ✓
                </span>{' '}
                Window large enough
              </>
            ) : (
              'Window too small'
            )}
          </h2>
        </header>
        <div className="dialog-body window-check-body">
          {fixed ? (
            <p>
              The window shows {size(measure.viewport.width, measure.viewport.height)}, enough for the game,
              which needs at least {needs}.
            </p>
          ) : (
            <>
              <p data-testid="window-check-lack">
                The window shows {size(measure.viewport.width, measure.viewport.height)}; the game needs at
                least {needs}. Make it {lacks.join(' and ')}.
              </p>
              {assessment.screenTooSmall ? (
                <p className="tone-warn" data-testid="window-check-screen">
                  This screen gives the game at most about{' '}
                  {size(assessment.largestViewport.width, assessment.largestViewport.height)}, so enlarging
                  the window cannot help. Zoom out, e.g. press Ctrl and minus, or move the window to a larger
                  screen.
                </p>
              ) : (
                <p className="muted">
                  Enlarge or maximize the window, or zoom out, e.g. press Ctrl and minus.
                </p>
              )}
            </>
          )}
          <WindowPicture measure={measure} fixed={fixed} />
          <div className="window-check-legend label">
            <span className="legend-screen">
              Screen {size(Math.round(measure.screen.width), Math.round(measure.screen.height))}
            </span>
            <span className="legend-viewport">
              Window {size(measure.viewport.width, measure.viewport.height)}
            </span>
            <span className="legend-reference">Needed {needs}</span>
          </div>
        </div>
        {fixed ? (
          <footer className="dialog-actions">
            <Button kind="primary" testId="window-check-continue" onClick={props.onContinue}>
              Continue
            </Button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/** VIS, Window check, Picture: the screen, the viewport on it, the Reference window, and the arrows. */
function WindowPicture(props: { measure: WindowMeasure; fixed: boolean }) {
  const picture = windowPicture(props.measure);
  const { bounds } = picture;
  const pad = Math.max(bounds.width, bounds.height) * 0.06;
  const box = (rect: Rect, className: string) => (
    <rect
      className={className}
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      vectorEffect="non-scaling-stroke"
    />
  );
  const v = picture.viewport;
  const arrow = Math.max(bounds.width, bounds.height) * 0.05;
  return (
    <svg
      className="window-check-picture"
      viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="The screen, the window on it, and the size the game needs"
      data-testid="window-check-picture"
    >
      {box(picture.screen, 'wc-screen')}
      {box(v, props.fixed ? 'wc-viewport fixed' : 'wc-viewport')}
      {box(picture.reference, 'wc-reference')}
      {props.fixed || picture.across === null ? null : (
        <g
          className={`wc-arrow wc-arrow-${picture.across}`}
          data-testid={`window-check-arrow-${picture.across}`}
        >
          {picture.across === 'right' ? (
            <path
              d={`M ${v.x + v.width + arrow * 0.3} ${v.y + v.height / 2 - arrow * 0.6} l ${arrow} ${arrow * 0.6} l ${-arrow} ${arrow * 0.6} z`}
            />
          ) : (
            <path
              d={`M ${v.x - arrow * 0.3} ${v.y + v.height / 2 - arrow * 0.6} l ${-arrow} ${arrow * 0.6} l ${arrow} ${arrow * 0.6} z`}
            />
          )}
        </g>
      )}
      {props.fixed || picture.down === null ? null : (
        <g className={`wc-arrow wc-arrow-${picture.down}`} data-testid={`window-check-arrow-${picture.down}`}>
          {picture.down === 'down' ? (
            <path
              d={`M ${v.x + v.width / 2 - arrow * 0.6} ${v.y + v.height + arrow * 0.3} l ${arrow * 0.6} ${arrow} l ${arrow * 0.6} ${-arrow} z`}
            />
          ) : (
            <path
              d={`M ${v.x + v.width / 2 - arrow * 0.6} ${v.y - arrow * 0.3} l ${arrow * 0.6} ${-arrow} l ${arrow * 0.6} ${arrow} z`}
            />
          )}
        </g>
      )}
    </svg>
  );
}
