/**
 * AVIEW: the Agents View. One table of the Serving Agents, because the Player compares Agents with one another and
 * acts on several at once, with each Agent's details one step away.
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
import { confirmInterruption } from '../interruption.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

/** VIS, Tables: the columns that hold numbers are right-aligned in the Figure style. */
const NUMERIC = new Set(['effectiveSkill', 'skill', 'currentHealth', 'exhaustion', 'weaponDamage']);

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

const helper = createColumnHelper<AgentView>();

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
  const [filter, setFilter] = useState<'all' | 'assignable'>('all');
  const [details, setDetails] = useState<string | null>(null);

  const assignable = useMemo(() => new Set(actions?.assignableAgents ?? []), [actions]);
  const dismissable = useMemo(() => new Set(actions?.dismissableAgents ?? []), [actions]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const rows = useMemo(
    () => (filter === 'all' ? [...state.agents] : state.agents.filter((agent) => assignable.has(agent.id))),
    [state.agents, filter, assignable],
  );

  const columns = useMemo(
    () => [
      helper.accessor('id', {
        header: 'Agent',
        cell: (cell) => (
          <button
            type="button"
            className="id-link"
            data-testid={`agent-details-${cell.getValue()}`}
            onClick={(event) => {
              event.stopPropagation();
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

  const shown = details === null ? undefined : state.agents.find((agent) => agent.id === details);
  if (shown !== undefined) {
    return (
      <DetailView id="agents" title={`Agent ${shown.id}`} onClose={props.onClose}>
        <AgentDetails
          agent={shown}
          snapshot={snapshot}
          state={state}
          onBack={() => {
            setDetails(null);
          }}
        />
      </DetailView>
    );
  }

  const count = selected.length;
  const none = count === 0 ? 'Select Agents first.' : null;
  const orderReason =
    locked ??
    none ??
    (selected.every((id) => assignable.has(id)) ? null : 'A selected Agent cannot be assigned now.');
  const dismissReason =
    locked ??
    none ??
    (selected.every((id) => dismissable.has(id)) ? null : 'A selected Agent cannot be dismissed now.');
  const actionable = (id: string) => assignable.has(id) || dismissable.has(id);
  const toggle = (id: string) => {
    if (actionable(id)) {
      onSelect(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
    }
  };
  const visibleIds = rows.map((agent) => agent.id).filter(actionable);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => chosen.has(id));

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
        <div className="chips">
          <button
            type="button"
            className={filter === 'all' ? 'chip chip-on' : 'chip'}
            onClick={() => {
              setFilter('all');
            }}
          >
            All {state.agents.length}
          </button>
          <button
            type="button"
            className={filter === 'assignable' ? 'chip chip-on' : 'chip'}
            data-testid="filter-assignable"
            onClick={() => {
              setFilter('assignable');
            }}
          >
            Can be assigned {assignable.size}
          </button>
        </div>
      }
      onClose={props.onClose}
    >
      <div className="toolbar">
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
        {(['Standby', 'Contracting', 'Training'] as const).map((assignment) => (
          <Button
            key={assignment}
            shortcut={assignment.charAt(0)}
            testId={`order-${assignment.toLowerCase()}`}
            disabledReason={orderReason}
            onClick={() => {
              if (confirmInterruption(state, selected)) {
                const agents = [...selected];
                act(() => player.actions.assignAgents(agents, assignment));
                onSelect([]);
              }
            }}
          >
            {assignment}
          </Button>
        ))}
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
        <span className="muted small">{count} selected</span>
      </div>
      <div className="table-scroll">
        <table className="grid agents-grid" data-testid="agents-grid">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all shown Agents"
                    checked={allVisible}
                    onChange={() => {
                      onSelect(allVisible ? [] : visibleIds);
                    }}
                  />
                </th>
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
                className={`${chosen.has(row.id) ? 'row-selected' : ''} ${actionable(row.id) ? '' : 'row-busy'}`}
                data-testid={`agent-${row.id}`}
                onClick={() => {
                  toggle(row.id);
                }}
              >
                <td className="check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.id}`}
                    checked={chosen.has(row.id)}
                    disabled={!actionable(row.id)}
                    onChange={() => {
                      toggle(row.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  />
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
        {rows.length === 0 ? <p className="muted pad">No Agents to show.</p> : null}
      </div>
    </DetailView>
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
          ← All Agents
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
