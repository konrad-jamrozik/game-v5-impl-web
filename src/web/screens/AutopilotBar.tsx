/**
 * The Autopilot controls in the footer of the Side panel: engage an Autopilot AI under an Autopilot limit, watch its
 * progress, and disengage it. CSCR, Side panel: they are collapsed to one row until the Player expands them.
 */
import { useEffect, useState } from 'react';
import type { AutopilotLimit, DisengagementResult } from '../../engine/index.ts';
import {
  autopilotSettings,
  permittedAutopilotTurns,
  shownAutopilotAi,
  useAutopilotControls,
} from '../autopilot-controls.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Button } from '../ui.tsx';

const REASONS: Record<string, string> = {
  limitReached: 'its limit was reached',
  disengagedByController: 'you stopped it',
  campaignEnded: 'the Campaign ended',
  aiFailed: 'the Autopilot AI failed',
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** CSCR, Autopilot controls: the line that tells the Player, in plain words, why the Autopilot engagement ended. */
export function disengagementLine(result: DisengagementResult): string {
  const { reason, progress, detail } = result;
  const actions = count(progress.playerActions, 'Player action', 'Player actions');
  if (reason === 'advanceTurnWithheld') {
    return progress.playerActions === 0
      ? 'Autopilot has nothing more to do this Turn.'
      : `Autopilot finished this Turn's actions: ${actions}. Advancing the Turn is up to you.`;
  }
  const turns = count(progress.turnAdvancements, 'Turn advanced', 'Turns advanced');
  return (
    `Autopilot disengaged because ${REASONS[reason] ?? reason}: ${actions}, ${turns}.` +
    (detail === null ? '' : ` ${detail}`)
  );
}

/** Identifies the Current world state well enough to tell that it changed. */
function worldStateKey(snapshot: Snapshot): string {
  const { status, timeline } = snapshot;
  return [status.campaignId, status.turn, timeline?.timelineEntries, timeline?.undoneActions].join('/');
}

export function AutopilotBar({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const listed = session.autopilot.listAutopilotAis();
  const ais = listed.ok ? listed.value : [];
  // CSCR, Autopilot controls: whether they are expanded and the chosen Autopilot AI are kept for the rest of the
  // Session.
  const [controls, keep] = useAutopilotControls();
  const { expanded } = controls;
  // CSCR, Autopilot settings: the Turns field shows Autopilot Turns and stores it whenever the Player leaves it holding
  // a permitted value; leaving it holding any other text shows Autopilot Turns again.
  const { turns: storedTurns } = autopilotSettings(snapshot.configuration.settings);
  const [draft, setDraft] = useState<{ from: number; text: string } | null>(null);
  const turnsText = draft !== null && draft.from === storedTurns ? draft.text : String(storedTurns);
  const turns = permittedAutopilotTurns(turnsText) ?? storedTurns;
  const leaveTurns = () => {
    setDraft(null);
    const typed = permittedAutopilotTurns(turnsText);
    if (typed !== null && typed !== storedTurns) {
      act(() => session.globalConfiguration.set('autopilotTurns', typed));
    }
  };
  const aiId = shownAutopilotAi(
    controls.aiId,
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

  // The end-of-engagement line stays until Autopilot is engaged again or the World state changes.
  const finished =
    active === null && snapshot.autopilot?.status === 'ended' ? snapshot.autopilot.disengagement : null;
  const here = worldStateKey(snapshot);
  const [line, setLine] = useState<{ id: string; at: string; open: boolean } | null>(null);
  useEffect(() => {
    if (finished === null) {
      return;
    }
    if (line?.id !== finished.engagementId) {
      setLine({ id: finished.engagementId, at: here, open: true });
    } else if (line.open && line.at !== here) {
      setLine({ ...line, open: false });
    }
  }, [finished, here, line]);
  const shownLine =
    finished !== null && line?.id === finished.engagementId && line.open && line.at === here
      ? disengagementLine(finished)
      : null;

  const engage = (limit: AutopilotLimit) => {
    void run(() => session.autopilot.engage(aiId, limit));
  };

  const toggle = (
    <button
      type="button"
      className="autopilot-toggle"
      aria-expanded={expanded}
      data-testid="autopilot-toggle"
      data-sound="none"
      onClick={() => {
        keep({ expanded: !expanded });
      }}
    >
      Autopilot {expanded ? '▾' : '▸'}
    </button>
  );
  const engaged =
    active === null ? null : (
      <>
        <span className="pulse" data-testid="autopilot-active">
          Engaged: {progress?.playerActions ?? 0} actions, {progress?.turnAdvancements ?? 0} Turns
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
  const ending =
    shownLine === null ? null : (
      <span className="muted small" data-testid="autopilot-ended">
        {shownLine}
      </span>
    );

  if (!expanded) {
    return (
      <section className="autopilot autopilot-collapsed" aria-label="Autopilot" data-testid="autopilot-bar">
        {toggle}
        {engaged ?? ending}
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
          keep({ aiId: event.target.value });
        }}
      >
        {ais.map((ai) => (
          <option key={ai.autopilotAiId} value={ai.autopilotAiId}>
            {ai.name}
          </option>
        ))}
      </select>
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
        onClick={() => {
          engage({ kind: 'turnActions' });
        }}
      >
        This Turn&apos;s actions
      </Button>
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
            engage({ kind: 'turnAdvancements', count: turns });
          }}
        >
          Turns
        </Button>
      </label>
      {engaged ?? ending ?? (
        <span className="muted small">
          The Autopilot AI plays for you through the same Player actions you have.
        </span>
      )}
    </section>
  );
}
