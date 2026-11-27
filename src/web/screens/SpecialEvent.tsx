/**
 * TSUM, Special events: a Special event shown on its own, in the dialog of the Turn summary, its Event art a backdrop
 * filling the dialog above the control row, its heading and its larger text centred on it from top to bottom, the
 * Tutorials checkbox below the text, and only Continue, centred, in its control row.
 */
import { useEffect, useRef } from 'react';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { emphasized, type SpecialEventView } from '../special-events.ts';
import type { Snapshot } from '../store.ts';
import { withShortcut } from '../ui.tsx';
import { TutorialsCheckbox } from './TutorialsCheckbox.tsx';

export function SpecialEvent(props: { event: SpecialEventView; snapshot: Snapshot; onDismiss: () => void }) {
  const { event } = props;
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  return (
    <div className="scrim">
      <div
        ref={dialog}
        tabIndex={-1}
        className="dialog summary-dialog special-event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="special-event-title"
        data-testid="special-event"
        onKeyDown={(keyEvent) => {
          // TSUM, Special events: Continue, the Enter key, and the Escape key close the dialog.
          if (keyEvent.key === 'Escape' || (keyEvent.key === 'Enter' && keyEvent.target === dialog.current)) {
            keyEvent.preventDefault();
            playSound(SOUND.back);
            props.onDismiss();
          }
          // The Campaign screen's shortcuts do not reach the screen behind the dialog.
          keyEvent.stopPropagation();
        }}
      >
        <div
          className="summary-art special-event-stage"
          data-testid="summary-art"
          style={{ ['--kind' as string]: 'var(--special)' }}
        >
          <div className="summary-art-wash special-event-wash" />
          <svg
            className="special-event-glyph"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r="38" />
            <circle cx="50" cy="50" r="30" strokeWidth="1.2" />
            <path d="M50 16l8 26 26 8-26 8-8 26-8-26-26-8 26-8z" />
          </svg>
          <div className="special-event-details">
            <h2 id="special-event-title" className="special-event-heading" data-testid="special-event-title">
              {event.title}
            </h2>
            <p className="special-event-text" data-testid="special-event-text">
              {emphasized(event.text).map((part, index) =>
                part.emphasis ? (
                  <span key={index} className="special-event-emphasis">
                    {part.text}
                  </span>
                ) : (
                  part.text
                ),
              )}
            </p>
            <div className="special-event-tutorials control-backdrop">
              <TutorialsCheckbox
                snapshot={props.snapshot}
                label="Tutorial"
                testId="special-event-tutorials"
              />
            </div>
          </div>
        </div>
        <footer className="special-event-controls">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="special-event-continue"
            title={withShortcut(undefined, 'Esc')}
            data-sound="back"
            onClick={props.onDismiss}
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  );
}
