/**
 * VIS, Consequences: the Consequences that applied, each in Positive or Danger by whether it is good or bad for the
 * Player, so that a costly outcome stands out among the gains; the label before them and the separators between them
 * stay in Text muted.
 */
import { Fragment } from 'react';
import type { ConsequenceRecord } from '../engine/index.ts';
import type { GainLine } from './mission-gains.ts';
import { consequenceParts } from './format.ts';

export function Consequences(props: { consequence: ConsequenceRecord; label?: string; className?: string }) {
  const parts = consequenceParts(props.consequence);
  return (
    <span className={`muted${props.className === undefined ? '' : ` ${props.className}`}`}>
      {props.label === undefined ? null : `${props.label}: `}
      {parts.length === 0
        ? 'no consequence'
        : parts.map((part, index) => (
            <Fragment key={part.text}>
              {index === 0 ? null : ', '}
              <span className={part.tone === 'good' ? 'tone-good' : 'tone-bad'}>{part.text}</span>
            </Fragment>
          ))}
    </span>
  );
}

export function toneClass(line: GainLine): string {
  return line.tone === 'good' ? 'tone-good' : 'tone-bad';
}

/**
 * VIS, Consequences: a line of the Turn summary or the Turn Report View; a joined line shows each Consequence in its
 * own tone and the separators between them in Text muted, which the caller's `muted` class gives. The parts share one
 * span, so that a flex column parent, e.g. `.dialog-row`, keeps them on one line instead of stacking each separator.
 */
export function GainLineText(props: { line: GainLine }) {
  const { parts } = props.line;
  return parts === undefined ? (
    props.line.text
  ) : (
    <span>
      {parts.map((part, index) => (
        <Fragment key={part.text}>
          {index === 0 ? null : ', '}
          <span className={toneClass(part)}>{part.text}</span>
        </Fragment>
      ))}
    </span>
  );
}
