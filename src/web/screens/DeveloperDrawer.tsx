/** The Developer drawer: Dev mode, cheat operations, random outcome overrides, and full Campaign state inspection. */
import { useState } from 'react';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, Section } from '../ui.tsx';

function parse(text: string): string | number | boolean {
  if (text === 'true' || text === 'false') {
    return text === 'true';
  }
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

export function DeveloperDrawer({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const { session, developer } = theEngine();
  const devMode = snapshot.status.devMode;
  const [money, setMoney] = useState(1000);
  const [agents, setAgents] = useState(4);
  const [outcome, setOutcome] = useState('');
  const [value, setValue] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const off = devMode
    ? snapshot.status.autopilot === null
      ? null
      : 'Unavailable while Autopilot is engaged.'
    : 'Enable Dev mode first.';
  const inspection = devMode && inspecting ? developer.queries.getCampaignState() : null;

  return (
    <aside className="drawer" aria-label="Developer" data-testid="developer-drawer">
      <header className="section-head">
        <h3>Developer</h3>
        <Button onClick={onClose}>Close</Button>
      </header>
      <label className="inline">
        <input
          type="checkbox"
          data-testid="dev-mode"
          checked={devMode}
          onChange={() => {
            act(() => (devMode ? session.developer.disable() : session.developer.enable()));
          }}
        />
        Dev mode
      </label>
      <p className="muted small">
        Dev mode gives access to cheats and to hidden values. It is off whenever a Session starts. Campaign
        seed: {devMode ? (snapshot.status.campaignSeed ?? '-') : 'hidden'}.
      </p>

      <Section title="Cheats">
        <label className="inline">
          <input
            type="number"
            aria-label="Money to add"
            data-testid="dev-money"
            value={money}
            onChange={(event) => {
              setMoney(Number(event.target.value));
            }}
          />
          <Button
            testId="dev-add-money"
            disabledReason={off}
            onClick={() => {
              act(() => developer.actions.addMoney(money));
            }}
          >
            Add money
          </Button>
        </label>
        <label className="inline">
          <input
            type="number"
            aria-label="Agents to add"
            data-testid="dev-agents"
            value={agents}
            onChange={(event) => {
              setAgents(Number(event.target.value));
            }}
          />
          <Button
            testId="dev-add-agents"
            disabledReason={off}
            onClick={() => {
              act(() => developer.actions.addAgents(agents));
            }}
          >
            Add Agents
          </Button>
        </label>
      </Section>

      <Section title="Random outcome override">
        <p className="muted small">
          Names, e.g. <code>combat.hit.agent-2</code>, <code>combat.damage.enemy-9</code>,{' '}
          <code>investigation.completion.investigation-7</code>,{' '}
          <code>faction.faction-1.operationInterval</code>. The value applies once, when that outcome is next
          decided.
        </p>
        <label className="field">
          <span>Random outcome</span>
          <input
            data-testid="dev-outcome"
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Value (true, false, a whole number, or an identifier)</span>
          <input
            data-testid="dev-value"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </label>
        <Button
          testId="dev-override"
          disabledReason={off}
          onClick={() => {
            act(
              () => developer.actions.overrideRandomOutcome(outcome.trim(), parse(value.trim())),
              'Override set.',
            );
          }}
        >
          Set override
        </Button>
      </Section>

      <Section title="Campaign state">
        <Button
          testId="dev-inspect"
          disabledReason={devMode ? null : 'Enable Dev mode first.'}
          onClick={() => {
            setInspecting((open) => !open);
          }}
        >
          {inspecting ? 'Hide' : 'Inspect'} full Campaign state
        </Button>
        {inspection === null ? null : inspection.ok ? (
          <pre className="inspect" data-testid="dev-state">
            {JSON.stringify(inspection.value, null, 1)}
          </pre>
        ) : (
          <p className="warning-text">{inspection.error.message}</p>
        )}
      </Section>
    </aside>
  );
}
