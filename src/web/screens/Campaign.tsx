/**
 * The Campaign screen: status bar, the Situation panel above the Agents grid on the left, tabbed panels on the right,
 * Autopilot bar below, and the Turn summary after an Advance turn the Player requested here.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AutosaveStatus, CurrentStateView } from '../../engine/index.ts';
import { confirmInterruption } from '../interruption.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { showsTurnSummary, turnSummary } from '../turn-summary.ts';
import { Badge, Button, Fact, Meter, typingIn } from '../ui.tsx';
import { AgencyPanel } from './AgencyPanel.tsx';
import { AgentsGrid } from './AgentsGrid.tsx';
import { AutopilotBar } from './AutopilotBar.tsx';
import { DeveloperDrawer } from './DeveloperDrawer.tsx';
import { HistoryPanel } from './HistoryPanel.tsx';
import { LeadsPanel } from './LeadsPanel.tsx';
import { MissionSitesPanel } from './MissionSitesPanel.tsx';
import { SituationPanel, type SituationTarget } from './SituationPanel.tsx';
import { TurnReportPanel } from './TurnReportPanel.tsx';
import { TurnSummary } from './TurnSummary.tsx';

const TABS = [
  { id: 'missions', name: 'Mission sites' },
  { id: 'leads', name: 'Leads' },
  { id: 'agency', name: 'Agency' },
  { id: 'report', name: 'Turn report' },
  { id: 'history', name: 'History' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const REASONS: Record<string, string> = {
  EveryFactionEliminated: 'every Faction is eliminated',
  PanicAtTheLimit: 'Panic reached its limit',
  MoneyBelowZero: 'money fell below zero',
};

const SHORTCUTS = [
  ['N', 'Advance turn'],
  ['U / R', 'Undo / redo one action'],
  ['1 to 5', 'Open a panel'],
  ['H', 'Hire an Agent'],
  ['S / C / T', 'Assign the selected Agents to Standby, Contracting, Training'],
  ['A', 'Select every Agent that can be assigned'],
  ['Esc', 'Clear the selection'],
  ['`', 'Developer drawer'],
  ['?', 'This list'],
] as const;

export function Campaign({ snapshot, state }: { snapshot: Snapshot; state: CurrentStateView }) {
  const { session, player } = theEngine();
  const [tab, setTab] = useState<TabId>('missions');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [autosaves, setAutosaves] = useState<AutosaveStatus | null>(null);
  /**
   * GUI, Turn summary: the Turn ended by the Advance turn the Player requested through this screen, until the Player
   * dismisses its Turn summary. Loading, Timeline navigation, and Autopilot never set it.
   */
  const [requestedTurn, setRequestedTurn] = useState<number | null>(null);
  /** The test ID of the item a Situation panel row asked to show, once its tab is rendered. */
  const [reveal, setReveal] = useState<string | null>(null);

  const actions = snapshot.actions;
  const timeline = snapshot.timeline;
  const autopilotActive = snapshot.status.autopilot !== null;
  const locked = autopilotActive ? 'Unavailable while Autopilot is engaged.' : null;

  // The selection holds only Agents that still serve.
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

  /** GUI, Situation panel: selecting a row shows that item where the Campaign screen details it; see DEC-041. */
  const show = (target: SituationTarget) => {
    if (target.kind === 'lead') {
      setTab('leads');
      setReveal(`lead-${target.lead}`);
    } else if (target.kind === 'missionSite') {
      setTab('missions');
      setReveal(`site-${target.missionSite}`);
    } else if (target.kind === 'agency') {
      setTab('agency');
      setReveal('training-cap');
    } else {
      setPicked(new Set(target.agents));
    }
  };

  useEffect(() => {
    if (reveal === null) {
      return;
    }
    const element = document.querySelector(`[data-testid="${reveal}"]`);
    setReveal(null);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      element.classList.add('shown');
      window.setTimeout(() => {
        element.classList.remove('shown');
      }, 1500);
    }
  }, [reveal, tab]);
  const order = (assignment: 'Standby' | 'Contracting' | 'Training') => {
    if (selected.length > 0 && confirmInterruption(state, selected)) {
      act(() => player.actions.assignAgents(selected, assignment));
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
      const index = Number(key) - 1;
      const numbered = TABS[index];
      if (numbered !== undefined) {
        setTab(numbered.id);
      } else if (key === '`') {
        setDrawer((open) => !open);
      } else if (key === '?') {
        setHelp((open) => !open);
      } else if (key === 'escape') {
        setPicked(new Set());
        setHelp(false);
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

  const activeSites = state.missionSites.filter((site) => site.lifecycle === 'Active').length;

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

      <div className="workspace">
        <div className="left-column">
          <SituationPanel
            state={state}
            assessmentThresholdPct={snapshot.gameData?.investigationParameters.assessmentThresholdPct ?? 0}
            onShow={show}
          />
          <AgentsGrid
            snapshot={snapshot}
            state={state}
            selected={selected}
            locked={locked}
            onSelect={(ids) => {
              setPicked(new Set(ids));
            }}
          />
        </div>
        <div className="panels">
          <nav className="tabs" role="tablist">
            {TABS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'tab tab-active' : 'tab'}
                data-testid={`tab-${item.id}`}
                onClick={() => {
                  setTab(item.id);
                }}
              >
                {item.name}
                <kbd>{index + 1}</kbd>
                {/* CSCR, Tabs: Mission sites shows the number of Active Mission sites. */}
                {item.id === 'missions' && activeSites > 0 ? (
                  <span className="count">{activeSites}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="panel" role="tabpanel">
            {tab === 'missions' ? (
              <MissionSitesPanel snapshot={snapshot} state={state} selected={selected} locked={locked} />
            ) : tab === 'leads' ? (
              <LeadsPanel snapshot={snapshot} state={state} selected={selected} locked={locked} />
            ) : tab === 'agency' ? (
              <AgencyPanel snapshot={snapshot} state={state} locked={locked} />
            ) : tab === 'report' ? (
              <TurnReportPanel snapshot={snapshot} />
            ) : (
              <HistoryPanel snapshot={snapshot} />
            )}
          </div>
        </div>
      </div>

      <AutopilotBar snapshot={snapshot} />

      <footer className="footer">
        <button
          type="button"
          className="link"
          onClick={() => {
            setHelp((open) => !open);
          }}
        >
          Keyboard shortcuts (?)
        </button>
        <button
          type="button"
          className="link"
          data-testid="open-developer"
          onClick={() => {
            setDrawer((open) => !open);
          }}
        >
          Developer (`)
        </button>
      </footer>

      {help ? (
        <div className="help" role="dialog" aria-label="Keyboard shortcuts">
          <table className="grid">
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
          </table>
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
            setTab('report');
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

function siteArchetypeName(snapshot: Snapshot, archetype: string): string {
  return snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
}
