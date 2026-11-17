/** Small presentational pieces shared by the screens. */
import { useState, type ReactNode } from 'react';
import { TIER_OPACITY, type SortTier } from './table-sort.ts';
import { tallySquares } from './tally.ts';

export function Button(props: {
  children: ReactNode;
  onClick: () => void;
  /** When present, the button is disabled and shows this as the reason. */
  disabledReason?: string | null;
  /** VIS, Buttons: plain is the neutral kind; weighty marks a reversible step with a larger reach. */
  kind?: 'primary' | 'danger' | 'plain' | 'weighty';
  /** VIS, Buttons: the main action of a screen is taller and set larger. */
  main?: boolean;
  shortcut?: string;
  /** A tooltip for the enabled button, before its shortcut. */
  tooltip?: string | undefined;
  testId?: string;
  className?: string;
}) {
  const disabled = props.disabledReason !== undefined && props.disabledReason !== null;
  const enabledTitle = [
    props.tooltip,
    props.shortcut === undefined ? undefined : `Shortcut: ${props.shortcut}`,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  return (
    <button
      type="button"
      className={`btn btn-${props.kind ?? 'plain'}${props.main === true ? ' btn-main' : ''}${props.className === undefined ? '' : ` ${props.className}`}`}
      disabled={disabled}
      title={disabled ? (props.disabledReason ?? '') : enabledTitle === '' ? undefined : enabledTitle}
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

/** VIS, Tallies: one Accent square per counted item, 10 per row, up to 100 squares, and none for 0. */
export function Tally(props: { count: number; label: string; testId?: string }) {
  const squares = tallySquares(props.count);
  if (squares === 0) return null;
  return (
    <span className="tally" role="img" aria-label={props.label} data-testid={props.testId}>
      {Array.from({ length: squares }, (_, index) => (
        <span key={index} className="tally-square" />
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

/**
 * VIS, Tables: every column has a fixed width set by the table's design, and the columns sit side by side from the
 * table's left edge, so the table is exactly as wide as its columns and spare width lies after the last one.
 */
export function Cols(props: { widths: readonly string[] }) {
  return (
    <colgroup>
      {props.widths.map((width, index) => (
        <col key={index} style={{ width }} />
      ))}
    </colgroup>
  );
}

/**
 * VIS, Tables: a table with fixed column widths. Unless `scroll` is false, because the table already sits in a
 * scrolling panel, a table narrower than its columns scrolls sideways within its own frame.
 */
export function Grid(props: {
  widths: readonly string[];
  className?: string;
  testId?: string;
  scroll?: boolean;
  children: ReactNode;
}) {
  const table = (
    <table
      className={props.className === undefined ? 'grid' : `grid ${props.className}`}
      data-testid={props.testId}
    >
      <Cols widths={props.widths} />
      {props.children}
    </table>
  );
  return props.scroll === false ? table : <div className="grid-scroll">{table}</div>;
}

/**
 * VIS, Tables: the direction of a column's sort tier after its header label, ▲ for ascending or ▼ for descending, at
 * the opacity of its tier; nothing for a column in no tier.
 */
export function SortMark<K extends string>(props: { tiers: readonly SortTier<K>[]; column: K }) {
  const index = props.tiers.findIndex((tier) => tier.key === props.column);
  if (index < 0) {
    return null;
  }
  return (
    <span className="sort-mark" style={{ opacity: TIER_OPACITY[index] }} aria-hidden="true">
      {(props.tiers[index] as SortTier<K>).desc ? '▼' : '▲'}
    </span>
  );
}

/** The value of `aria-sort` for a column: only the first tier is announced as the table's sort. */
export function ariaSort<K extends string>(
  tiers: readonly SortTier<K>[],
  column: K,
): 'ascending' | 'descending' | 'none' {
  const first = tiers[0];
  return first?.key === column ? (first.desc ? 'descending' : 'ascending') : 'none';
}

/**
 * VIS, Tables: a value of free text too long for its column is cut short with "…" and shown in full while the pointer
 * rests on it. One listener serves every table: entering a cell whose text is cut short gives it its full text as a
 * title.
 */
export function installTableOverflowTitles(root: Document = document): void {
  root.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const cell = target.closest('.grid td, .grid tbody th');
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    if (cell.scrollWidth > cell.clientWidth) {
      if (!cell.hasAttribute('title')) {
        cell.setAttribute('title', (cell.textContent ?? '').trim());
        cell.dataset['overflowTitle'] = '';
      }
    } else if (cell.dataset['overflowTitle'] !== undefined) {
      cell.removeAttribute('title');
      delete cell.dataset['overflowTitle'];
    }
  });
}
