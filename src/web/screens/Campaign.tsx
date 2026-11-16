/** The Campaign screen: status bar, Agents grid on the left, tabbed panels on the right, Autopilot bar below. */
import { useEffect, useMemo, useState } from 'react';
import type { AutosaveStatus, CurrentStateView } from '../../engine/index.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Badge, Button, Fact, Meter, typingIn } from '../ui.tsx';
import { AgencyPanel } from './AgencyPanel.tsx';
import { AgentsGrid } from './AgentsGrid.tsx';
import { AutopilotBar } from './AutopilotBar.tsx';
import { DeveloperDrawer } from './DeveloperDrawer.tsx';
import { HistoryPanel } from './HistoryPanel.tsx';
import { LeadsPanel } from './LeadsPanel.tsx';
import { MissionSitesPanel } from './MissionSitesPanel.tsx';
import { TurnReportPanel } from './TurnReportPanel.tsx';

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

  const advance = () => {
    void run(() => player.actions.advanceTurn()).then((outcome) => {
      if (outcome !== null) {
        setTab('report');
      }
    });
  };
  const order = (assignment: 'Standby' | 'Contracting' | 'Training') => {
    if (selected.length > 0) {
      act(() => player.actions.assignAgents(selected, assignment));
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
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
        <AgentsGrid
          snapshot={snapshot}
          state={state}
          selected={selected}
          locked={locked}
          onSelect={(ids) => {
            setPicked(new Set(ids));
          }}
        />
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
                {item.id === 'missions' &&
                actions !== null &&
                actions.deployAgents.missionSites.length > 0 ? (
                  <span className="count">{actions.deployAgents.missionSites.length}</span>
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
