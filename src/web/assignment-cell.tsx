/** AVIEW, Agent table: the Assignment cell, shared by the Agents View, its Agent details, and the Armory View. */
import type { AgentView, CurrentLiveWorldStateView, CurrentRetiredWorldStateView } from '../engine/index.ts';
import { assignmentParts, assignmentTone, IN_TRANSIT_NAME, type AssignmentTarget } from './assignment.ts';

/**
 * VIS, Icons: the In transit icon, a flying airplane in the colour of the text it follows; the pointer resting on it
 * shows its name.
 */
export function InTransitIcon() {
  return (
    <span className="in-transit-icon" title={IN_TRANSIT_NAME} data-testid="in-transit-icon">
      <svg width="13" height="13" viewBox="0 0 24 24" role="img" aria-label={IN_TRANSIT_NAME}>
        <path
          d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
          fill="currentColor"
          transform="rotate(45 12 12)"
        />
      </svg>
    </span>
  );
}

/**
 * AVIEW, Agent table: the Assignment cell, in its colour: "Investigating" or "Deployed" opens the Lead or Mission site
 * it is on, as a Follow, and the pointer resting on it shows that item's `name`; an Agent In transit is marked by the In
 * transit icon, never by words.
 */
export function AssignmentCell(props: {
  agent: AgentView;
  state: CurrentLiveWorldStateView;
  retired?: CurrentRetiredWorldStateView | null;
  onShow: (target: AssignmentTarget) => void;
  testId?: string;
}) {
  const parts = assignmentParts(props.agent, props.state, props.retired);
  const target = parts.target;
  return (
    <span className={`assignment-cell ${assignmentTone(props.agent)}`} data-testid={props.testId}>
      {target === null ? (
        parts.text
      ) : (
        <button
          type="button"
          className="assignment-link"
          title={parts.targetName ?? undefined}
          data-testid={`assignment-link-${props.agent.id}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onShow(target);
          }}
        >
          {parts.text}
        </button>
      )}
      {parts.inTransit ? <InTransitIcon /> : null}
    </span>
  );
}
