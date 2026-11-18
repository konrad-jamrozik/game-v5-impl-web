/**
 * VIS, Consequences: the Consequences that applied, each in Positive or Danger by whether it is good or bad for the
 * Player, so that a costly outcome stands out among the gains; the label before them and the separators between them
 * stay in Text muted.
 */
import { Fragment } from 'react';
import type { ConsequenceRecord } from '../engine/index.ts';
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
