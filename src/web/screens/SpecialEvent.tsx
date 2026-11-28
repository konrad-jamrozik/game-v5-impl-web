/**
 * TSUM, Special events: a Special event shown on its own, in the dialog of the Turn summary, its Event art a backdrop
 * filling the dialog above the control row, its heading and its larger text centred on it from top to bottom, the
 * Tutorials checkbox below the text, and only Continue, centred, in its control row.
 *
 * TUTOR, Tutorial intro: the Special event of `tutorial_intro` is drawn as that of `campaign_start` is, but in Tutorial
 * gold, with a 2 px line of it along the dialog's top edge, its eyebrow, title, and text aligned to the left at the top
 * of the Event art, its points below in two columns, a live Tutorial bubble after the heading of its `bubble` point,
 * and no Tutorials checkbox.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { emphasized, type SpecialEventView } from '../special-events.ts';
import type { Snapshot } from '../store.ts';
import { withShortcut } from '../ui.tsx';
import { TutorialBubble } from './TutorialBubble.tsx';
import { TutorialsCheckbox } from './TutorialsCheckbox.tsx';

type PointIcon = SpecialEventView['points'][number]['icon'];

/** TUTOR, Tutorial intro, Points: the line drawing of each icon a point may name, in a 34 × 34 box. */
const POINT_ICONS: Record<PointIcon, ReactNode> = {
  agents: (
    <>
      <circle cx="13" cy="11" r="5" />
      <path d="M4 28c0-6 4-9 9-9s9 3 9 9" />
      <circle cx="25" cy="13" r="3.5" />
      <path d="M24 20c4 0 7 2.5 7 7" />
    </>
  ),
  support: (
    <>
      <path d="M17 4l11 4v8c0 7-5 12-11 14C11 28 6 23 6 16V8z" />
      <path d="M12 17l4 4 7-8" />
    </>
  ),
  objective: (
    <>
      <circle cx="17" cy="17" r="12" />
      <circle cx="17" cy="17" r="5" />
      <path d="M17 1v8M17 25v8M1 17h8M25 17h8" />
    </>
  ),
  bubble: (
    <>
      <circle cx="17" cy="17" r="12" />
      <path d="M13 13a4 4 0 1 1 5 4c-1 .4-1 1.2-1 2.5" />
      <circle cx="17" cy="24" r=".8" />
    </>
  ),
  records: (
    <>
      <rect x="7" y="4" width="20" height="26" />
      <path d="M11 11h12M11 16h12M11 21h8" />
    </>
  ),
  compendium: (
    <>
      <path d="M5 7c4-2 8-2 12 1v21c-4-3-8-3-12-1z" />
      <path d="M29 7c-4-2-8-2-12 1v21c4-3 8-3 12-1z" />
    </>
  ),
};

function EventText(props: { text: string; className: string; testId: string }) {
  return (
    <p className={props.className} data-testid={props.testId}>
      {emphasized(props.text).map((part, index) =>
        part.emphasis ? (
          <span key={index} className="special-event-emphasis">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

export function SpecialEvent(props: { event: SpecialEventView; snapshot: Snapshot; onDismiss: () => void }) {
  const { event } = props;
  const tutorial = event.trigger === 'tutorial_intro';
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, [event.id]);
  return (
    <div className="scrim">
      <div
        ref={dialog}
        tabIndex={-1}
        className={`dialog summary-dialog special-event-dialog${tutorial ? ' tutorial-intro-dialog' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="special-event-title"
        data-testid="special-event"
        data-trigger={event.trigger}
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
          style={{ ['--kind' as string]: tutorial ? 'var(--tutorial)' : 'var(--special)' }}
        >
          <div className="summary-art-wash special-event-wash" />
          {tutorial ? (
            // TUTOR, Tutorial intro, Colour: its glyph is a "?" in a circle.
            <svg
              className="special-event-glyph tutorial-intro-glyph"
              viewBox="0 0 100 100"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="44" strokeWidth="3" />
              <path
                d="M38 38a12 12 0 1 1 15 11.5c-2 .8-3 2.6-3 5.5v4"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <circle cx="50" cy="72" r="2.5" strokeWidth="4" />
            </svg>
          ) : (
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
          )}
          {tutorial ? (
            <div className="special-event-details tutorial-intro-details">
              <div className="tutorial-eyebrow tutorial-intro-eyebrow">Tutorial</div>
              <h2
                id="special-event-title"
                className="tutorial-intro-heading"
                data-testid="special-event-title"
              >
                {event.title}
              </h2>
              <EventText text={event.text} className="tutorial-intro-text" testId="special-event-text" />
              {/* TUTOR, Tutorial intro, Points: in two columns, read along each row. */}
              <ul className="tutorial-intro-points" data-testid="tutorial-intro-points">
                {event.points.map((point) => (
                  <li key={point.heading} className="tutorial-intro-point" data-icon={point.icon}>
                    <svg className="tutorial-intro-icon" viewBox="0 0 34 34" aria-hidden="true">
                      {POINT_ICONS[point.icon]}
                    </svg>
                    <div>
                      <div className="tutorial-intro-point-heading">
                        {point.heading}
                        {/* TUTOR, Tutorial intro, Bubble point: a live Tutorial bubble right after its heading. */}
                        {point.icon === 'bubble' ? (
                          <TutorialBubble anchor="tutorial_intro.bubble" inline />
                        ) : null}
                      </div>
                      <p className="tutorial-intro-point-text">{point.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="special-event-details">
              <h2
                id="special-event-title"
                className="special-event-heading"
                data-testid="special-event-title"
              >
                {event.title}
              </h2>
              <EventText text={event.text} className="special-event-text" testId="special-event-text" />
              <div className="special-event-tutorials control-backdrop">
                <TutorialsCheckbox
                  snapshot={props.snapshot}
                  label="Tutorial"
                  testId="special-event-tutorials"
                />
              </div>
            </div>
          )}
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
