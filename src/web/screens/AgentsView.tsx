/**
 * AVIEW: the Agents View. One table of the Agents the chosen filter shows, because the Player compares Agents with one
 * another and acts on several at once, with each Agent's details one step away. The Memorial filter shows the
 * Terminated Agents instead, with how each one's service ended.
 */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { AgentView, CurrentStateView, HistoryView } from '../../engine/index.ts';
import { useRowSelection } from '../row-selection.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, Cols } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

/** VIS, Tables: the columns that hold numbers are right-aligned in the Figure style. */
const NUMERIC = new Set(['effectiveSkill', 'skill', 'currentHealth', 'exhaustion', 'weaponDamage']);

/** VIS, Tables: the fixed widths of the table of Serving Agents, the checkbox column first. */
const SERVING_WIDTHS = ['36px', '120px', '100px', '76px', '88px', '116px', '88px', undefined];
/** VIS, Tables: the fixed widths of the Memorial table. */
const MEMORIAL_WIDTHS = ['120px', '76px', '80px', '120px', '110px', undefined];

const ASSIGNMENTS = ['Standby', 'Contracting', 'Training'] as const;
type OrderAssignment = (typeof ASSIGNMENTS)[number];

/** AVIEW, Agent filters: exactly one of the six is on at a time. */
type Filter = 'all' | 'standby' | 'memorial' | `to-${OrderAssignment}`;

/** AVIEW, Re-assigning: changing the Assignment of an Agent on Contracting or an Investigation. */
export function isReassigning(agent: AgentView): boolean {
  return agent.assignment?.kind === 'Contracting' || agent.assignment?.kind === 'Investigation';
}

/** Instance IDs in their creation order, e.g. agent-9 before agent-10. */
function byId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** AVIEW, Agent table: an Assignment names its Lead or Mission site, and an Agent In transit says so. */
export function assignmentText(
  agent: AgentView,
  state: CurrentStateView,
  history?: HistoryView | null,
): string {
  const assignment = agent.assignment;
  let text: string;
  if (assignment === null) {
    text = agent.agentStatus;
  } else if (assignment.kind === 'Investigation') {
    const investigation =
      state.investigations.find((item) => item.id === assignment.investigation) ??
      history?.retained.investigations.find((item) => item.id === assignment.investigation);
    text = `Investigation · ${investigation?.leadName ?? assignment.investigation}`;
  } else if (assignment.kind === 'Deployed') {
    const mission = state.missions.find((item) => item.id === assignment.mission);
    const site = state.missionSites.find((item) => item.id === mission?.missionSite);
    text = `Mission · ${site?.name ?? assignment.mission}`;
  } else if (assignment.kind === 'Recovery' && agent.recoveryTurnsRemaining !== null) {
    text = `Recovery · ${agent.recoveryTurnsRemaining} T left`;
  } else {
    text = assignment.kind;
  }
  return agent.agentStatus === 'InTransit' ? `${text} · In transit` : text;
}

/** VIS, Tables: text that encodes a state takes the colour of that state. */
function assignmentTone(agent: AgentView): string {
  if (agent.assignment?.kind === 'Recovery' || agent.agentStatus === 'Recovering') {
    return 'tone-accent';
  }
  if (agent.agentStatus === 'InTransit' || agent.assignment?.kind === 'Standby') {
    return 'muted';
  }
  return 'tone-good';
}

/**
 * AVIEW, Memorial: the two lines of a Terminated Agent's details: how its service ended, naming the Enemy and Mission
 * site its Killed by references by Instance ID and Archetype `name`, and its service in numbers.
 */
