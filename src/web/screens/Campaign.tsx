/**
 * CSCR: the Campaign screen. The status bar spans the top; the Side panel on the right holds the navigation to every
 * Detail view, the compact Situation panel, and the Autopilot footer; the Globe stage fills the rest, and the open
 * Detail view covers it. The globe, a decoration, is drawn in the Globe stage behind every Detail view.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AutosaveStatus, CurrentStateView } from '../../engine/index.ts';
import { PLACE_NAME_KEY, PlaceContext, type PlaceContextValue } from '../place.tsx';
import { playSound } from '../sound-player.ts';
import {
  backLabel,
  closeReturnsTo,
  follow,
  fromTurnSummary,
  goBack,
  TURN_SUMMARY,
  type Place,
  type ViewTrail,
} from '../view-trail.ts';
import { SOUND } from '../sounds.ts';
import { undoRedoStep } from '../undo-redo.ts';
import { activeInvestigationRows, leadsToInvestigate } from '../situation.ts';
import { act, leaveCampaign, run, theEngine, type Snapshot } from '../store.ts';
import { showsTurnSummary, turnSummary, turnSummaryHasContent } from '../turn-summary.ts';
import { Button, CloseControl, Fact, Meter, typingIn, Grid } from '../ui.tsx';
import { turnsSinceLastFactionActivity } from '../faction-activity.ts';
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
import { SettingsDialog } from './SettingsPanel.tsx';
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
  ['U / R', 'Undo / redo: one action, or one Turn when no action of this Turn is left'],
  ['1 to 8', 'Open or close a Detail view'],
  ['Esc', 'Close the topmost open view, or go back to the place a Detail view was reached from'],
  ['H', 'Hire an Agent'],
  ['S / C / T', 'Assign the selected Agents to Standby, Contracting, Training'],
  ['A', 'Select every Agent that can be assigned'],
  ['`', 'Developer tools'],
  ['?', 'Keyboard shortcuts'],
] as const;

/** CSCR, Undo and redo: the label of each button for an Action step and for a Turn step. */
const STEP_LABELS = {
  undo: { action: 'Undo Action', turn: 'Undo Turn' },
  redo: { action: 'Redo Action', turn: 'Redo Turn' },
} as const;

/** The open Detail view, and the item a Situation panel or Turn report item selected in it. */
interface OpenView {
  readonly id: DetailViewId;
  readonly item: string | null;
  /** Changes whenever an item is shown, so that the Detail view starts again with that item selected. */
  readonly serial: number;
  /** CSCR, View trail, Go back: what the place shown again remembered, and its scroll position. */
  readonly restored: Readonly<Record<string, unknown>>;
  readonly scrollTop: number;
}

const NOTHING_RESTORED: Readonly<Record<string, unknown>> = {};

/** CSCR, View trail: a place is a Detail view's, or the Turn summary's together with the place it was shown over. */
type TrailId = DetailViewId | typeof TURN_SUMMARY;

