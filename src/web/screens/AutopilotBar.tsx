/**
 * The Autopilot controls in the footer of the Side panel: engage an Autopilot AI under an Autopilot limit, watch its
 * progress, and disengage it. CSCR, Side panel: they are collapsed to one row until the Player expands them.
 */
import { useState } from 'react';
import type { AutopilotLimit } from '../../engine/index.ts';
import { autopilotSettings, permittedAutopilotTurns, shownAutopilotAi } from '../autopilot-controls.ts';
import { groupDigits } from '../format.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Button } from '../ui.tsx';

/**
 * `onOneTurn` is called as the Turns button engages with a count of 1, so that TSUM, Showing and dismissing, shows the
 * Turn summary of that Advance turn once the engagement ends.
 */
export function AutopilotBar({ snapshot, onOneTurn }: { snapshot: Snapshot; onOneTurn: () => void }) {
  const { session } = theEngine();
  const listed = session.autopilot.listAutopilotAis();
  const ais = listed.ok ? listed.value : [];
  // CSCR, Autopilot settings: whether the controls are expanded and the chosen Autopilot AI are Global configuration
  // settings, kept whatever Campaign is created or loaded and in every later Session.
  const { turns: storedTurns, expanded, aiId: chosenAi } = autopilotSettings(snapshot.configuration.settings);
  // CSCR, Autopilot settings: the Turns field shows Autopilot Turns and stores it whenever the Player leaves it holding
  // a permitted value; leaving it holding any other text shows Autopilot Turns again.
  const [draft, setDraft] = useState<{ from: number; text: string } | null>(null);
  const turnsText = draft !== null && draft.from === storedTurns ? draft.text : String(storedTurns);
  const turns = permittedAutopilotTurns(turnsText) ?? storedTurns;
  const leaveTurns = () => {
    const typed = permittedAutopilotTurns(turnsText);
    if (typed === null || typed === storedTurns) {
      setDraft(null);
      return;
    }
    // The draft stays until Global configuration holds the typed number, which ends it, so that the Turns button,
    // pressed at once as the field loses the focus, engages with the number the field shows rather than the one
    // stored before; see CSCR, Autopilot controls, Turns.
    void run(async () => {
      const result = await session.globalConfiguration.set('autopilotTurns', typed);
      if (!result.ok) {
        setDraft(null);
      }
      return result;
    });
  };
  const aiId = shownAutopilotAi(
    chosenAi,
    ais.map((ai) => ai.autopilotAiId),
  );
  const active = snapshot.status.autopilot;
  const progress = snapshot.autopilot?.status === 'active' ? snapshot.autopilot.progress : null;
  const ended = snapshot.state?.ending !== null && snapshot.state?.ending !== undefined;
  const reason =
    active !== null
      ? 'Autopilot is engaged.'
      : ended
        ? 'The Campaign has ended.'
        : aiId === ''
          ? 'No Autopilot AI.'
          : null;

  // CSCR, Autopilot controls: when an Autopilot engagement ends, the controls show again what they show before any
  // engagement, with no account of its disengagement reason or Autopilot progress.
  const engage = (limit: AutopilotLimit) => {
    void run(() => session.autopilot.engage(aiId, limit));
  };

  const toggle = (
    <button
      type="button"
      className="autopilot-toggle"
      aria-expanded={expanded}
      data-testid="autopilot-toggle"
      // SOUNDS, Select click, Expand or collapse: as the Collapse button of the Music control.
      data-sound="select"
      onClick={() => {
        act(() => session.globalConfiguration.set('autopilotControlsExpanded', !expanded));
      }}
    >
      Autopilot {expanded ? '▾' : '▸'}
    </button>
  );
  const engaged =
    active === null ? null : (
      <>
        <span className="pulse" data-testid="autopilot-active">
          Engaged: {groupDigits(progress?.playerActions ?? 0)} actions,{' '}
          {groupDigits(progress?.turnAdvancements ?? 0)} Turns
        </span>
        <Button
          kind="danger"
          testId="autopilot-stop"
          onClick={() => {
            void run(() => session.autopilot.disengage(active.engagementId));
          }}
        >
          Stop
        </Button>
      </>
    );
  if (!expanded) {
    return (
      <section className="autopilot autopilot-collapsed" aria-label="Autopilot" data-testid="autopilot-bar">
        {toggle}
        {engaged}
      </section>
    );
  }

  return (
    <section className="autopilot" aria-label="Autopilot" data-testid="autopilot-bar">
      {toggle}
      {/* CSCR, Autopilot controls: the selector is disabled, with the reason as its tooltip, exactly when the engaging
          buttons are. */}
      <select
        aria-label="Autopilot AI"
        value={aiId}
        disabled={reason !== null}
        title={reason ?? undefined}
        onChange={(event) => {
          act(() => session.globalConfiguration.set('autopilotAi', event.target.value));
        }}
      >
        {ais.map((ai) => (
          <option key={ai.autopilotAiId} value={ai.autopilotAiId}>
            {ai.name}
          </option>
        ))}
      </select>
      {/* CSCR, Autopilot controls: One action and Turn actions side by side on one row. */}
      <div className="autopilot-pair">
        <Button
          testId="autopilot-single"
          disabledReason={reason}
          onClick={() => {
            engage({ kind: 'singleAction' });
          }}
        >
          One action
        </Button>
        <Button
          testId="autopilot-turn"
          disabledReason={reason}
          tooltip="Engage the Autopilot AI for this Turn's actions"
          onClick={() => {
            engage({ kind: 'turnActions' });
          }}
        >
          Turn actions
        </Button>
      </div>
      <label className="inline">
        <input
          type="number"
          min={1}
          step={1}
          aria-label="Number of Turns"
          data-testid="autopilot-turns"
          value={turnsText}
          disabled={active !== null}
          onChange={(event) => {
            setDraft({ from: storedTurns, text: event.target.value });
          }}
          onBlur={leaveTurns}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              leaveTurns();
            }
          }}
        />
        <Button
          testId="autopilot-many"
          disabledReason={reason}
          onClick={() => {
            if (turns === 1) {
              onOneTurn();
            }
            engage({ kind: 'turnAdvancements', count: turns });
          }}
        >
          Turns
        </Button>
      </label>
      {engaged ?? (
        <span className="muted small">
          The Autopilot AI plays for you through the same Player actions you have.
        </span>
      )}
    </section>
  );
}
