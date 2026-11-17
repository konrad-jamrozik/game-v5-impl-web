/** The Agents grid: every Serving Agent, sortable, with selection and the orders that apply to the selection. */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { AgentView, CurrentStateView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { confirmInterruption } from '../interruption.ts';
import { Badge, Button } from '../ui.tsx';

/** VIS, Tables: the columns that hold numbers are right-aligned in the Figure style. */
const NUMERIC = new Set(['skill', 'effectiveSkill', 'currentHealth', 'exhaustion', 'weaponDamage']);

/** VIS, Tables: text that encodes a state takes the colour of that state. */
function assignmentTone(agent: AgentView): string {
  if (agent.agentStatus === 'Recovering') {
    return 'tone-warn';
  }
  if (agent.agentStatus === 'InTransit' || agent.assignment?.kind === 'Standby') {
    return 'tone-muted-text';
  }
  return 'tone-good';
}

function assignmentName(agent: AgentView): string {
  const assignment = agent.assignment;
  if (assignment === null) {
    return agent.agentStatus;
  }
  if (assignment.kind === 'Investigation') {
    return `Investigating (${assignment.investigation})`;
  }
  return assignment.kind === 'Deployed' ? `Deployed (${assignment.mission})` : assignment.kind;
}

const helper = createColumnHelper<AgentView>();

export function AgentsGrid(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  selected: readonly string[];
  locked: string | null;
  onSelect: (ids: readonly string[]) => void;
}) {
  const { player } = theEngine();
  const { state, selected, locked, onSelect } = props;
  const actions = props.snapshot.actions;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState<'all' | 'assignable'>('all');

  const assignable = useMemo(() => new Set(actions?.assignableAgents ?? []), [actions]);
  const dismissable = useMemo(() => new Set(actions?.dismissableAgents ?? []), [actions]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const rows = useMemo(
    () => (filter === 'all' ? [...state.agents] : state.agents.filter((agent) => assignable.has(agent.id))),
    [state.agents, filter, assignable],
  );

  const columns = useMemo(
    () => [
      helper.accessor('id', { header: 'Agent' }),
      helper.accessor('skill', { header: 'Skill' }),
      helper.accessor('effectiveSkill', { header: 'Effective' }),
      helper.accessor('currentHealth', {
        header: 'Health',
        cell: (cell) => {
          const agent = cell.row.original;
          // VIS, Colours: a low health value is Accent text.
          return (
            <span className={agent.currentHealth < agent.baseHealth ? 'tone-warn' : ''}>
              {agent.currentHealth}/{agent.baseHealth}
            </span>
          );
        },
      }),
      helper.accessor('exhaustion', {
        header: 'Exhaustion',
        cell: (cell) => {
          const agent = cell.row.original;
          // AGENT, Start-work gate: an Agent that is not Fit for work cannot start new work.
          return (
            <span
              className={agent.fitForWork ? '' : 'tone-warn'}
              title={agent.fitForWork ? 'Fit for work' : 'Not Fit for work: must rest before new work'}
            >
              {agent.exhaustion}
            </span>
          );
        },
      }),
      helper.accessor('weaponDamage', { header: 'Damage' }),
      helper.accessor(assignmentName, {
        id: 'assignment',
        header: 'Assignment',
        cell: (cell) => {
          const agent = cell.row.original;
          return (
            <>
              <span className={assignmentTone(agent)}>{cell.getValue()}</span>{' '}
              {agent.agentStatus === 'InTransit' ? <Badge tone="accent">In transit</Badge> : null}
              {agent.agentStatus === 'Recovering' ? <Badge tone="warn">Recovering</Badge> : null}
              {agent.recoveryTurnsRemaining === null ? null : (
                <Badge tone="warn">{agent.recoveryTurnsRemaining} turns left</Badge>
              )}
            </>
          );
        },
      }),
    ],
    [],
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

  const count = selected.length;
  const none = count === 0 ? 'Select Agents first.' : null;
  const allAssignable = selected.every((id) => assignable.has(id));
  const orderReason = locked ?? none ?? (allAssignable ? null : 'A selected Agent cannot be assigned now.');
  const dismissReason =
    locked ??
    none ??
    (selected.every((id) => dismissable.has(id)) ? null : 'A selected Agent cannot be dismissed now.');
  const toggle = (id: string) => {
    onSelect(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  const visibleIds = rows.map((agent) => agent.id);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => chosen.has(id));

  return (
    <section className="agents" aria-label="Agents">
      <header className="section-head">
        <h3>Agents</h3>
        <span className="label">
          {state.agents.length} serving · {count} selected
        </span>
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
      </header>
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
          Hire ({state.agency.hireCost})
        </Button>
        <span className="toolbar-gap" />
        {(['Standby', 'Contracting', 'Training'] as const).map((assignment) => (
          <Button
            key={assignment}
            shortcut={assignment.charAt(0)}
            testId={`order-${assignment.toLowerCase()}`}
            disabledReason={orderReason}
            onClick={() => {
              if (confirmInterruption(state, selected)) {
                act(() => player.actions.assignAgents(selected, assignment));
              }
            }}
          >
            {assignment}
            {assignment === 'Training' && actions !== null
              ? ` (${actions.assignAgents.trainingPlacesLeft} places)`
              : ''}
          </Button>
        ))}
        <Button
          kind="danger"
          testId="dismiss"
          disabledReason={dismissReason}
          onClick={() => {
            act(() => player.actions.dismissAgents(selected));
          }}
        >
          Dismiss
        </Button>
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
                className={`${chosen.has(row.id) ? 'row-selected' : ''} ${assignable.has(row.id) ? '' : 'row-busy'}`}
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
    </section>
  );
}
