/**
 * CSCR: the Campaign screen. The status bar spans the top; the Side panel on the right holds the navigation to every
 * Detail view, the compact Situation panel, and the Autopilot footer; the Globe stage fills the rest, and the open
 * Detail view covers it. The globe, a decoration, is drawn in the Globe stage behind every Detail view.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AutosaveStatus, CurrentStateView } from '../../engine/index.ts';
import { activeInvestigationRows, leadsToInvestigate } from '../situation.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { showsTurnSummary, turnSummary } from '../turn-summary.ts';
import { Badge, Button, Fact, Meter, typingIn, Grid } from '../ui.tsx';
import { AgentsView } from './AgentsView.tsx';
import { AutopilotBar } from './AutopilotBar.tsx';
import { ChartsView } from './ChartsView.tsx';
import { CompendiumView } from './CompendiumView.tsx';
import { DETAIL_VIEW_GROUPS, DETAIL_VIEWS, type DetailViewId } from './DetailView.tsx';
import { DeveloperDrawer } from './DeveloperDrawer.tsx';
import { MusicControl } from './MusicControl.tsx';
import { Globe } from './Globe.tsx';
import { HistoryView } from './HistoryView.tsx';
import { LeadsView } from './LeadsView.tsx';
import { MissionsView } from './MissionsView.tsx';
import { SituationPanel, type SituationTarget } from './SituationPanel.tsx';
import { TurnReportView, type ReportTarget } from './TurnReportView.tsx';
import { TurnSummary } from './TurnSummary.tsx';
import { UpgradesView } from './UpgradesView.tsx';

const REASONS: Record<string, string> = {
  EveryFactionEliminated: 'every Faction is eliminated',
  PanicAtTheLimit: 'Panic reached its limit',
  MoneyBelowZero: 'money fell below zero',
};

const SHORTCUTS = [
  ['N', 'Advance turn'],
  ['U / R', 'Undo / redo one action'],
  ['1 to 8', 'Open or close a Detail view'],
  ['Esc', 'Close the open Detail view'],
  ['H', 'Hire an Agent'],
  ['S / C / T', 'Assign the selected Agents to Standby, Contracting, Training'],
  ['A', 'Select every Agent that can be assigned'],
  ['`', 'Developer drawer'],
  ['?', 'This list'],
] as const;

/** The open Detail view, and the item a Situation panel or Turn report item selected in it. */
interface OpenView {
  readonly id: DetailViewId;
  readonly item: string | null;
  /** Changes whenever an item is shown, so that the Detail view starts again with that item selected. */
  readonly serial: number;
}

