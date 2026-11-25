/**
 * AVIEW: the Agents View. One table of the Agents the row filter shows, because the Player compares Agents with one
 * another and acts on several at once, with each Agent's details one step away. An Assignment filter decides which
 * shown Agents can be selected, every Agent that cannot is muted with the reason as the tooltip of its checkbox, and
 * those that can come first. The Memorial shows the Terminated Agents instead, with how each one's service ended. It is
 * also where the Player equips Agents: a Weapon or Armor cell opens the Equipment picker. With Details checked, the
 * table shows the numbers behind each Combat rating in place of what each Agent wears.
 */
import { AGENT_COLUMN_WIDTH } from '../table-widths.ts';
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
  fitToStartWorkNow,
  hiddenByChecks,
  type HideChecks,
  type OrderAssignment,
  type Selectability,
} from '../agent-selection.ts';
import { assignmentText } from '../assignment.ts';
import { AssignmentCell } from '../assignment-cell.tsx';
import { capBar, type CapBarModel } from '../cap-bar.ts';
import { memorialDeath, type MemorialDeath } from '../memorial.ts';
import { fillColour } from '../progress-bar.ts';
import { usePlace, usePlaceName, usePlaceState } from '../place.tsx';
import { useRowSelection } from '../row-selection.ts';
import { confirmOrGoBack, playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { pressHeader, pressHeaderUnderLock, sortRows, withLockedTier, type SortTier } from '../table-sort.ts';
import { Button, Grid, SortMark, ariaSort, withShortcut } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { EquipmentPicker } from './EquipmentPicker.tsx';
import { EquipTable } from './EquipTable.tsx';
import { WholeScreen } from './ChartFullScreen.tsx';
import type { ReportTarget } from './TurnReportView.tsx';
import { rankOf, type RankThreshold } from '../rank.ts';
import { RankText } from '../rank-insignia.tsx';

/** AVIEW, Row filters: the checkboxes are unchecked whenever the Agents View opens. */
const NO_HIDING: HideChecks = { hideRecovering: false, hideExhausted: false };

/** A stable empty list of Ranks while the game data is not yet read. */
const NO_RANKS: readonly RankThreshold[] = [];

/** VIS, Tables: a header shortened from the name of what its column shows has that name as its tooltip. */
const HEADER_TOOLTIPS: Readonly<Record<string, string>> = {
  combatRating: 'Combat rating',
  exhaustion: 'Exhaustion',
};

/** VIS, Tables: the columns that hold numbers are right-aligned in the Figure style. */
const NUMERIC = new Set(['combatRating', 'currentHealthHundredths', 'exhaustion']);
/** VIS, Tables: the columns whose header sorts descending first, because they sort by a number. */
const DESCENDING_FIRST = new Set([...NUMERIC, 'rank']);

/**
 * AVIEW, Agent table: the locked first sort tier while an Assignment filter is on. It puts the Agents that can be
 * selected first and is no column of the table.
 */
const SELECTABLE_FIRST = 'selectable';

/**
 * VIS, Tables: the fixed widths of the table of Serving Agents, the checkbox column first. AVIEW, Agent table: the
 * Instance ID holds 30 characters, for the Agents' full names to come. CR holds four digits and Exh. three after the
 * warning triangle, each with its sort arrow; Rank holds the abbreviation "Hi Cmdr" and three stars; Assignment names
 * no Lead or Mission site and marks In transit with an icon, so it holds "Recovery · 99 T left" and the icon.
 */
const SERVING_WIDTHS = ['36px', AGENT_COLUMN_WIDTH, '64px', '116px', '84px', '72px', '176px'];
/**
 * VIS, Tables: the fixed widths of the Memorial table, 1068 px in all. AVIEW, Memorial: Cause holds "Killed by" and
 * the longest Enemy label of the GDRs with a two-digit number, e.g. "Killed by hcmd-12". Where is the
 * table's one column of free text: it takes the width the others leave, and a longer value ends in "…".
 */
const MEMORIAL_WIDTHS = [
  AGENT_COLUMN_WIDTH,
  '84px',
  '64px',
  '76px',
  '150px',
  '84px',
  '64px',
  '64px',
  '208px',
];

/** AVIEW, Row filters: exactly one is on at a time. */
type RowFilter = 'all' | 'fit' | 'inBase' | 'away' | 'memorial';

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
  const { snapshot, state, selected, locked, onSelect, onShow } = props;
  const actions = snapshot.actions;
  const levels = exhaustionLevels(snapshot.gameData);
  const ranks = snapshot.gameData?.ranks ?? NO_RANKS;
  // VIS, Tables: up to four sort tiers over the default order by Instance ID.
  const [tiers, setTiers] = usePlaceState<SortTier<string>[]>('tiers', []);
  const [rowFilter, setRowFilter] = usePlaceState<RowFilter>('rowFilter', 'all');
  const [hideChecks, setHideChecks] = usePlaceState<HideChecks>('hideChecks', NO_HIDING);
  // AVIEW, Equip table: shown one step away, as a Follow; the row filter on before Memorial, which Equip turns back on.
  const [equipOpen, setEquipOpen] = usePlaceState('equip', false);
  const [rosterFilter, setRosterFilter] = usePlaceState<RowFilter>('rosterFilter', 'all');
  // AVIEW, Row filters: Hide too exhausted to start work reads `exhaustion_work_start_max` of AgentParameters.
  const workStartMax = snapshot.gameData?.agentParameters['exhaustionWorkStartMax'] ?? 30;
  // AVIEW, Assignment filters: none is on whenever the Agents View opens.
  const [assignmentFilter, setAssignmentFilter] = usePlaceState<OrderAssignment | null>(
    'assignmentFilter',
    null,
  );
  const memorialOn = rowFilter === 'memorial';
  // AVIEW, Agent table: while an Assignment filter is on, a locked first tier puts the Agents that can be selected
  // first, and the Player's tiers order the Agents within each of the two groups.
  const locksSelectable = assignmentFilter !== null && !memorialOn;
  const sortTiers = useMemo(
    () => withLockedTier(locksSelectable ? { key: SELECTABLE_FIRST, desc: false } : null, tiers),
    [locksSelectable, tiers],
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
    setEquipOpen(false);
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
      if (!agent.canTakeOrders) {
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
      contractingPlacesLeft: actions?.assignAgents.contractingPlacesLeft ?? 0,
      assignmentFilter: memorial ? null : assignmentFilter,
    }),
    [acceptedAlone, actions, assignmentFilter, memorial],
  );

  // TanStack Table needs a stable `data` reference: a new array on every render makes it re-render without end.
  const rows = useMemo(() => {
    const shown =
      rowFilter === 'all'
        ? state.agents
        : rowFilter === 'fit'
          ? state.agents.filter(fitToStartWorkNow)
          : rowFilter === 'inBase'
            ? state.agents.filter((agent) => agent.inBase)
            : rowFilter === 'away'
              ? state.agents.filter((agent) => agent.away)
              : [];
    // AVIEW, Agent table: the default order is by Instance ID, of the Agents the checkboxes do not hide.
    return shown
      .filter((agent) => !hiddenByChecks(agent, hideChecks, workStartMax))
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
  }, [rowFilter, hideChecks, workStartMax, state.agents, selectability, player]);

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
      // AVIEW, Agent table: the Combat rating alone.
      helper.accessor((agent) => agent.combatRating ?? 0, { id: 'combatRating', header: 'CR' }),
      // AVIEW, Agent table: the Rank's `name` followed by its Rank insignia; the column sorts by base skill.
      helper.accessor('skillHundredths', {
        id: 'rank',
        header: 'Rank',
        cell: (cell) => {
          const rank = rankOf(cell.getValue(), ranks);
          return rank === null ? null : <RankText rank={rank} abbreviated />;
        },
      }),
      helper.accessor('currentHealthHundredths', {
        header: 'Health',
        cell: (cell) => (
          <Health currentHundredths={cell.getValue()} base={cell.row.original.effectiveMaxHealth} />
        ),
      }),
      helper.accessor('exhaustion', {
        // VIS, Tables: exhaustion is headed Exh.
        header: 'Exh.',
        cell: (cell) => <Exhaustion value={cell.getValue()} levels={levels} />,
      }),
      helper.accessor((agent) => assignmentText(agent, state, snapshot.retired), {
        id: 'assignment',
        header: 'Assignment',
        cell: (cell) => (
          <AssignmentCell
            agent={cell.row.original}
            state={state}
            retired={snapshot.retired}
            onShow={onShow}
          />
        ),
      }),
      // AVIEW, Agent table: the locked first sort tier, which is no column: it is never shown, and ascending it puts
      // the Agents that can be selected, whose `blockedBy` is empty, first.
      helper.accessor((agent) => (agent.blockedBy === '' ? 0 : 1), { id: SELECTABLE_FIRST }),
    ],
    [state, snapshot.retired, levels, ranks, onShow],
  );

  const columnVisibility = useMemo(() => ({ [SELECTABLE_FIRST]: false }), []);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
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
  usePlaceName(
    shownDetails !== undefined ? `Agent ${shownDetails.id}` : equipOpen && !memorial ? 'Equip' : null,
  );
  if (shownDetails !== undefined) {
    return (
      <DetailView id="agents" title={`Agent ${shownDetails.id}`} onClose={props.onClose}>
        <AgentDetails
          agent={shownDetails}
          snapshot={snapshot}
          state={state}
          locked={locked}
          onShow={props.onShow}
        />
      </DetailView>
    );
  }

  // AVIEW, Equip table: one step away, in place of the Agent table, covering the whole screen as the Combat replay
  // does; the Back control and Escape return to the Agent table.
  if (equipOpen && !memorial) {
    return (
      <WholeScreen active>
        <DetailView id="agents" title="Equip" onClose={props.onClose}>
          <div className="equip-view" data-testid="equip-view">
            <EquipTable
              agents={rows}
              state={state}
              retired={snapshot.retired}
              ranks={ranks}
              levels={levels}
              locked={locked}
              onOpenDetails={openDetails}
              onShow={onShow}
            />
          </div>
        </DetailView>
      </WholeScreen>
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
  const hirePreview = reasonOf(player.queries.previewAction({ name: 'hireAgents', args: { count: 1 } }));
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
        if (which !== 'memorial') {
          setRosterFilter(which);
        }
      }}
    >
      {label} {shown}
    </button>
  );

  // AVIEW, Header: Contracting, its Assignment filter, and its places free are shown only while the Contracting cap is
  // at least 1, i.e. once a Lead has unlocked Contracting.
  const contractingShown = state.agency.contractingCap >= 1;
  const shownAssignments = ASSIGNMENTS.filter(
    (assignment) => assignment !== 'Contracting' || contractingShown,
  );

  return (
    <DetailView
      id="agents"
      title="Agents"
      aside={
        // AVIEW, Header: the places still free under the Agent cap, the Training cap, and, while it is at least 1, the
        // Contracting cap, each with its cap bar.
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
          {contractingShown && (
            <CapFigure
              label="Contracting places free"
              testId="contracting-places-free"
              model={capBar(state.agency.contractingAgents, state.agency.contractingCap)}
            />
          )}
        </span>
      }
      // AVIEW, Row filters: the five row filters stand in the title row after the places free, without a Label.
      lead={
        <div className="chips agents-row-filters control-backdrop" role="group" aria-label="Show agents">
          {rowFilterButton('all', 'All', state.agents.length)}
          {rowFilterButton('fit', 'Fit', state.agents.filter(fitToStartWorkNow).length)}
          {rowFilterButton('inBase', 'In base', state.agents.filter((agent) => agent.inBase).length)}
          {rowFilterButton('away', 'Away', state.agents.filter((agent) => agent.away).length)}
        </div>
      }
      onClose={props.onClose}
    >
      {/* VIS, Detail views and navigation, Rows of controls: the row under the title's row holds the two Hide
          checkboxes at its left, on a Control backdrop (VIS, Colours) and disabled for the Memorial, and the Equip
          button and the Memorial row filter at its right; the buttons take the next row. */}
      <div className="agents-second-row">
        <div className="control-row control-backdrop agents-filters hide-checks">
          {hideCheck('hideExhausted', 'Hide too exhausted to start work')}
          {hideCheck('hideRecovering', 'Hide recovering')}
        </div>
        <div className="chips agents-row-filters control-backdrop">
          {/* AVIEW, Equip table: the Equip button shows it one step away; while Memorial is on, it first turns back
              on the row filter that was on before Memorial. */}
          <button
            type="button"
            className="chip"
            data-testid="open-equip"
            title="Show the Equip table"
            onClick={() => {
              if (memorial) {
                // AVIEW, Equip table: the place left behind is the roster under the row filter that was on before
                // Memorial, so that going back from the Equip table shows it rather than the Memorial.
                setRowFilter(rosterFilter);
                place.live.current['rowFilter'] = rosterFilter;
              }
              place.follow();
              setEquipOpen(true);
            }}
          >
            Equip
          </button>
          {rowFilterButton('memorial', 'Memorial', terminated.length)}
        </div>
      </div>
      <div className="toolbar agents-toolbar">
        <Button
          shortcut="H"
          testId="hire"
          disabledReason={locked ?? hirePreview}
          onClick={() => {
            act(() => player.actions.hireAgents(1));
          }}
        >
          Hire · {state.agency.hireCost}
        </Button>
        <div className="control-group control-row" role="group" aria-labelledby="assign-to-label">
          <span className="label" id="assign-to-label">
            Assign to
          </span>
          <div className="actions">
            {shownAssignments.map((assignment) => {
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
                      // AVIEW, Agent table: turning one on locks the selectable-first tier above the Player's
                      // tiers; turning it off drops that tier and keeps the tiers the Player chose.
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
                      title={withShortcut('Select all', 'A')}
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
                      title={HEADER_TOOLTIPS[header.column.id]}
                      aria-sort={ariaSort(sortTiers, header.column.id)}
                      data-testid={`agents-sort-${header.column.id}`}
                      onClick={() => {
                        setTiers(
                          pressHeaderUnderLock(
                            tiers,
                            header.column.id,
                            DESCENDING_FIRST.has(header.column.id),
                            locksSelectable ? SELECTABLE_FIRST : null,
                          ),
                        );
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortMark tiers={tiers} column={header.column.id} />
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
                  {/* AVIEW, Agent table: the tooltip of a disabled checkbox says why its Agent cannot be selected. */}
                  <td
                    className="check"
                    title={row.original.blockedBy === '' ? undefined : row.original.blockedBy}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.id}`}
                      data-testid={`select-${row.id}`}
                      data-blocked-by={row.original.blockedBy}
                      {...selection.checkbox(row.id)}
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
  | 'turnTerminated'
  | 'cause'
  | 'missions'
  | 'turns'
  | 'kills'
  | 'where';

/** AVIEW, Memorial, Cause: "Dismissed", or "Killed by" and the Enemy label of the Enemy that killed the Agent. */
function memorialCause(agent: AgentView, death: MemorialDeath | null): string {
  if (agent.agentStatus !== 'Killed') {
    return agent.agentStatus;
  }
  return death === null ? 'Killed' : `Killed by ${death.killedBy}`;
}

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
      case 'turnTerminated':
        return row.agent.turnTerminated ?? 0;
      case 'cause':
        return memorialCause(row.agent, row.death);
      case 'missions':
        return row.missions;
      case 'turns':
        return row.turns;
      case 'kills':
        return row.kills;
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
            {header('skill', 'Base', true, 'Base skill')}
            {header('experience', 'Exp.', true, 'Experience')}
            {header('turnTerminated', 'Ended', true, 'Turn terminated')}
            {header('cause', 'Cause', false)}
            {header('missions', 'Missions', true)}
            {header('turns', 'Turns', true, 'Turns with the Agency')}
            {header('kills', 'Kills', true, 'Enemies killed')}
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
              <td className="num">T{row.agent.turnTerminated ?? '-'}</td>
              {/* AVIEW, Memorial, Cause: Dismissed in Text muted; Killed by and the Enemy label in Danger text. */}
              <td
                className={row.agent.agentStatus === 'Killed' ? 'tone-bad' : 'muted'}
                data-testid={`memorial-cause-${row.agent.id}`}
              >
                {row.agent.agentStatus !== 'Killed' || row.death === null ? (
                  row.agent.agentStatus
                ) : (
                  <>
                    Killed by <span className="figure">{row.death.killedBy}</span>
                  </>
                )}
              </td>
              <td className="num">{row.missions}</td>
              <td className="num">{row.turns}</td>
              <td className="num">{row.kills}</td>
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
  locked: string | null;
  onShow: (target: ReportTarget) => void;
}) {
  const { agent, snapshot, state, locked } = props;
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
        {/* AVIEW, Agent details: Turns served, the current Turn minus the Turn hired, or for a Terminated Agent its
            Turns with the Agency as the Memorial counts them. */}
        <dt>Turns served</dt>
        <dd className="figure" data-testid="details-turns-served">
          {(agent.turnTerminated ?? state.turn) - agent.turnHired}
        </dd>
        <dt>Weapon</dt>
        <dd>
          {terminated ? (
            <>
              {agent.weaponName}{' '}
              <span className="figure secondary">· damage {agent.effectiveWeaponDamage}</span>
            </>
          ) : (
            <EquipmentPicker
              agent={agent}
              kind="weapon"
              state={state}
              locked={locked}
              testId="details-weapon"
            />
          )}
        </dd>
        {/* AVIEW, Agent details: the Armor with its effective armor, e.g. "Standard uniform · armor 2"; a Terminated
            Agent's is its Final armor, which the view reports as its effective armor. */}
        <dt>Armor</dt>
        <dd data-testid="details-armor">
          {terminated ? (
            <>
              {agent.armorName} <span className="figure secondary">· armor {agent.effectiveArmor}</span>
            </>
          ) : (
            <EquipmentPicker
              agent={agent}
              kind="armor"
              state={state}
              locked={locked}
              testId="details-armor-picker"
            />
          )}
        </dd>
        {/* GUI, Decimal quantities shown: the one place that shows these values with two decimals. */}
        <dt>Base skill</dt>
        <dd className="figure" data-testid="details-skill">
          {decimalText(agent.skillHundredths)}
        </dd>
        {/* AVIEW, Agent details: effective skill under base skill, a whole number; a Terminated Agent has none. */}
        {terminated ? null : (
          <>
            <dt>Effective skill</dt>
            <dd className="figure" data-testid="details-effective-skill">
              {agent.effectiveSkill}
            </dd>
          </>
        )}
        <dt>Experience</dt>
        <dd className="figure" data-testid="details-experience">
          {agent.experience}
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
        <dd>
          <AssignmentCell agent={agent} state={state} retired={snapshot.retired} onShow={props.onShow} />
        </dd>
      </dl>
      {/* AVIEW, Agent details: the Combat rating, its Rested Combat rating, and its Equipment Combat rating, in the
          shared Combat rating style, e.g. "COMBAT RATING 136 · max 149 · equipment +56"; the effective skill, its base
          Combat rating, is shown above instead. A Terminated Agent shows no Combat rating. */}
      {terminated ? null : (
        <span className="combat-rating" data-testid="details-combat-rating">
          <span className="label">Combat rating</span>
          <span className="figure tone-accent">{agent.combatRating}</span>
          <span className="figure secondary">
            · max {agent.restedCombatRating} · equipment{' '}
            <span
              className={
                (agent.equipmentCombatRating ?? 0) > 0
                  ? 'tone-good'
                  : (agent.equipmentCombatRating ?? 0) < 0
                    ? 'tone-bad'
                    : undefined
              }
            >
              {(agent.equipmentCombatRating ?? 0) > 0
                ? '+'
                : (agent.equipmentCombatRating ?? 0) < 0
                  ? '−'
                  : ''}
              {Math.abs(agent.equipmentCombatRating ?? 0)}
            </span>
          </span>
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
