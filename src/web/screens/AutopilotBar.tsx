/** The Autopilot bar: engage an Autopilot AI under an Autopilot limit, watch its progress, and disengage it. */
import { useState } from 'react';
import type { AutopilotLimit } from '../../engine/index.ts';
import { notify, run, theEngine, type Snapshot } from '../store.ts';
import { Button } from '../ui.tsx';

const REASONS: Record<string, string> = {
  limitReached: 'its limit was reached',
  disengagedByController: 'you stopped it',
  campaignEnded: 'the Campaign ended',
  aiFailed: 'the Autopilot AI failed',
};

export function AutopilotBar({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const listed = session.autopilot.listAutopilotAis();
  const ais = listed.ok ? listed.value : [];
  const [aiId, setAiId] = useState(ais[0]?.autopilotAiId ?? '');
  const [turns, setTurns] = useState(10);
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

  const engage = (limit: AutopilotLimit) => {
    void run(() => session.autopilot.engage(aiId, limit)).then(async (engaged) => {
      if (engaged === null) {
        return;
      }
      const result = await session.autopilot.whenDisengaged(engaged.engagementId);
      if (result.ok) {
        const { reason: why, progress: done, detail } = result.value;
        notify(
          why === 'aiFailed' ? 'error' : 'info',
          `Autopilot disengaged because ${REASONS[why] ?? why}: ${done.playerActions} Player actions, ` +
            `${done.turnAdvancements} Turns advanced.${detail === null ? '' : ` ${detail}`}`,
        );
      }
    });
  };

  return (
    <section className="autopilot" aria-label="Autopilot" data-testid="autopilot-bar">
      <strong>Autopilot</strong>
      <select
        aria-label="Autopilot AI"
        value={aiId}
        disabled={active !== null}
        onChange={(event) => {
          setAiId(event.target.value);
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
          engage({ kind: 'untilTurnAdvanced' });
        }}
      >
        Until the Turn advances
      </Button>
      <label className="inline">
        <input
          type="number"
          min={1}
          max={1000}
          aria-label="Number of Turns"
          data-testid="autopilot-turns"
          value={turns}
          disabled={active !== null}
          onChange={(event) => {
            setTurns(Math.max(1, Math.trunc(Number(event.target.value)) || 1));
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
      {active === null ? (
        <span className="muted small">The Autopilot AI plays for you through the same actions you have.</span>
      ) : (
        <>
          <span className="pulse" data-testid="autopilot-active">
            Engaged: {progress?.playerActions ?? 0} Player actions, {progress?.turnAdvancements ?? 0} Turns
            advanced
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
      )}
    </section>
  );
}