export function Campaign({ snapshot, state }: { snapshot: Snapshot; state: CurrentStateView }) {
  const { session, player } = theEngine();
  const [open, setOpen] = useState<OpenView | null>(null);
  // CSCR, View trail: empty whenever the Campaign screen is shown anew, e.g. after a Campaign is loaded.
  const [trail, setTrail] = useState<ViewTrail<TrailId>>([]);
  const live = useRef<Record<string, unknown>>({});
  // CSCR, View trail, New Turn: the View trail is emptied, and the open place stays open, when the Turn changes.
  const [trailTurn, setTrailTurn] = useState(state.turn);
  if (trailTurn !== state.turn) {
    setTrailTurn(state.turn);
    setTrail([]);
  }
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
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

  // TSUM, Showing and dismissing: the Player reopens the Turn summary from the Turn Report View, at any time.
  const [reopened, setReopened] = useState(false);
  const summaryOpen =
    !autopilotActive &&
    (showsTurnSummary(requestedTurn, snapshot.report) ||
      (reopened && snapshot.report !== null && turnSummaryHasContent(snapshot.report)));
  const dismissSummary = () => {
    setRequestedTurn(null);
    setReopened(false);
  };

  const advance = () => {
    const ending = state.turn;
    const audible = !autopilotActive && actions?.advanceTurn.available === true;
    // Set before the Advance turn commits, so that the Turn summary appears in the same render as its new Turn.
    setRequestedTurn(ending);
    void run(() => player.actions.advanceTurn()).then(() => {
      const report = player.queries.getTurnReport();
      // SOUNDS, Turn summary: the Advance turn plays one Sound, chosen when it ends: interesting-turn-summary at
      // once as the Turn summary appears, and main-click otherwise.
      if (!report.ok || !showsTurnSummary(ending, report.value)) {
        setRequestedTurn(null);
        if (audible) {
          playSound(SOUND.main);
        }
      } else if (audible) {
        playSound(SOUND.turnSummary);
      }
    });
  };

  /** Opens a place afresh, or shows a place of the View trail again as it was left. */
  const openPlace = (
    id: DetailViewId,
    item: string | null,
    restored: Readonly<Record<string, unknown>> = NOTHING_RESTORED,
    scrollTop = 0,
  ) => {
    live.current = {};
    setOpen((current) => ({ id, item, serial: (current?.serial ?? 0) + 1, restored, scrollTop }));
  };

  /** CSCR, View trail: the place the open Detail view shows, as it would be added to the View trail. */
  const shownPlace = (): Place<DetailViewId> | null => {
    if (open === null) {
      return null;
    }
    const name = live.current[PLACE_NAME_KEY];
    const body = document.querySelector<HTMLElement>(`[data-testid="view-${open.id}"] .detail-body`);
    return {
      id: open.id,
      item: open.item,
      memo: { ...live.current },
      scrollTop: body?.scrollTop ?? 0,
      name:
        typeof name === 'string' ? name : (DETAIL_VIEWS.find((view) => view.id === open.id)?.name ?? open.id),
    };
  };
  /** CSCR, View trail, Follow: the place the Player leaves is added to the end of the View trail. */
  const followFrom = () => {
    const left = shownPlace();
    if (left !== null) {
      setTrail((current) => follow(current, left));
    }
  };
  /** Shows a place of the View trail again as it was left, or the globe for null. */
  const showPlace = (place: Place<TrailId> | null | undefined) => {
    if (place === null || place === undefined || place.id === TURN_SUMMARY) {
      setOpen(null);
    } else {
      openPlace(place.id, place.item, place.memo, place.scrollTop);
    }
  };
  /** CSCR, View trail: the Turn summary shows again, over the place it was shown over. */
  const showSummaryAgain = (summary: Place<TrailId>) => {
    showPlace(summary.under);
    setReopened(true);
  };
  /** CSCR, View trail, Go back: the last place leaves the View trail and is shown as the Player left it. */
  const back = () => {
    const step = goBack(trail);
    if (step !== null) {
      setTrail(step.trail);
      if (step.place.id === TURN_SUMMARY) {
        showSummaryAgain(step.place);
      } else {
        showPlace(step.place);
      }
    }
  };
  /**
   * CSCR, View trail, From the Turn summary: the Turn summary closes, the Turn Report View opens, showing `restored`,
   * and the View trail holds the Turn summary, over the place it was shown over, as its only place.
   */
  const openFromSummary = (restored: Readonly<Record<string, unknown>>) => {
    setTrail(fromTurnSummary<DetailViewId>(shownPlace()));
    openPlace('report', null, restored);
    dismissSummary();
  };

  /**
   * CSCR, Side panel: selecting the button of the open Detail view closes it, any other opens its Detail view; each
   * empties the View trail.
   */
  const toggleView = (id: DetailViewId) => {
    setTrail([]);
    if (open?.id === id) {
      setOpen(null);
    } else {
      openPlace(id, null);
    }
  };

  const placeOf = (target: SituationTarget | ReportTarget): { id: DetailViewId; item: string | null } =>
    target.kind === 'lead'
      ? { id: 'leads', item: target.lead }
      : target.kind === 'missionSite'
        ? { id: 'missions', item: target.missionSite }
        : { id: 'agents', item: null };

  /**
   * SITP: selecting an item opens the Detail view that details it, with that item selected. CSCR, View trail, Start
   * afresh: opened from outside the open Detail view, it empties the View trail.
   */
  const show = (target: SituationTarget) => {
    const to = placeOf(target);
    setTrail([]);
    openPlace(to.id, to.item);
  };

  /** TRVIEW: selecting an item opens the Detail view that details it, with it selected, as a Follow. */
  const followTo = (target: ReportTarget) => {
    const to = placeOf(target);
    followFrom();
    openPlace(to.id, to.item);
  };

  const placeContext: PlaceContextValue = {
    restored: open?.restored ?? NOTHING_RESTORED,
    restoredScrollTop: open?.scrollTop ?? 0,
    live,
    follow: followFrom,
    back: backLabel(trail) === null ? null : { label: backLabel(trail) ?? '', go: back },
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
      // SOUNDS, When Sounds play: a key that does what a button does plays that button's Sound; opening plays a
      // Main click and closing a Go back.
      const toggled = (wasOpen: boolean) => {
        playSound(wasOpen ? SOUND.back : SOUND.main);
      };
      // While the Turn summary is open, the screen behind it takes no shortcut; Escape dismisses it.
      if (summaryOpen) {
        if (key === 'escape') {
          playSound(SOUND.back);
          dismissSummary();
          event.preventDefault();
        }
        return;
      }
      // GUI, Settings panel: while it is open over its Scrim, the screen behind takes no shortcut; Escape closes it.
      if (settings) {
        if (key === 'escape') {
          playSound(SOUND.back);
          setSettings(false);
          event.preventDefault();
        }
        return;
      }
      const numbered = DETAIL_VIEWS[Number(key) - 1];
      if (numbered !== undefined) {
        toggled(open?.id === numbered.id);
        toggleView(numbered.id);
      } else if (key === '`') {
        toggled(drawer);
        setDrawer((on) => !on);
      } else if (key === '?') {
        toggled(help);
        setHelp((on) => !on);
      } else if (key === 'escape') {
        // VIS, Close controls: Escape does what the close control of the topmost open view does. SOUNDS, Go back:
        // Escape with nothing to close plays no Sound.
        if (drawer) {
          playSound(SOUND.back);
          setDrawer(false);
        } else if (help) {
          playSound(SOUND.back);
          setHelp(false);
        } else if (open !== null) {
          // VIS, Close controls, and CSCR, View trail: in a Detail view that shows a Back control, Escape does what
          // the Back control does; with an empty View trail it closes the Detail view.
          playSound(SOUND.back);
          if (trail.length > 0) {
            back();
          } else {
            close();
          }
        }
      } else if (key === 'a') {
        setPicked(new Set(actions?.assignableAgents ?? []));
      } else if (autopilotActive) {
        return;
      } else if (key === 'n') {
        advance();
      } else if (key === 'u') {
        if (steps.undo !== null) {
          playSound(SOUND.main);
        }
        takeStep('undo');
      } else if (key === 'r') {
        if (steps.redo !== null) {
          playSound(SOUND.main);
        }
        takeStep('redo');
      } else if (key === 'h') {
        if (actions?.hireAgent.available === true) {
          playSound(SOUND.main);
        }
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

  /**
   * CSCR, Undo and redo: each button takes an Action step while Action navigation is available, and otherwise a Turn
   * step through Autosave navigation; null when neither is available.
   */
  const steps = {
    undo: undoRedoStep('undo', timeline?.canUndoAction === true, autosaves?.undoToAutosave ?? null),
    redo: undoRedoStep('redo', timeline?.canRedoAction === true, autosaves?.redoToAutosave ?? null),
  };
  const takeStep = (which: 'undo' | 'redo') => {
    const step = steps[which];
    if (step === null || autopilotActive) {
      return;
    }
    if (which === 'undo') {
      act(() => (step.form === 'action' ? session.timeline.undoAction() : session.timeline.undoToAutosave()));
    } else {
      act(() => (step.form === 'action' ? session.timeline.redoAction() : session.timeline.redoToAutosave()));
    }
  };

  /** CSCR, Detail views: the counts the navigation buttons show. */
  const counts: Partial<Record<DetailViewId, number>> = {
    missions: state.missionSites.filter((site) => site.lifecycle === 'Active').length,
    leads: activeInvestigationRows(state).length + leadsToInvestigate(state).length,
    agents: state.agency.servingAgents,
  };
  /**
   * CSCR, View trail, Close: the View trail is emptied when the open Detail view closes, which shows the globe, or the
   * Turn summary again when it is the first place of the View trail.
   */
  function close() {
    const summary = closeReturnsTo(trail);
    setTrail([]);
    if (summary === null) {
      setOpen(null);
    } else {
      showSummaryAgain(summary);
    }
  }

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
          {/* CSCR, Status bar values, 6: its label may wrap onto two lines, so the controls keep one row. */}
          <div className="fact fact-wrapping">
            <span className="fact-label">Turns since last enemy activity</span>
            <span className="fact-value" data-testid="turns-since-faction-activity">
              {turnsSinceLastFactionActivity(state.turn, [
                ...state.missionSites,
                ...(snapshot.history?.retained.missionSites ?? []),
              ])}
            </span>
          </div>
        </div>
        <div className="status-actions">
          {(['undo', 'redo'] as const).map((which) => {
            const step = steps[which];
            return (
              <Button
                key={which}
                kind={step?.form === 'turn' ? 'weighty' : 'plain'}
                className="undo-redo"
                shortcut={which === 'undo' ? 'U' : 'R'}
                testId={which}
                tooltip={step?.tooltip}
                disabledReason={
                  locked ??
                  (step === null ? (which === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.') : null)
                }
                onClick={() => {
                  takeStep(which);
                }}
              >
                {/* CSCR, Undo and redo: the button keeps the width of its wider label. */}
                <span className="label-swap">
                  <span className={step?.form === 'turn' ? 'label-off' : ''}>
                    {STEP_LABELS[which].action}
                  </span>
                  <span className={step?.form === 'turn' ? '' : 'label-off'}>{STEP_LABELS[which].turn}</span>
                </span>
              </Button>
            );
          })}
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
              void leaveCampaign();
            }}
          >
            Main menu
          </Button>
          <Button
            kind="primary"
            main
            shortcut="N"
            testId="advance-turn"
            sound="none"
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
            <PlaceContext value={placeContext}>
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
                onShow={followTo}
                onOpenSummary={() => {
                  setReopened(true);
                }}
                onClose={close}
              />
            </PlaceContext>
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
                        data-sound={open?.id === view.id ? 'back' : 'main'}
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
            {/* CSCR, Side panel: the bottom row holds the Music control and, at its right end, the Settings button. */}
            <div className="side-footer-row">
              <MusicControl snapshot={snapshot} />
              <button
                type="button"
                className="btn btn-plain settings-button"
                aria-label="Settings"
                title="Settings"
                data-testid="open-settings"
                onClick={() => {
                  setSettings(true);
                }}
              >
                <Cogwheel />
              </button>
            </div>
          </footer>
        </aside>
      </div>

      {settings ? (
        <SettingsDialog
          snapshot={snapshot}
          onClose={() => {
            setSettings(false);
          }}
          onShortcuts={() => {
            setSettings(false);
            setHelp(true);
          }}
          onDeveloper={() => {
            setSettings(false);
            setDrawer(true);
          }}
        />
      ) : null}

      {help ? (
        <div className="help" role="dialog" aria-labelledby="shortcuts-title">
          <header className="view-head">
            <h3 id="shortcuts-title">Keyboard shortcuts</h3>
          </header>
          <CloseControl
            testId="close-shortcuts"
            onClose={() => {
              setHelp(false);
            }}
          />
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
            openFromSummary(NOTHING_RESTORED);
          }}
          onOpenCombat={(mission) => {
            // TSUM, Mission cards: the Turn Report View opens with that Mission's Combat report one step away.
            openFromSummary({ combat: mission, logOpen: false });
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
  onShow: (target: ReportTarget) => void;
  onOpenSummary: () => void;
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
      return (
        <TurnReportView
          snapshot={snapshot}
          state={state}
          onOpen={props.onShow}
          onOpenSummary={props.onOpenSummary}
          onClose={onClose}
        />
      );
    case 'history':
      return <HistoryView snapshot={snapshot} onClose={onClose} />;
    case 'charts':
      return <ChartsView snapshot={snapshot} onClose={onClose} />;
    case 'compendium':
      return <CompendiumView snapshot={snapshot} state={state} onClose={onClose} />;
  }
}

/** CSCR, Side panel: the cogwheel of the Settings button. */
function Cogwheel() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function siteArchetypeName(snapshot: Snapshot, archetype: string): string {
  return snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
}
