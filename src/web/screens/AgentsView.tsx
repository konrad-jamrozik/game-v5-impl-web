/**
 * AVIEW: the Agents View. One table of the Agents the row filter shows, because the Player compares Agents with one
 * another and acts on several at once, with each Agent's details one step away. An Assignment filter decides which
 * shown Agents can be selected, every Agent that cannot is muted with what blocks it, and those that can come first. The
 * Memorial shows the Terminated Agents instead, with how each one's service ended.
 */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef } from 'react';
import type {
  AgentView,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
} from '../../engine/index.ts';
import { Exhaustion, Health, exhaustionLevels } from '../condition.tsx';
import { decimalText, wholeText } from '../format.ts';
import {
  ASSIGNMENTS,
  blockedBy,
  hiddenByChecks,
  type HideChecks,
  type OrderAssignment,
  type Selectability,
} from '../agent-selection.ts';
import { capBar, type CapBarModel } from '../cap-bar.ts';
import { memorialDeath, type MemorialDeath } from '../memorial.ts';
import { fillColour } from '../progress-bar.ts';
import { usePlace, usePlaceName, usePlaceState } from '../place.tsx';
import { useRowSelection } from '../row-selection.ts';
import { confirmOrGoBack, playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import {
  compareValues,
  pressHeader,
  pressHeaderUnderLock,
  sortRows,
  withLockedTier,
  type SortTier,
} from '../table-sort.ts';
import { Button, Grid, SortMark, ariaSort } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import type { ReportTarget } from './TurnReportView.tsx';

/** AVIEW, Row filters: both checkboxes are unchecked whenever the Agents View opens. */
const NO_HIDING: HideChecks = { hideRecovering: false, hideExhausted: false };

/** VIS, Tables: the columns that hold numbers are right-aligned in the Figure style. */
const NUMERIC = new Set([
  'effectiveSkill',
  'skillHundredths',
  'experience',
  'currentHealthHundredths',
  'exhaustion',
  'effectiveWeaponDamage',
]);

/** VIS, Tables: the fixed widths of the table of Serving Agents, the checkbox column first. */
const SERVING_WIDTHS = ['36px', '104px', '116px', '84px', '64px', '96px', '132px', '104px', '280px', '220px'];
/** VIS, Tables: the fixed widths of the Memorial table. */
/**
 * AVIEW, Memorial: Killed by holds the longest Enemy label of the GDRs with a two-digit number, e.g.
 * "high-commander-12", and Where the longest MissionSiteArchetype `name` with a three-digit number, e.g. "Foil
 * nuclear plant bombing #123", so that neither is ever cut short.
 */
const MEMORIAL_WIDTHS = [
  '104px',
  '84px',
  '64px',
  '96px',
  '132px',
  '96px',
  '112px',
  '88px',
  '80px',
  '200px',
  '300px',
];

/** AVIEW, Row filters: exactly one is on at a time. */
type RowFilter = 'all' | 'inBase' | 'away' | 'memorial';

/** AVIEW, Header, and VIS, Cap bars: a Label above the free count against the cap, followed by its cap bar. */
function CapFigure(props: { label: string; testId: string; model: CapBarModel }) {
  const { model } = props;
  return (
    <span className="cap-figure" data-testid={props.testId}>
      <span className="label">{props.label}</span>
      <span className="cap-figure-line">
        <span className="figure">
          {model.free} / {model.cap}
        </span>
        <span
          className="cap-bar"
          role="img"
          aria-label={`${props.label}: ${model.free} of ${model.cap}`}
          data-taken-share={model.takenShare}
        >
          <span
            className="cap-bar-fill"
            style={{ width: `${model.takenShare * 100}%`, background: fillColour(model.takenShare) }}
          />
        </span>
      </span>
    </span>
  );
}

/** Instance IDs in their creation order, e.g. agent-9 before agent-10. */
function byId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** AVIEW, Agent table: an Assignment names its Lead or Mission site, and an Agent In transit says so. */
export function assignmentText(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired?: CurrentRetiredWorldStateView | null,
): string {
  const assignment = agent.assignment;
  let text: string;
  if (assignment === null) {
    text = agent.agentStatus;
  } else if (assignment.kind === 'Investigation') {
    const investigation =
      state.investigations.find((item) => item.id === assignment.investigation) ??
      retired?.investigations.find((item) => item.id === assignment.investigation);
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

/** AVIEW, Memorial, Killed by and Where: the Enemy and Mission site of a Killed Agent; null for a Dismissed one. */
function memorialDeathOf(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView | null,
): MemorialDeath | null {
  return memorialDeath(agent.agentStatus === 'Killed' ? agent.killedBy : null, [
    ...state.missionSites,
    ...(retired?.missionSites ?? []),
  ]);
}

/** AVIEW, Memorial: the number columns of a Terminated Agent. */
export function memorialNumbers(agent: AgentView): { missions: number; turns: number; kills: number } {
  return {
    missions: agent.participationHistory.filter((item) => item.kind === 'Mission').length,
    turns: (agent.turnTerminated ?? agent.turnHired) - agent.turnHired,
    kills: agent.enemiesKilled,
  };
}

const helper = createColumnHelper<AgentView & { blockedBy: string }>();

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
  state: CurrentLiveWorldStateView;
  selected: readonly string[];
  locked: string | null;
  /** The Agent whose details open at once, when the Player followed an Agent's Instance ID from another view. */
  initial: string | null;
  onSelect: (ids: readonly string[]) => void;
  /** CSCR, View trail, Follow: opens another Detail view with an item selected. */
  onShow: (target: ReportTarget) => void;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const { snapshot, state, selected, locked, onSelect } = props;
  const actions = snapshot.actions;
  const levels = exhaustionLevels(snapshot.gameData);
  // VIS, Tables: up to four sort tiers over the default order by Instance ID.
  const [tiers, setTiers] = usePlaceState<SortTier<string>[]>('tiers', []);
  const [rowFilter, setRowFilter] = usePlaceState<RowFilter>('rowFilter', 'all');
  const [hideChecks, setHideChecks] = usePlaceState<HideChecks>('hideChecks', NO_HIDING);
  // AVIEW, Row filters: Hide with exhaustion > N, where N is `exhaustion_free_points` of AgentParameters.
  const freePoints = snapshot.gameData?.agentParameters['exhaustionFreePoints'] ?? 30;
  // AVIEW, Assignment filters: none is on whenever the Agents View opens.
  const [assignmentFilter, setAssignmentFilter] = usePlaceState<OrderAssignment | null>(
    'assignmentFilter',
    null,
  );
  const memorialOn = rowFilter === 'memorial';
  // AVIEW, Agent table: while an Assignment filter is on, Blocked by is a locked first tier, ascending, so that the
  // Agents that can be selected come first, and the Player's tiers order the Agents within each group of it.
  const locksBlockedBy = assignmentFilter !== null && !memorialOn;
  const sortTiers = useMemo(
    () => withLockedTier(locksBlockedBy ? { key: 'blockedBy', desc: false } : null, tiers),
    [locksBlockedBy, tiers],
  );
  const sorting = useMemo<SortingState>(
    () => sortTiers.map((tier) => ({ id: tier.key, desc: tier.desc })),
    [sortTiers],
  );
  // VIS, Tables: Select all, which keeps the selection equal to the shown rows that can be selected.
  const [selectAll, setSelectAll] = usePlaceState('selectAll', false);
  const [details, setDetails] = usePlaceState<string | null>('details', props.initial);
  const place = usePlace();
  /** AVIEW, Agent details: they open one step away, in place of the table, as a Follow. */
  const openDetails = (id: string) => {
    place.follow();
    setDetails(id);
  };

  const memorial = memorialOn;
  const terminated = useMemo(
    () =>
      [...(snapshot.retired?.agents ?? [])].sort(
        (a, b) => (b.turnTerminated ?? 0) - (a.turnTerminated ?? 0) || byId(a.id, b.id),
      ),
    [snapshot.retired],
  );

  // AVIEW, Assignment filters: the Agents each button of Assign to would succeed with alone, as PAPI, Action preview
  // reports it, asked again whenever the World state changes.
  const acceptedAlone = useMemo(() => {
    const result: Record<OrderAssignment, string[]> = { Standby: [], Contracting: [], Training: [] };
    for (const agent of state.agents) {
      // An Agent that cannot be assigned is rejected by every Assignment, so it needs no preview.
      if (!agent.canBeAssigned) {
        continue;
      }
      for (const assignment of ASSIGNMENTS) {
        const preview = player.queries.previewAction({
          name: 'assignAgents',
          args: { agents: [agent.id], assignment },
        });
        if (preview.ok && preview.value.available) {
          result[assignment].push(agent.id);
        }
      }
    }
    return result;
    // The preview depends on the World state, which the snapshot key names.
  }, [player, state.agents, snapshot.key]);
  const selectability: Selectability = useMemo(
    () => ({
      acceptedAlone: acceptedAlone ?? { Standby: [], Contracting: [], Training: [] },
      trainingPlacesLeft: actions?.assignAgents.trainingPlacesLeft ?? 0,
      assignmentFilter: memorial ? null : assignmentFilter,
    }),
    [acceptedAlone, actions, assignmentFilter, memorial],
  );

  // TanStack Table needs a stable `data` reference: a new array on every render makes it re-render without end.
  const rows = useMemo(() => {
    const shown =
      rowFilter === 'all'
        ? state.agents
        : rowFilter === 'inBase'
          ? state.agents.filter((agent) => agent.inBase)
          : rowFilter === 'away'
            ? state.agents.filter((agent) => agent.away)
            : [];
    // AVIEW, Agent table: the default order is by Instance ID, of the Agents the checkboxes do not hide.
    return shown
      .filter((agent) => !hiddenByChecks(agent, hideChecks, freePoints))
      .sort((x, y) => byId(x.id, y.id))
      .map((agent) => ({
        ...agent,
        blockedBy: blockedBy(agent, selectability, () => {
          const preview = player.queries.previewAction({
            name: 'assignAgents',
            args: { agents: [agent.id], assignment: selectability.assignmentFilter ?? 'Standby' },
          });
          return preview.ok ? (preview.value.message ?? 'Cannot be selected') : preview.error.message;
        }),
      }));
  }, [rowFilter, hideChecks, freePoints, state.agents, selectability, player]);

  const selectableIds = useMemo(
    () => rows.filter((row) => row.blockedBy === '').map((row) => row.id),
    [rows],
  );
  const selectableKey = selectableIds.join(',');

  // AVIEW, Assignment filters, and VIS, Tables: whenever what can be selected changes, the selection follows Select all
  // while it is on, and otherwise drops every Agent that can no longer be selected or is no longer shown.
  const latestSelected = useRef(selected);
  latestSelected.current = selected;
  useEffect(() => {
    const current = latestSelected.current;
    if (selectAll) {
      if (current.length !== selectableIds.length || current.some((id) => !selectableIds.includes(id))) {
        onSelect(selectableIds);
      }
      return;
    }
    const kept = current.filter((id) => selectableIds.includes(id));
    if (kept.length !== current.length) {
      onSelect(kept);
    }
    // The selectable set is named by its key.
  }, [selectableKey, selectAll]);

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
              openDetails(cell.getValue());
            }}
          >
            {cell.getValue()}
          </button>
        ),
      }),
      helper.accessor('effectiveSkill', { header: 'Effective' }),
      // GUI, Decimal quantities shown: base skill and current health with two decimals, e.g. "101.10", "29.40/30".
      helper.accessor('skillHundredths', { header: 'Skill', cell: (cell) => wholeText(cell.getValue()) }),
      // AVIEW, Agent table: Experience, a whole number, headed Exp.
      helper.accessor('experience', { header: 'Exp.' }),
      helper.accessor('currentHealthHundredths', {
        header: 'Health',
        cell: (cell) => (
          <Health currentHundredths={cell.getValue()} base={cell.row.original.effectiveMaxHealth} />
        ),
      }),
      helper.accessor('exhaustion', {
        header: 'Exhaustion',
        cell: (cell) => <Exhaustion value={cell.getValue()} levels={levels} />,
      }),
      // AVIEW, Agent table: the effective weapon damage.
      helper.accessor('effectiveWeaponDamage', { header: 'Damage' }),
      helper.accessor((agent) => assignmentText(agent, state, snapshot.retired), {
        id: 'assignment',
        header: 'Assignment',
        cell: (cell) => <span className={assignmentTone(cell.row.original)}>{cell.getValue()}</span>,
      }),
      helper.accessor('blockedBy', {
        header: 'Blocked by',
        // Ascending puts the empty Blocked by of the Agents that can be selected first.
        sortingFn: (a, b) => compareValues(a.original.blockedBy, b.original.blockedBy),
        cell: (cell) => (
          <span className="small" data-testid={`blocked-by-${cell.row.original.id}`}>
            {cell.getValue()}
          </span>
        ),
      }),
    ],
    [state, snapshot.retired, levels],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (agent) => agent.id,
  });

  const canSelect = (id: string) => selectableIds.includes(id);
  const selection = useRowSelection({
    order: table.getRowModel().rows.map((row) => row.id),
    selected,
    selectable: canSelect,
    onChange: (ids) => {
      // VIS, Tables: a manual change to any row turns Select all off and keeps the selection as it then is.
      setSelectAll(false);
      onSelect(ids);
    },
  });

  const previews = useMemo(() => {
    const result = new Map<OrderAssignment, string | null>();
    for (const assignment of ASSIGNMENTS) {
      if (selected.length === 0) {
        result.set(assignment, 'Select Agents first.');
        continue;
      }
      const preview = player.queries.previewAction({
        name: 'assignAgents',
        args: { agents: selected, assignment },
      });
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
    // The preview depends on the World state, which the snapshot key names.
  }, [player, selected, snapshot.key]);

  const shownDetails =
    details === null
      ? undefined
      : (state.agents.find((agent) => agent.id === details) ??
        terminated.find((agent) => agent.id === details));
  usePlaceName(shownDetails === undefined ? null : `Agent ${shownDetails.id}`);
  if (shownDetails !== undefined) {
    return (
      <DetailView id="agents" title={`Agent ${shownDetails.id}`} onClose={props.onClose}>
        <AgentDetails agent={shownDetails} snapshot={snapshot} state={state} onShow={props.onShow} />
      </DetailView>
    );
  }

  const count = selected.length;
  const none = count === 0 ? 'Select Agents first.' : null;
  const terminatedReason = memorial ? 'No Player action acts on a Terminated Agent.' : null;
  // AVIEW, Header: a button is enabled only when pressing it would succeed with the current selection.
  const orderReason = (assignment: OrderAssignment): string | null =>
    locked ?? terminatedReason ?? none ?? previews.get(assignment) ?? null;
  // AVIEW, Header: Hire and Dismiss are enabled as PAPI, Action preview reports their Player actions.
  const reasonOf = (preview: ReturnType<typeof player.queries.previewAction>): string | null =>
    !preview.ok
      ? preview.error.message
      : preview.value.available
        ? null
        : (preview.value.message ?? 'Unavailable.');
  const dismissPreview =
    selected.length === 0
      ? null
      : reasonOf(player.queries.previewAction({ name: 'dismissAgents', args: { agents: selected } }));
  const hirePreview = reasonOf(player.queries.previewAction({ name: 'hireAgent', args: {} }));
  const dismissReason = locked ?? terminatedReason ?? none ?? dismissPreview;
  // AVIEW, Header: the Combat rating of the selected Agents taken as one side, as the engine computes it.
  const selectionPreview = count === 0 ? null : player.queries.previewDeployment(null, selected);
  const selectionCombatRating =
    selectionPreview !== null && selectionPreview.ok ? selectionPreview.value.teamCombatRating : null;

  const hideCheck = (key: keyof HideChecks, label: string) => (
    <label className="inline hide-check">
      <input
        type="checkbox"
        data-testid={`hide-${key === 'hideRecovering' ? 'recovering' : 'exhausted'}`}
        checked={hideChecks[key]}
        disabled={memorial}
        onChange={() => {
          playSound(SOUND.select);
          setHideChecks({ ...hideChecks, [key]: !hideChecks[key] });
        }}
      />
      {label}
    </label>
  );

  const rowFilterButton = (which: RowFilter, label: string, shown: number) => (
    <button
      type="button"
      className={rowFilter === which ? 'chip chip-on' : 'chip'}
      aria-pressed={rowFilter === which}
      data-testid={`filter-${which}`}
      data-sound="select"
      onClick={() => {
        setRowFilter(which);
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
        // AVIEW, Header: the places still free under the Agent cap and the Training cap, each with its cap bar.
        <span className="cap-figures">
          <CapFigure
            label="Agent places free"
            testId="agent-places-free"
            model={capBar(state.agency.servingAgents, state.agency.agentCap)}
          />
          <CapFigure
            label="Training places free"
            testId="training-places-free"
            model={capBar(state.agency.trainingAgents, state.agency.trainingCap)}
          />
        </span>
      }
      actions={
        <div className="control-group" role="group" aria-labelledby="agent-filters-label">
          <span className="label" id="agent-filters-label">
            Show agents
          </span>
          <div className="chips">
            {rowFilterButton('all', 'All', state.agents.length)}
            {rowFilterButton('inBase', 'In base', state.agents.filter((agent) => agent.inBase).length)}
            {rowFilterButton('away', 'Away', state.agents.filter((agent) => agent.away).length)}
            {rowFilterButton('memorial', 'Memorial', terminated.length)}
          </div>
          {/* AVIEW, Row filters: below the four filters, two checkboxes hide more Agents; disabled for the Memorial. */}
          <div className="hide-checks">
            {hideCheck('hideRecovering', 'Hide recovering')}
            {hideCheck('hideExhausted', `Hide with exhaustion > ${freePoints}`)}
          </div>
        </div>
      }
      onClose={props.onClose}
    >
      <div className="toolbar agents-toolbar">
        <Button
          shortcut="H"
          testId="hire"
          disabledReason={locked ?? hirePreview}
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
              const on = !memorial && assignmentFilter === assignment;
              return (
                <span key={assignment} className="button-pair">
                  <Button
                    shortcut={assignment.charAt(0)}
                    testId={`order-${assignment.toLowerCase()}`}
                    disabledReason={orderReason(assignment)}
                    onClick={() => {
                      // AVIEW, Header: at once and without a confirmation, because Undo Action takes it back.
                      const agents = [...selected];
                      act(() => player.actions.assignAgents(agents, assignment));
                    }}
                  >
                    {assignment}
                  </Button>
                  <button
                    type="button"
                    className={on ? 'btn filter-toggle chip-on' : 'btn filter-toggle'}
                    aria-pressed={on}
                    disabled={memorial}
                    aria-label={`Allow selecting only the Agents that can be assigned to ${assignment}`}
                    title={`Allow selecting only the Agents that can be assigned to ${assignment}`}
                    data-testid={`filter-to-${assignment.toLowerCase()}`}
                    data-sound="select"
                    onClick={() => {
                      // AVIEW, Agent table: turning one on locks the Blocked by tier above the Player's tiers;
                      // turning it off drops that tier and keeps the tiers the Player chose.
                      setTiers(tiers.filter((tier) => tier.key !== 'blockedBy'));
                      setAssignmentFilter(on ? null : assignment);
                    }}
                  >
                    <FunnelIcon />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        <Button
          kind="danger"
          testId="dismiss"
          disabledReason={dismissReason}
          onClick={() => {
            if (confirmOrGoBack(`Dismiss ${selected.join(', ')}? A Dismissed Agent never returns.`)) {
              const agents = [...selected];
              act(() => player.actions.dismissAgents(agents));
            }
          }}
        >
          Dismiss
        </Button>
        {memorial ? null : (
          <span className="selection-figures">
            <span className="muted small" data-testid="agents-selected">
              {count} selected
            </span>
            {selectionCombatRating === null ? null : (
              <span className="combat-rating" data-testid="selection-combat-rating">
                <span className="label">Combat rating</span>
                <span className="figure tone-accent">{selectionCombatRating}</span>
              </span>
            )}
          </span>
        )}
      </div>
      {memorial ? (
        <Memorial
          agents={terminated}
          state={state}
          retired={snapshot.retired}
          onOpen={(id) => {
            openDetails(id);
          }}
        />
      ) : (
        <div className="table-scroll">
          <Grid widths={SERVING_WIDTHS} className="agents-grid" testId="agents-grid" scroll={false}>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  <th className="check">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      data-testid="select-all"
                      checked={selectAll}
                      disabled={selectableIds.length === 0 && !selectAll}
                      onChange={() => {
                        // SOUNDS, Select click: checking or unchecking Select all.
                        playSound(SOUND.select);
                        if (selectAll) {
                          setSelectAll(false);
                          onSelect([]);
                        } else {
                          setSelectAll(true);
                          onSelect(selectableIds);
                        }
                      }}
                    />
                  </th>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      className={NUMERIC.has(header.column.id) ? 'sortable num' : 'sortable'}
                      aria-sort={ariaSort(sortTiers, header.column.id)}
                      data-testid={`agents-sort-${header.column.id}`}
                      onClick={() => {
                        setTiers(
                          pressHeaderUnderLock(
                            tiers,
                            header.column.id,
                            NUMERIC.has(header.column.id),
                            locksBlockedBy ? 'blockedBy' : null,
                          ),
                        );
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortMark tiers={sortTiers} column={header.column.id} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${selected.includes(row.id) ? 'row-selected' : ''} ${canSelect(row.id) ? '' : 'row-busy'}`}
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
          </Grid>
          {rows.length === 0 ? <p className="muted pad">No Agents to show.</p> : null}
        </div>
      )}
    </DetailView>
  );
}

type MemorialKey =
  | 'id'
  | 'skill'
  | 'experience'
  | 'maxHealth'
  | 'turnTerminated'
  | 'cause'
  | 'missions'
  | 'turns'
  | 'kills'
  | 'killedBy'
  | 'where';

/** AVIEW, Memorial: one row per Terminated Agent, newest Turn terminated first, sorted by any column header. */
function Memorial(props: {
  agents: readonly AgentView[];
  state: CurrentLiveWorldStateView;
  retired: CurrentRetiredWorldStateView | null;
  onOpen: (id: string) => void;
}) {
  // VIS, Tables: up to four sort tiers over the default order, newest Turn terminated first and then by Instance ID.
  const [tiers, setTiers] = usePlaceState<SortTier<MemorialKey>[]>('memorialTiers', []);
  const unsorted = props.agents.map((agent) => ({
    agent,
    death: memorialDeathOf(agent, props.state, props.retired),
    ...memorialNumbers(agent),
  }));
  type Row = (typeof unsorted)[number];
  const value = (row: Row, key: MemorialKey): number | string => {
    switch (key) {
      case 'id':
        return row.agent.id;
      case 'skill':
        return row.agent.skillHundredths;
      case 'experience':
        return row.agent.experience;
      case 'maxHealth':
        return row.agent.effectiveMaxHealth;
      case 'turnTerminated':
        return row.agent.turnTerminated ?? 0;
      case 'cause':
        return row.agent.agentStatus;
      case 'missions':
        return row.missions;
      case 'turns':
        return row.turns;
      case 'kills':
        return row.kills;
      case 'killedBy':
        return row.death?.killedBy ?? '';
      case 'where':
        return row.death === null ? '' : `${row.death.where.name} ${row.death.where.number}`;
    }
  };
  const rows = sortRows(unsorted, tiers, value);
  const header = (key: MemorialKey, label: string, numeric: boolean, title?: string) => (
    <th
      className={numeric ? 'sortable num' : 'sortable'}
      title={title}
      aria-sort={ariaSort(tiers, key)}
      data-testid={`memorial-sort-${key}`}
      onClick={() => {
        setTiers(pressHeader(tiers, key, numeric));
      }}
    >
      {label}
      <SortMark tiers={tiers} column={key} />
    </th>
  );
  return (
    <div className="table-scroll">
      <Grid widths={MEMORIAL_WIDTHS} className="memorial-grid" testId="memorial-grid" scroll={false}>
        <thead>
          <tr>
            {header('id', 'Agent', false)}
            {header('skill', 'Skill', true)}
            {header('experience', 'Exp.', true, 'Experience')}
            {header('maxHealth', 'Health', true, 'Effective max health')}
            {header('turnTerminated', 'Terminated', true)}
            {header('cause', 'Cause', false)}
            {header('missions', 'Missions', true)}
            {header('turns', 'Turns', true, 'Turns with the Agency')}
            {header('kills', 'Kills', true, 'Enemies killed')}
            {header('killedBy', 'Killed by', false)}
            {header('where', 'Where', false)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agent.id} data-testid={`memorial-${row.agent.id}`}>
              <td>
                <button
                  type="button"
                  className="id-link"
                  data-testid={`agent-details-${row.agent.id}`}
                  onClick={() => {
                    props.onOpen(row.agent.id);
                  }}
                >
                  {row.agent.id}
                </button>
              </td>
              <td className="num">{wholeText(row.agent.skillHundredths)}</td>
              <td className="num">{row.agent.experience}</td>
              <td className="num">{row.agent.effectiveMaxHealth}</td>
              <td className="num">T{row.agent.turnTerminated ?? '-'}</td>
              <td className={row.agent.agentStatus === 'Killed' ? 'tone-bad' : 'muted'}>
                {row.agent.agentStatus}
              </td>
              <td className="num">{row.missions}</td>
              <td className="num">{row.turns}</td>
              <td className="num">{row.kills}</td>
              <td className="figure" data-testid={`memorial-killed-by-${row.agent.id}`}>
                {row.death?.killedBy}
              </td>
              <td data-testid={`memorial-where-${row.agent.id}`}>
                {row.death === null ? null : (
                  <>
                    {row.death.where.name} <span className="figure muted">{row.death.where.number}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Grid>
      {props.agents.length === 0 ? <p className="muted pad">No Agent has left the Agency yet.</p> : null}
    </div>
  );
}

/** AVIEW, Participation history: one row per Investigation or Mission, with where pressing it leads. */
interface ParticipationRow {
  readonly key: string;
  readonly what: string;
  readonly faction: string;
  readonly turn: number | null;
  readonly outcome: string;
  readonly target: ReportTarget | null;
}

/**
 * AVIEW, Participation history: an Investigation by its Lead, the Lead's Faction, and its Turn started; a Mission by
 * its Mission site, the target Faction, and its Turn deployed, the Turn whose Advance turn fought its Combat.
 */
export function participationRows(
  agent: AgentView,
  state: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView | null,
): ParticipationRow[] {
  const factionName = (id: string | null) =>
    id === null ? '' : (state.factions.find((faction) => faction.id === id)?.name ?? id);
  return agent.participationHistory.map((item) => {
    if (item.kind === 'Investigation') {
      const investigation =
        state.investigations.find((one) => one.id === item.id) ??
        retired?.investigations.find((one) => one.id === item.id);
      // Every discovered Lead is in the Retired world state.
      const lead = retired?.leads.find((one) => one.id === investigation?.lead);
      return {
        key: `i-${item.id}`,
        what: `Investigation · ${investigation?.leadName ?? item.id}`,
        faction: factionName(lead?.faction ?? null),
        turn: investigation?.turnStarted ?? null,
        outcome: investigation?.lifecycle ?? '-',
        target: investigation === undefined ? null : { kind: 'lead', lead: investigation.lead },
      };
    }
    const mission =
      state.missions.find((one) => one.id === item.id) ?? retired?.missions.find((one) => one.id === item.id);
    const site = [...state.missionSites, ...(retired?.missionSites ?? [])].find(
      (one) => one.id === mission?.missionSite,
    );
    return {
      key: `m-${item.id}`,
      what: `Mission · ${site?.name ?? item.id}`,
      faction: factionName(site?.targetFaction ?? null),
      turn: mission?.turnDeployed ?? null,
      outcome: mission?.lifecycle ?? '-',
      target: mission === undefined ? null : { kind: 'missionSite', missionSite: mission.missionSite },
    };
  });
}

/** AVIEW, Participation history: Completed or Won in Positive, Lost in Danger, and Abandoned in Text muted. */
function outcomeTone(outcome: string): string {
  if (outcome === 'Won' || outcome === 'Completed') {
    return 'tone-good';
  }
  if (outcome === 'Lost') {
    return 'tone-bad';
  }
  return outcome === 'Abandoned' ? 'muted' : 'secondary';
}

function AgentDetails(props: {
  agent: AgentView;
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  onShow: (target: ReportTarget) => void;
}) {
  const { agent, snapshot, state } = props;
  /** AVIEW, Agent details: a Terminated Agent shows its Final max health and no exhaustion. */
  const terminated = agent.agentStatus === 'Killed' || agent.agentStatus === 'Dismissed';
  const participation = participationRows(agent, state, snapshot.retired);
  return (
    <div className="stack" data-testid={`agent-details-view-${agent.id}`}>
      <dl className="pairs">
        <dt>Archetype</dt>
        <dd>{agent.archetypeName}</dd>
        <dt>Turn hired</dt>
        <dd className="figure">{agent.turnHired}</dd>
        <dt>Weapon</dt>
        <dd>
          {agent.weaponName} <span className="figure secondary">· damage {agent.effectiveWeaponDamage}</span>
        </dd>
        {/* AVIEW, Agent details: the Armor with its effective armor, e.g. "Service armor · armor 2"; a Terminated
            Agent's is its Final armor, which the view reports as its effective armor. */}
        <dt>Armor</dt>
        <dd data-testid="details-armor">
          {agent.armorName} <span className="figure secondary">· armor {agent.effectiveArmor}</span>
        </dd>
        {/* GUI, Decimal quantities shown: the one place that shows these values with two decimals. */}
        <dt>Skill</dt>
        <dd className="figure" data-testid="details-skill">
          {decimalText(agent.skillHundredths)}
        </dd>
        <dt>Health</dt>
        <dd className="figure" data-testid="details-health">
          {terminated
            ? agent.effectiveMaxHealth
            : `${decimalText(agent.currentHealthHundredths)}/${agent.effectiveMaxHealth}`}
        </dd>
        {terminated ? null : (
          <>
            <dt>Exhaustion</dt>
            <dd className="figure" data-testid="details-exhaustion">
              {decimalText(agent.exactExhaustionHundredths)}
            </dd>
          </>
        )}
        <dt>Assignment</dt>
        <dd>{assignmentText(agent, state, snapshot.retired)}</dd>
      </dl>
      {/* AVIEW, Agent details: the one place that shows a base Combat rating, beside the Combat rating that the Weapon
          damage and Armor Upgrades raise, in the shared Combat rating style, e.g. "COMBAT RATING 78 · base 76". A
          Terminated Agent shows no Combat rating. */}
      {terminated ? null : (
        <span className="combat-rating" data-testid="details-combat-rating">
          <span className="label">Combat rating</span>
          <span className="figure tone-accent">{agent.combatRating}</span>
          <span className="figure secondary">· base {agent.baseCombatRating}</span>
        </span>
      )}
      <div className="label">Participation history</div>
      {participation.length === 0 ? (
        <p className="muted">No Investigation or Mission yet.</p>
      ) : (
        <Grid widths={['360px', '140px', '100px', '120px']} className="compact" testId="participation-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Faction</th>
              <th>Turn</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {participation.map((item) => {
              const target = item.target;
              // AVIEW, Participation history: each row leads to what it records, as a Follow.
              // SOUNDS, Main click: pressing it opens a view.
              const open =
                target === null
                  ? undefined
                  : () => {
                      playSound(SOUND.main);
                      props.onShow(target);
                    };
              return (
                <tr
                  key={item.key}
                  className={open === undefined ? undefined : 'link-row'}
                  data-testid={`participation-${item.key}`}
                  onClick={open}
                >
                  <td className="link-name">{item.what}</td>
                  <td>{item.faction}</td>
                  <td className="figure">{item.turn === null ? '' : `Turn ${item.turn}`}</td>
                  <td className={outcomeTone(item.outcome)}>{item.outcome}</td>
                </tr>
              );
            })}
          </tbody>
        </Grid>
      )}
    </div>
  );
}