export function memorialDetails(
  agent: AgentView,
  state: CurrentStateView,
  history: HistoryView | null,
): { ended: string; numbers: string } {
  let ended: string = agent.agentStatus;
  const killedBy = agent.killedBy;
  if (agent.agentStatus === 'Killed' && killedBy !== null) {
    const sites = [...state.missionSites, ...(history?.retained.missionSites ?? [])];
    const site = sites.find((item) => item.id === killedBy.missionSite);
    const enemy = sites.flatMap((item) => item.enemies).find((item) => item.id === killedBy.enemy);
    const enemyText = enemy === undefined ? killedBy.enemy : `${killedBy.enemy}, ${enemy.archetypeName}`;
    const siteText = site === undefined ? killedBy.missionSite : `${killedBy.missionSite}, ${site.name}`;
    ended = `Killed by ${enemyText}, at ${siteText}`;
  }
  const missions = agent.participationHistory.filter((item) => item.kind === 'Mission').length;
  const turns = (agent.turnTerminated ?? agent.turnHired) - agent.turnHired;
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const numbers = [
    plural(missions, 'Mission', 'Missions'),
    plural(turns, 'Turn with the Agency', 'Turns with the Agency'),
    plural(agent.enemiesKilled, 'Enemy killed', 'Enemies killed'),
  ].join(' · ');
  return { ended, numbers };
}

const helper = createColumnHelper<AgentView>();

function FunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AgentsView(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  selected: readonly string[];
  locked: string | null;
  onSelect: (ids: readonly string[]) => void;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const { snapshot, state, selected, locked, onSelect } = props;
  const actions = snapshot.actions;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilterState] = useState<Filter>('all');
  // AVIEW, Re-assigning: unchecked whenever the Agents View opens.
  const [allowReassign, setAllowReassign] = useState(false);
  const [details, setDetails] = useState<string | null>(null);

  const assignable = useMemo(() => new Set(actions?.assignableAgents ?? []), [actions]);
  const dismissable = useMemo(() => new Set(actions?.dismissableAgents ?? []), [actions]);
  const terminated = useMemo(
    () =>
      [...(snapshot.history?.retained.agents ?? [])].sort(
        (a, b) => (b.turnTerminated ?? 0) - (a.turnTerminated ?? 0) || byId(a.id, b.id),
      ),
    [snapshot.history],
  );

  /** AVIEW, Agent filters: the Serving Agents that the button would succeed with if that Agent alone were selected. */
  const acceptedAlone = (assignment: OrderAssignment): AgentView[] => {
    const accepted = new Set(actions?.assignAgents.acceptedAlone[assignment] ?? []);
    return state.agents.filter((agent) => accepted.has(agent.id) && (allowReassign || !isReassigning(agent)));
  };
  const shownBy = (which: Filter): AgentView[] => {
    if (which === 'all') {
      return [...state.agents];
    }
    if (which === 'standby') {
      return state.agents.filter((agent) => agent.assignment?.kind === 'Standby');
    }
    if (which === 'memorial') {
      return [];
    }
    return acceptedAlone(which.slice(3) as OrderAssignment);
  };
  // TanStack Table needs a stable `data` reference: a new array on every render makes it re-render without end.
  const rows = useMemo(() => shownBy(filter), [filter, state.agents, actions, allowReassign]);
  const rowIds = rows.map((agent) => agent.id);

  const setFilter = (next: Filter) => {
    setFilterState(next);
    // AVIEW, Agent filters: a selected Agent that the newly chosen filter does not show is no longer selected.
    const shown = new Set(shownBy(next).map((agent) => agent.id));
    if (selected.some((id) => !shown.has(id))) {
      onSelect(selected.filter((id) => shown.has(id)));
    }
  };

  const columns = useMemo(
    () => [
      helper.accessor('id', {
        header: 'Agent',
        sortingFn: (a, b) => byId(a.original.id, b.original.id),
        cell: (cell) => (
          <button
            type="button"
            className="id-link"
            data-testid={`agent-details-${cell.getValue()}`}
            onClick={() => {
              setDetails(cell.getValue());
            }}
          >
            {cell.getValue()}
          </button>
        ),
      }),
      helper.accessor('effectiveSkill', { header: 'Effective' }),
      helper.accessor('skill', { header: 'Skill' }),
      helper.accessor('currentHealth', {
        header: 'Health',
        cell: (cell) => {
          const agent = cell.row.original;
          return (
            <span className={agent.currentHealth < agent.baseHealth ? 'tone-accent' : ''}>
              {agent.currentHealth}/{agent.baseHealth}
            </span>
          );
        },
      }),
      helper.accessor('exhaustion', {
        header: 'Exhaustion',
        cell: (cell) => {
          const agent = cell.row.original;
          // AVIEW, Agent table: an Agent that is not Fit for work shows its exhaustion in Accent text.
          return (
            <span
              className={agent.fitForWork ? '' : 'tone-accent'}
              title={agent.fitForWork ? 'Fit for work' : 'Not Fit for work: must rest before new work'}
            >
              {agent.exhaustion}
            </span>
          );
        },
      }),
      helper.accessor('weaponDamage', { header: 'Damage' }),
      helper.accessor((agent) => assignmentText(agent, state, snapshot.history), {
        id: 'assignment',
        header: 'Assignment',
        cell: (cell) => <span className={assignmentTone(cell.row.original)}>{cell.getValue()}</span>,
      }),
    ],
    [state, snapshot.history],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (agent) => agent.id,
  });

  // AVIEW, Agent table: a checkbox is disabled for an Agent that no button can act on even with re-assigning allowed.
  const actionable = (id: string) => assignable.has(id) || dismissable.has(id);
  const selection = useRowSelection({
    order: table.getRowModel().rows.map((row) => row.id),
    selected,
    selectable: actionable,
    onChange: onSelect,
  });

  const chosenAgents = state.agents.filter((agent) => selected.includes(agent.id));
  const previews = useMemo(() => {
    const result = new Map<OrderAssignment, string | null>();
    for (const assignment of ASSIGNMENTS) {
      if (selected.length === 0) {
        result.set(assignment, 'Select Agents first.');
        continue;
      }
      const preview = player.queries.previewAssignAgents(selected, assignment);
      result.set(
        assignment,
        !preview.ok
          ? preview.error.message
          : preview.value.available
            ? null
            : (preview.value.message ?? 'Unavailable.'),
      );
    }
    return result;
    // The preview depends on the Committed state, which the snapshot key names.
  }, [player, selected, snapshot.key]);

  const shownDetails =
    details === null
      ? undefined
      : (state.agents.find((agent) => agent.id === details) ??
        terminated.find((agent) => agent.id === details));
  if (shownDetails !== undefined) {
    return (
      <DetailView id="agents" title={`Agent ${shownDetails.id}`} onClose={props.onClose}>
        <AgentDetails
          agent={shownDetails}
          snapshot={snapshot}
          state={state}
          onBack={() => {
            setDetails(null);
          }}
        />
      </DetailView>
    );
  }

  const memorial = filter === 'memorial';
  const count = selected.length;
  const none = count === 0 ? 'Select Agents first.' : null;
  const reassignReason =
    !allowReassign && chosenAgents.some(isReassigning)
      ? 'A selected Agent is on Contracting or an Investigation: check Allow re-assigning to move it.'
      : null;
  // AVIEW, Header: a button is enabled only when pressing it would succeed with the current selection.
  const orderReason = (assignment: OrderAssignment): string | null =>
    locked ??
    (memorial ? 'No Player action acts on a Terminated Agent.' : null) ??
    none ??
    reassignReason ??
    previews.get(assignment) ??
    null;
  const dismissReason =
    locked ??
    (memorial ? 'No Player action acts on a Terminated Agent.' : null) ??
    none ??
    (selected.every((id) => dismissable.has(id)) ? null : 'A selected Agent cannot be dismissed now.');

  const filterButton = (which: Filter, label: string, shown: number) => (
    <button
      type="button"
      className={filter === which ? 'chip chip-on' : 'chip'}
      aria-pressed={filter === which}
      data-testid={`filter-${which}`}
      onClick={() => {
        setFilter(which);
      }}
    >
      {label} {shown}
    </button>
  );

  return (
    <DetailView
      id="agents"
      title="Agents"
      aside={
        <>
          {state.agency.servingAgents} / {state.agency.agentCap} · Training {state.agency.trainingAgents} /{' '}
          {state.agency.trainingCap}
        </>
      }
      actions={
        <div className="control-group" role="group" aria-labelledby="agent-filters-label">
          <span className="label" id="agent-filters-label">
            Show agents
          </span>
          <div className="chips">
            {filterButton('all', 'All', state.agents.length)}
            {filterButton('standby', 'In Standby', shownBy('standby').length)}
            {filterButton('memorial', 'Memorial', terminated.length)}
          </div>
        </div>
      }
      onClose={props.onClose}
    >
      <div className="toolbar agents-toolbar">
        <Button
          shortcut="H"
          testId="hire"
          disabledReason={
            locked ??
            (actions?.hireAgent.available === true ? null : (actions?.hireAgent.message ?? 'Unavailable.'))
          }
          onClick={() => {
            act(() => player.actions.hireAgent());
          }}
        >
          Hire · {state.agency.hireCost}
        </Button>
        <div className="control-group" role="group" aria-labelledby="assign-to-label">
          <span className="label" id="assign-to-label">
            Assign to
          </span>
          <div className="actions">
            {ASSIGNMENTS.map((assignment) => {
              const which: Filter = `to-${assignment}`;
              return (
                <span key={assignment} className="button-pair">
                  <Button
                    shortcut={assignment.charAt(0)}
                    testId={`order-${assignment.toLowerCase()}`}
                    disabledReason={orderReason(assignment)}
                    onClick={() => {
                      // AVIEW, Re-assigning: with Allow re-assigning checked, no confirmation is asked.
                      const agents = [...selected];
                      act(() => player.actions.assignAgents(agents, assignment));
                      onSelect([]);
                    }}
                  >
                    {assignment}
                  </Button>
                  <button
                    type="button"
                    className={filter === which ? 'btn filter-toggle chip-on' : 'btn filter-toggle'}
                    aria-pressed={filter === which}
                    aria-label={`Show the Agents that can be assigned to ${assignment}`}
                    title={`Show the Agents that can be assigned to ${assignment}`}
                    data-testid={`filter-to-${assignment.toLowerCase()}`}
                    onClick={() => {
                      setFilter(filter === which ? 'all' : which);
                    }}
                  >
                    <FunnelIcon />
                  </button>
                </span>
              );
            })}
            <label className="check-label">
              <input
                type="checkbox"
                data-testid="allow-reassigning"
                checked={allowReassign}
                onChange={(event) => {
                  setAllowReassign(event.target.checked);
                }}
              />
              Allow re-assigning
            </label>
          </div>
        </div>
        <Button
          kind="danger"
          testId="dismiss"
          disabledReason={dismissReason}
          onClick={() => {
            if (window.confirm(`Dismiss ${selected.join(', ')}? A Dismissed Agent never returns.`)) {
              const agents = [...selected];
              act(() => player.actions.dismissAgents(agents));
              onSelect([]);
            }
          }}
        >
          Dismiss
        </Button>
        {memorial ? null : <span className="muted small">{count} selected</span>}
      </div>
      {memorial ? (
        <Memorial
          agents={terminated}
          state={state}
          history={snapshot.history}
          onOpen={(id) => {
            setDetails(id);
          }}
        />
      ) : (
        <div className="table-scroll">
          <table className="grid agents-grid" data-testid="agents-grid">
            <Cols widths={SERVING_WIDTHS} />
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  <th className="check" aria-label="Selected" />
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      className={NUMERIC.has(header.column.id) ? 'sortable num' : 'sortable'}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'
                        ? ' ▲'
                        : header.column.getIsSorted() === 'desc'
                          ? ' ▼'
                          : ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${selected.includes(row.id) ? 'row-selected' : ''} ${actionable(row.id) ? '' : 'row-busy'}`}
                  data-testid={`agent-${row.id}`}
                  {...selection.row(row.id)}
                >
                  <td className="check">
                    <input type="checkbox" aria-label={`Select ${row.id}`} {...selection.checkbox(row.id)} />
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={NUMERIC.has(cell.column.id) ? 'num' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowIds.length === 0 ? <p className="muted pad">No Agents to show.</p> : null}
        </div>
      )}
    </DetailView>
  );
}

/** AVIEW, Memorial: one row per Terminated Agent, newest Turn terminated first, with no selection checkbox. */
function Memorial(props: {
  agents: readonly AgentView[];
  state: CurrentStateView;
  history: HistoryView | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="grid memorial-grid" data-testid="memorial-grid">
        <Cols widths={MEMORIAL_WIDTHS} />
        <thead>
          <tr>
            <th>Agent</th>
            <th className="num">Skill</th>
            <th className="num">Health</th>
            <th className="num">Terminated</th>
            <th>Cause</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {props.agents.map((agent) => {
            const details = memorialDetails(agent, props.state, props.history);
            return (
              <tr key={agent.id} data-testid={`memorial-${agent.id}`}>
                <td>
                  <button
                    type="button"
                    className="id-link"
                    data-testid={`agent-details-${agent.id}`}
                    onClick={() => {
                      props.onOpen(agent.id);
                    }}
                  >
                    {agent.id}
                  </button>
                </td>
                <td className="num">{agent.skill}</td>
                <td className="num">{agent.baseHealth}</td>
                <td className="num">T{agent.turnTerminated ?? '-'}</td>
                <td className={agent.agentStatus === 'Killed' ? 'tone-bad' : 'muted'}>{agent.agentStatus}</td>
                <td>
                  {details.ended}
                  <div className="secondary small">{details.numbers}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {props.agents.length === 0 ? <p className="muted pad">No Agent has left the Agency yet.</p> : null}
    </div>
  );
}

function AgentDetails(props: {
  agent: AgentView;
  snapshot: Snapshot;
  state: CurrentStateView;
  onBack: () => void;
}) {
  const { agent, snapshot, state } = props;
  const retained = snapshot.history?.retained;
  const participation = agent.participationHistory.map((item) => {
    if (item.kind === 'Investigation') {
      const investigation =
        state.investigations.find((one) => one.id === item.id) ??
        retained?.investigations.find((one) => one.id === item.id);
      return {
        key: `i-${item.id}`,
        what: `Investigation · ${investigation?.leadName ?? item.id}`,
        outcome: investigation?.lifecycle ?? '-',
      };
    }
    const mission =
      state.missions.find((one) => one.id === item.id) ??
      retained?.missions.find((one) => one.id === item.id);
    const site = [...state.missionSites, ...(retained?.missionSites ?? [])].find(
      (one) => one.id === mission?.missionSite,
    );
    return {
      key: `m-${item.id}`,
      what: `Mission · ${site?.name ?? item.id}`,
      outcome: mission?.lifecycle ?? '-',
    };
  });
  return (
    <div className="stack" data-testid={`agent-details-view-${agent.id}`}>
      <div>
        <button type="button" className="link" data-testid="agent-details-back" onClick={props.onBack}>
          ← Agents
        </button>
      </div>
      <dl className="pairs">
        <dt>Archetype</dt>
        <dd>{agent.archetypeName}</dd>
        <dt>Turn hired</dt>
        <dd className="figure">{agent.turnHired}</dd>
        <dt>Weapon</dt>
        <dd>
          {agent.weaponName} <span className="figure secondary">· damage {agent.weaponDamage}</span>
        </dd>
        <dt>Assignment</dt>
        <dd>{assignmentText(agent, state, snapshot.history)}</dd>
      </dl>
      <div className="label">Participation history</div>
      {participation.length === 0 ? (
        <p className="muted">No Investigation or Mission yet.</p>
      ) : (
        <table className="grid compact">
          <Cols widths={[undefined, '120px']} />
          <tbody>
            {participation.map((item) => (
              <tr key={item.key}>
                <td>{item.what}</td>
                <td
                  className={
                    item.outcome === 'Won' || item.outcome === 'Completed'
                      ? 'tone-good'
                      : item.outcome === 'Lost' || item.outcome === 'Abandoned'
                        ? 'tone-bad'
                        : 'secondary'
                  }
                >
                  {item.outcome}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