export function Campaign({ snapshot, state }: { snapshot: Snapshot; state: CurrentStateView }) {
  const { session, player } = theEngine();
  const [open, setOpen] = useState<OpenView | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [autosaves, setAutosaves] = useState<AutosaveStatus | null>(null);
  /**
   * GUI, Turn summary: the Turn ended by the Advance turn the Player requested through this screen, until the Player
   * dismisses its Turn summary. Loading, Timeline navigation, and Autopilot never set it.
   */
  const [requestedTurn, setRequestedTurn] = useState<number | null>(null);

  const actions = snapshot.actions;
  const timeline = snapshot.timeline;
  const autopilotActive = snapshot.status.autopilot !== null;
  const locked = autopilotActive ? 'Unavailable while Autopilot is engaged.' : null;

  // The selection of the Agents View holds only Agents that still serve.
  const selected = useMemo(
    () => state.agents.filter((agent) => picked.has(agent.id)).map((agent) => agent.id),
    [state.agents, picked],
  );

  useEffect(() => {
    let live = true;
    void session.timeline.getAutosaveStatus().then((result) => {
      if (live) {
        setAutosaves(result.ok ? result.value : null);
      }
    });
    return () => {
      live = false;
    };
  }, [session, snapshot.key]);

  const summaryOpen = !autopilotActive && showsTurnSummary(requestedTurn, snapshot.report);
  const dismissSummary = () => {
    setRequestedTurn(null);
  };

  const advance = () => {
    const ending = state.turn;
    // Set before the Advance turn commits, so that the Turn summary appears in the same render as its new Turn.
    setRequestedTurn(ending);
    void run(() => player.actions.advanceTurn()).then(() => {
      const report = player.queries.getTurnReport();
      if (!report.ok || !showsTurnSummary(ending, report.value)) {
        setRequestedTurn(null);
      }
    });
  };

  /** CSCR, Side panel: selecting the button of the open Detail view closes it, any other opens its Detail view. */
  const toggleView = (id: DetailViewId) => {
    setOpen((current) =>
      current?.id === id ? null : { id, item: null, serial: (current?.serial ?? 0) + 1 },
    );
  };
  const showItem = (id: DetailViewId, item: string | null) => {
    setOpen((current) => ({ id, item, serial: (current?.serial ?? 0) + 1 }));
  };

  /** SITP: selecting an item opens the Detail view that details it, with that item selected. */
  const show = (target: SituationTarget | ReportTarget) => {
    if (target.kind === 'lead') {
      showItem('leads', target.lead);
    } else if (target.kind === 'missionSite') {
      showItem('missions', target.missionSite);
    } else {
      showItem('agents', null);
    }
  };

  /** AVIEW, Header: a shortcut presses the Agents View button, which is enabled only when pressing it would succeed. */
  const order = (assignment: 'Standby' | 'Contracting' | 'Training') => {
    const button = document.querySelector<HTMLButtonElement>(
      `[data-testid="order-${assignment.toLowerCase()}"]`,
    );
    if (button !== null && !button.disabled) {
      button.click();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      // While the Turn summary is open, the screen behind it takes no shortcut; Escape dismisses it.
      if (summaryOpen) {
        if (key === 'escape') {
          dismissSummary();
          event.preventDefault();
        }
        return;
      }
      const numbered = DETAIL_VIEWS[Number(key) - 1];
      if (numbered !== undefined) {
        toggleView(numbered.id);
      } else if (key === '`') {
        setDrawer((on) => !on);
      } else if (key === '?') {
        setHelp((on) => !on);
      } else if (key === 'escape') {
        if (help) {
          setHelp(false);
        } else {
          setOpen(null);
        }
      } else if (key === 'a') {
        setPicked(new Set(actions?.assignableAgents ?? []));
      } else if (autopilotActive) {
        return;
      } else if (key === 'n') {
        advance();
      } else if (key === 'u') {
        act(() => session.timeline.undoAction());
      } else if (key === 'r') {
        act(() => session.timeline.redoAction());
      } else if (key === 'h') {
        act(() => player.actions.hireAgent());
      } else if (key === 's') {
        order('Standby');
      } else if (key === 'c') {
        order('Contracting');
      } else if (key === 't') {
        order('Training');
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const target = (t: AutosaveStatus['undoToAutosave']) =>
    t === null ? null : `${t.autosaveKind === 'turnEnd' ? 'end' : t.autosaveKind} of Turn ${t.turn}`;

  /** CSCR, Detail views: the counts the navigation buttons show. */
  const counts: Partial<Record<DetailViewId, number>> = {
    missions: state.missionSites.filter((site) => site.lifecycle === 'Active').length,
    leads: activeInvestigationRows(state).length + leadsToInvestigate(state).length,
    agents: state.agency.servingAgents,
  };
  const close = () => {
    setOpen(null);
  };

  return (
    <div className="campaign">
      <header className="statusbar">
        <div className="status-facts">
          <Fact label="Turn" testId="turn">
            {state.turn}
          </Fact>
          <div className="fact">
            <span className="fact-label">Money</span>
            <span className="fact-value">
              <span data-testid="money">{state.agency.money}</span>
              {/* VIS, Status bar: the projected change of a value follows it in Positive or Danger. */}
              <span className="fact-change tone-good" title="Projected income">
                +{state.agency.projectedIncome}
              </span>
              <span className="fact-change tone-bad" title="Projected upkeep">
                −{state.agency.projectedUpkeep}
              </span>
            </span>
          </div>
          <Fact label="Funding">{state.agency.funding}</Fact>
          <Fact label="Agents">
            {state.agency.servingAgents}/{state.agency.agentCap}
          </Fact>
          <div className="fact">
            <span className="fact-label">Panic</span>
            <span className="meter-figure" data-testid="panic">
              <span>
                {state.panic} / {state.panicLimit}%
              </span>
              <Meter value={state.panic} max={state.panicLimit} label={`Panic ${state.panic}%`} />
            </span>
          </div>
          <div className="fact">
            <span className="fact-label">Factions</span>
            <span className="fact-value factions">
              {state.factions.map((faction) => (
                <Badge key={faction.id} tone={faction.eliminated ? 'good' : 'warn'}>
                  {faction.name} · {faction.eliminated ? 'eliminated' : faction.activityLevel.name}
                </Badge>
              ))}
            </span>
          </div>
        </div>
        <div className="status-actions">
          <Button
            shortcut="U"
            testId="undo"
            disabledReason={
              locked ?? (timeline?.canUndoAction === true ? null : 'No action of this Turn to undo.')
            }
            onClick={() => {
              act(() => session.timeline.undoAction());
            }}
          >
            Undo
          </Button>
          <Button
            shortcut="R"
            testId="redo"
            disabledReason={locked ?? (timeline?.canRedoAction === true ? null : 'No Undone action to redo.')}
            onClick={() => {
              act(() => session.timeline.redoAction());
            }}
          >
            Redo
          </Button>
          <Button
            testId="autosave-back"
            disabledReason={locked ?? (autosaves?.undoToAutosave == null ? 'No earlier Autosave.' : null)}
            onClick={() => {
              act(() => session.timeline.undoToAutosave());
            }}
          >
            ⏮ {target(autosaves?.undoToAutosave ?? null) ?? 'Earlier Autosave'}
          </Button>
          <Button
            testId="autosave-forward"
            disabledReason={locked ?? (autosaves?.redoToAutosave == null ? 'No later Autosave.' : null)}
            onClick={() => {
              act(() => session.timeline.redoToAutosave());
            }}
          >
            {target(autosaves?.redoToAutosave ?? null) ?? 'Later Autosave'} ⏭
          </Button>
          <Button
            testId="save"
            disabledReason={locked}
            onClick={() => {
              act(() => session.saves.save(), 'Campaign saved.');
            }}
          >
            Save
          </Button>
          <Button
            testId="to-menu"
            disabledReason={locked}
            onClick={() => {
              act(() => session.campaign.close());
            }}
          >
            Main menu
          </Button>
          <Button
            kind="primary"
            main
            shortcut="N"
            testId="advance-turn"
            disabledReason={
              locked ??
              (actions?.advanceTurn.available === true
                ? null
                : (actions?.advanceTurn.message ?? 'Unavailable.'))
            }
            onClick={advance}
          >
            Advance turn
          </Button>
        </div>
      </header>

      {state.ending === null ? null : (
        <div
          className={`ending ending-${state.ending.ending.toLowerCase()}`}
          data-testid="ending"
          role="status"
        >
          <strong>{state.ending.ending}</strong> in Turn {state.ending.turn}:{' '}
          {state.ending.reasons.map((reason) => REASONS[reason] ?? reason).join(' and ')}. The Campaign has
          ended; you can still look around, undo, or return to an Autosave.
        </div>
      )}

      <div className="campaign-body">
        <main className="globe-stage" data-testid="globe-stage">
          <Globe covered={open !== null} />
          {open === null ? null : (
            <OpenDetailView
              key={`${open.id}-${open.serial}`}
              open={open}
              snapshot={snapshot}
              state={state}
              locked={locked}
              selected={selected}
              onSelect={(ids) => {
                setPicked(new Set(ids));
              }}
              onShow={show}
              onClose={close}
            />
          )}
        </main>

        <aside className="side-panel" aria-label="Side panel">
          <nav className="side-nav">
            {DETAIL_VIEW_GROUPS.map((group) => (
              <div key={group.name} className="nav-group">
                <span className="label">{group.name}</span>
                <div className="nav-buttons">
                  {group.views.map((view) => {
                    const count = counts[view.id];
                    const index = DETAIL_VIEWS.findIndex((item) => item.id === view.id) + 1;
                    return (
                      <button
                        key={view.id}
                        type="button"
                        className={`nav-button${open?.id === view.id ? ' nav-button-open' : ''}`}
                        aria-pressed={open?.id === view.id}
                        title={`Shortcut: ${index}`}
                        data-testid={`nav-${view.id}`}
                        onClick={() => {
                          toggleView(view.id);
                        }}
                      >
                        <span>{view.name}</span>
                        {count === undefined || count === 0 ? null : <span className="count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <SituationPanel state={state} onShow={show} />

          <footer className="side-footer">
            <AutopilotBar snapshot={snapshot} />
            <div className="side-links">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setHelp((on) => !on);
                }}
              >
                Shortcuts (?)
              </button>
              <button
                type="button"
                className="link"
                data-testid="open-developer"
                onClick={() => {
                  setDrawer((on) => !on);
                }}
              >
                Developer (`)
              </button>
            </div>
            <MusicControl snapshot={snapshot} />
          </footer>
        </aside>
      </div>

      {help ? (
        <div className="help" role="dialog" aria-label="Keyboard shortcuts">
          <Grid widths={['140px', '440px']}>
            <tbody>
              {SHORTCUTS.map(([keys, what]) => (
                <tr key={keys}>
                  <th scope="row">
                    <kbd>{keys}</kbd>
                  </th>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </Grid>
        </div>
      ) : null}

      {summaryOpen && snapshot.report !== null ? (
        <TurnSummary
          model={turnSummary(snapshot.report, state, snapshot.history, (archetype) =>
            siteArchetypeName(snapshot, archetype),
          )}
          currentTurn={state.turn}
          onDismiss={dismissSummary}
          onOpenReport={() => {
            showItem('report', null);
            dismissSummary();
          }}
        />
      ) : null}

      {drawer ? (
        <DeveloperDrawer
          snapshot={snapshot}
          onClose={() => {
            setDrawer(false);
          }}
        />
      ) : null}
    </div>
  );
}

function OpenDetailView(props: {
  open: OpenView;
  snapshot: Snapshot;
  state: CurrentStateView;
  locked: string | null;
  selected: readonly string[];
  onSelect: (ids: readonly string[]) => void;
  onShow: (target: SituationTarget | ReportTarget) => void;
  onClose: () => void;
}) {
  const { open, snapshot, state, locked, onClose } = props;
  switch (open.id) {
    case 'missions':
      return (
        <MissionsView
          snapshot={snapshot}
          state={state}
          locked={locked}
          initial={open.item}
          onClose={onClose}
        />
      );
    case 'leads':
      return (
        <LeadsView snapshot={snapshot} state={state} locked={locked} initial={open.item} onClose={onClose} />
      );
    case 'agents':
      return (
        <AgentsView
          snapshot={snapshot}
          state={state}
          selected={props.selected}
          locked={locked}
          onSelect={props.onSelect}
          onClose={onClose}
        />
      );
    case 'upgrades':
      return <UpgradesView snapshot={snapshot} state={state} locked={locked} onClose={onClose} />;
    case 'report':
      return <TurnReportView snapshot={snapshot} state={state} onOpen={props.onShow} onClose={onClose} />;
    case 'history':
      return <HistoryView snapshot={snapshot} onClose={onClose} />;
    case 'charts':
      return <ChartsView snapshot={snapshot} onClose={onClose} />;
    case 'compendium':
      return <CompendiumView snapshot={snapshot} state={state} onClose={onClose} />;
  }
}

function siteArchetypeName(snapshot: Snapshot, archetype: string): string {
  return snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
}
