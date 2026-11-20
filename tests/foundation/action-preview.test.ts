/** PAPI, Action preview: `player.queries.previewAction(action)`. */
import { describe, expect, it } from 'vite-plus/test';
import type { Engine, PlayerActionRequest } from '../../src/engine/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';

async function campaign(): Promise<Engine> {
  const { engine } = await startEngine();
  ok(await engine.session.campaign.create({ seed: 'preview' }));
  return engine;
}

function agentIds(engine: Engine): string[] {
  return ok(engine.player.queries.getCurrentLiveWorldState()).agents.map((agent) => agent.id);
}

describe('PAPI, Action preview', () => {
  it('agrees with making the action at once, whether it succeeds or is rejected', async () => {
    const engine = await campaign();
    const [a1, a2] = agentIds(engine) as [string, string];
    const requests: PlayerActionRequest[] = [
      { name: 'assignAgents', args: { agents: [a1], assignment: 'Contracting' } },
      { name: 'assignAgents', args: { agents: [a2], assignment: 'Standby' } },
      { name: 'assignAgents', args: { agents: [], assignment: 'Training' } },
      { name: 'hireAgent', args: {} },
      { name: 'dismissAgents', args: { agents: [a1] } },
    ];
    for (const request of requests) {
      const preview = ok(engine.player.queries.previewAction(request));
      const actions = engine.player.actions as unknown as Record<
        string,
        (...args: unknown[]) => Promise<{ ok: boolean; error?: { reason: string | null; message: string } }>
      >;
      const before = JSON.stringify(ok(engine.player.queries.getCurrentLiveWorldState()));
      const result =
        request.name === 'assignAgents'
          ? await actions['assignAgents']!(request.args['agents'], request.args['assignment'])
          : request.name === 'dismissAgents'
            ? await actions['dismissAgents']!(request.args['agents'])
            : await actions['hireAgent']!();
      expect(result.ok).toBe(preview.available);
      if (!result.ok) {
        expect(preview.message).toBe(result.error?.message);
      }
      if (result.ok) {
        ok(await engine.session.timeline.undoAction());
      }
      expect(JSON.stringify(ok(engine.player.queries.getCurrentLiveWorldState()))).toBe(before);
    }
  });

  it('changes nothing and is not a Player action', async () => {
    const engine = await campaign();
    const [a1] = agentIds(engine) as [string];
    const state = JSON.stringify(ok(engine.player.queries.getCurrentLiveWorldState()));
    const timeline = JSON.stringify(ok(engine.session.timeline.getStatus()));
    ok(
      engine.player.queries.previewAction({
        name: 'assignAgents',
        args: { agents: [a1], assignment: 'Training' },
      }),
    );
    ok(engine.player.queries.previewAction({ name: 'advanceTurn', args: {} }));
    expect(JSON.stringify(ok(engine.player.queries.getCurrentLiveWorldState()))).toBe(state);
    expect(JSON.stringify(ok(engine.session.timeline.getStatus()))).toBe(timeline);
  });

  it('reports Advance turn as accepted for the Session controller outside Autopilot', async () => {
    const engine = await campaign();
    expect(ok(engine.player.queries.previewAction({ name: 'advanceTurn', args: {} }))).toMatchObject({
      available: true,
      reason: null,
      message: null,
    });
  });
});
