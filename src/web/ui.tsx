/** Small presentational pieces shared by the screens. */
import { useState, type ReactNode } from 'react';

export function Button(props: {
  children: ReactNode;
  onClick: () => void;
  /** When present, the button is disabled and shows this as the reason. */
  disabledReason?: string | null;
  kind?: 'primary' | 'danger' | 'plain';
  /** VIS, Buttons: the main action of a screen is taller and set larger. */
  main?: boolean;
  shortcut?: string;
  testId?: string;
}) {
  const disabled = props.disabledReason !== undefined && props.disabledReason !== null;
  return (
    <button
      type="button"
      className={`btn btn-${props.kind ?? 'plain'}${props.main === true ? ' btn-main' : ''}`}
      disabled={disabled}
      title={
        disabled
          ? (props.disabledReason ?? '')
          : props.shortcut === undefined
            ? undefined
            : `Shortcut: ${props.shortcut}`
      }
      onClick={props.onClick}
      data-testid={props.testId}
    >
      {props.children}
      {props.shortcut === undefined ? null : <kbd>{props.shortcut}</kbd>}
    </button>
  );
}

/**
 * VIS, Meters: `value` against its limit `max` as 10 equal segments. Each full tenth fills a segment, a remaining
 * part of a tenth fills the next one dimmed, and the rest stay empty.
 */
export function Meter(props: { value: number; max: number; label?: string }) {
  const tenths = props.max <= 0 ? 0 : Math.max(0, Math.min(10, (props.value * 10) / props.max));
  const full = Math.floor(tenths);
  return (
    <span className="meter" role="img" aria-label={props.label ?? `${props.value} of ${props.max}`}>
      {Array.from({ length: 10 }, (_, index) => (
        <span
          key={index}
          className={`meter-segment${index < full ? ' full' : index === full && tenths > full ? ' part' : ''}`}
        />
      ))}
    </span>
  );
}

/**
 * A number field that hands its text over when the player leaves it or presses Enter, not on every keystroke, so
 * that a half-typed number is never sent to the engine. An empty field hands over an empty text.
 */
export function NumberField(props: {
  label: string;
  /** The value the engine holds, or an empty text for none. */
  stored: string;
  placeholder?: string;
  testId?: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<{ from: string; text: string }>({
    from: props.stored,
    text: props.stored,
  });
  // A change of the stored value replaces what was typed.
  const text = draft.from === props.stored ? draft.text : props.stored;
  const commit = () => {
    if (text.trim() !== props.stored) {
      props.onCommit(text.trim());
    }
  };
  return (
    <input
      type="number"
      aria-label={props.label}
      data-testid={props.testId}
      placeholder={props.placeholder}
      value={text}
      onChange={(event) => {
        setDraft({ from: props.stored, text: event.target.value });
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        }
      }}
    />
  );
}

export function Badge(props: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'muted' | 'accent' }) {
  return <span className={`badge tone-${props.tone ?? 'muted'}`}>{props.children}</span>;
}

export function Fact(props: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="fact">
      <span className="fact-label">{props.label}</span>
      <span className="fact-value" data-testid={props.testId}>
        {props.children}
      </span>
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <section className="section" data-testid={props.testId}>
      <header className="section-head">
        <h3>{props.title}</h3>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

/** A Probability given as a pair of whole numbers, shown as a percentage for reading. */
export function percent(pair: { n: number | string; d: number | string }): string {
  const d = Number(pair.d);
  return d === 0 ? '-' : `${Math.round((Number(pair.n) / d) * 100)}%`;
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Whether a keyboard event comes from a control that takes typed text. */
export function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

/** VIS, Tables: each column's width is fixed by the table's design; a column given no width shares what is left. */
export function Cols(props: { widths: readonly (string | undefined)[] }) {
  return (
    <colgroup>
      {props.widths.map((width, index) => (
        <col key={index} style={width === undefined ? undefined : { width }} />
      ))}
    </colgroup>
  );
}
