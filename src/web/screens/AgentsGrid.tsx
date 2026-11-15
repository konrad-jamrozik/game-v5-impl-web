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
import { Badge, Button, Meter } from '../ui.tsx';

function assignmentName(agent: AgentView): string {
  const assignment = agent.assignment;
  if (assignment === null) {
    return agent.lifecycle;
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
  const [filter, setFilter] = useState<'all' | 'orderable'>('all');

  const orderable = useMemo(() => new Set(actions?.orderableAgents ?? []), [actions]);
  const dismissable = useMemo(() => new Set(actions?.dismissableAgents ?? []), [actions]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const rows = useMemo(
    () => (filter === 'all' ? [...state.agents] : state.agents.filter((agent) => orderable.has(agent.id))),
    [state.agents, filter, orderable],
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
          const tone =
            agent.currentHealth * 2 < agent.baseHealth
              ? 'bad'
              : agent.currentHealth < agent.baseHealth
                ? 'warn'
                : 'good';
          return (
            <span className="with-meter">
              <Meter value={agent.currentHealth} max={agent.baseHealth} tone={tone} />
              {agent.currentHealth}/{agent.baseHealth}
            </span>
          );
        },
      }),
      helper.accessor('exhaustion', { header: 'Exhaustion' }),
      helper.accessor('weaponDamage', { header: 'Damage' }),
      helper.accessor(assignmentName, {
        id: 'assignment',
        header: 'Assignment',
        cell: (cell) => {
          const agent = cell.row.original;
          return (
            <>
              {cell.getValue()}
              {agent.taskPhase === 'InTransit' ? <Badge tone="accent">In transit</Badge> : null}
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
  const allOrderable = selected.every((id) => orderable.has(id));
  const orderReason = locked ?? none ?? (allOrderable ? null : 'A selected Agent cannot be ordered now.');
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
        <h3>
          Agents <span className="muted">({count} selected)</span>
        </h3>
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
            className={filter === 'orderable' ? 'chip chip-on' : 'chip'}
            data-testid="filter-orderable"
            onClick={() => {
              setFilter('orderable');
            }}
          >
            Can be ordered {orderable.size}
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
              act(() => player.actions.assignAgents(selected, assignment));
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
                    className="sortable"
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
                className={`${chosen.has(row.id) ? 'row-selected' : ''} ${orderable.has(row.id) ? '' : 'row-busy'}`}
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
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
