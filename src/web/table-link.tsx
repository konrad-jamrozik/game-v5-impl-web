/**
 * GUI, Links in tables: a name in a table cell that opens the Agent details, the Leads View, or the Missions View with
 * the item it names, as a Follow. It keeps the cell's style, and the pointer resting on it, or keyboard focus,
 * underlines it.
 */
import type { ReactNode } from 'react';
import type { ReportTarget } from './screens/TurnReportView.tsx';

export function TableLink(props: {
  target: ReportTarget;
  onShow: (target: ReportTarget) => void;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={props.className === undefined ? 'history-link' : `history-link ${props.className}`}
      data-testid={props.testId}
      data-sound="main"
      onClick={(event) => {
        event.stopPropagation();
        props.onShow(props.target);
      }}
    >
      {props.children}
    </button>
  );
}
