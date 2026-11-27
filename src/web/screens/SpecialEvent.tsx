/**
 * TSUM, Special events: a Special event shown on its own, in the dialog of the Turn summary and with its layout, but
 * with neither the Turn line nor a tag nor a meta line over its Event art, its text centred, and only Continue,
 * centred, in its control row.
 */
import { useEffect, useRef } from 'react';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import type { SpecialEventView } from '../special-events.ts';
import { withShortcut } from '../ui.tsx';

export function SpecialEvent(props: { event: SpecialEventView; onDismiss: () => void }) {
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
        className="dialog summary-dialog"
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
          className="summary-art"
          data-testid="summary-art"
          style={{ ['--kind' as string]: 'var(--special)' }}
        >
          <div className="summary-art-wash" />
          <svg
            className="summary-art-glyph"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r="38" />
            <circle cx="50" cy="50" r="30" strokeWidth="1.2" />
            <path d="M50 16l8 26 26 8-26 8-8 26-8-26-26-8 26-8z" />
          </svg>
          <div className="summary-art-shade" />
          <div className="summary-caption">
            <div className="summary-eyebrow" data-testid="summary-kind">
              <span className="summary-pip" />
              <span>Special event</span>
            </div>
            <h2 id="special-event-title" className="summary-title" data-testid="special-event-title">
              {event.title}
            </h2>
          </div>
        </div>
        <div className="summary-details special-event-details">
          <p className="special-event-text" data-testid="special-event-text">
            {event.text}
          </p>
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
