/**
 * Tests of PAPI, Action results: what a successful gameplay action returns, applied to both World state query results
 * from before it, is exactly what both queries return after it. A Campaign played by the Basic Autopilot AI makes every
 * kind of Player action it makes, e.g. hiring many Agents at once, buying Upgrades that change every Agent's effective
 * values, deploying, and investigating; each one is checked against the queries.
 */
import { describe, expect, it } from 'vite-plus/test';
import { createBasicAutopilotAi } from '../../src/ai/index.ts';
import { applyWorldStateChanges, type WorldStateViews } from '../../src/ai/world-state-changes.ts';
import type { AutopilotAi, PlayerApi, WorldStateChanges } from '../../src/engine/index.ts';
import { autopilot, ok, startEngine } from '../helpers/engine.ts';

function views(player: PlayerApi): WorldStateViews {
  return {
    live: ok(player.queries.getCurrentLiveWorldState()),
    retired: ok(player.queries.getCurrentRetiredWorldState()),
  };
}

type Action = (...args: unknown[]) => Promise<{ ok: boolean; value?: { changes?: WorldStateChanges } }>;

describe('PAPI, Action results', () => {
  it('agree with both World state queries after every Player action of a Campaign', async () => {
    const checked = new Map<string, number>();
    const basic = createBasicAutopilotAi();
    // The Basic Autopilot AI, with every Player action other than Advance turn checked against the queries.
    const checking: AutopilotAi = {
      id: 'checking',
      name: 'Checking',
      step: ({ player }) => {
        const actions = Object.fromEntries(
          Object.entries(player.actions as unknown as Record<string, Action>).map(([name, action]) => [
            name,
            name === 'advanceTurn'
              ? action
              : async (...args: unknown[]) => {
                  const before = views(player);
                  const result = await action(...args);
                  if (result.ok) {
                    const changes = result.value?.changes;
                    expect(changes).toBeDefined();
                    expect(applyWorldStateChanges(before, changes as WorldStateChanges)).toEqual(
                      views(player),
                    );
                    const key =
                      name === 'hireAgents' && (args[0] as number) > 1 ? 'hireAgents of many' : name;
                    checked.set(key, (checked.get(key) ?? 0) + 1);
                  }
                  return result;
                },
          ]),
        ) as unknown as PlayerApi['actions'];
        return basic.step({ player: { queries: player.queries, actions } });
      },
    };
    const { engine } = await startEngine({ autopilotAis: [checking] });
    // More Starting money keeps the Campaign going long enough to make every kind of Player action, because income is
    // funding alone until Contracting is unlocked (see the Open Specification problem on early upkeep).
    ok(engine.session.newCampaignSetup.setPresetEdit('standard', { key: 'startingMoney', value: 3000 }));
    ok(await engine.session.campaign.create({ seed: 'action-results' }));
    await autopilot(engine, { kind: 'turnAdvancements', count: 60 }, 'checking');
    // The Campaign made the Player actions whose changes differ the most in kind.
    for (const name of [
      'hireAgents of many',
      'purchaseUpgrade',
      'assignAgents',
      'deployAgents',
      'startInvestigation',
    ]) {
      expect(checked.get(name) ?? 0, name).toBeGreaterThan(0);
    }
  });

  it('name an Agent that leaves play with the new order of both parts, and a rejected action returns no changes', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'action-results-dismiss' }));
    const player = engine.player;
    const before = views(player);
    const [first] = before.live.agents;
    const result = ok(await player.actions.dismissAgents([first!.id]));
    const changes = result.changes;
    expect(changes.live.agents?.order).not.toContain(first!.id);
    expect(changes.retired.agents?.order).toContain(first!.id);
    expect(applyWorldStateChanges(before, changes)).toEqual(views(player));

    const rejected = await player.actions.dismissAgents([first!.id]);
    expect(rejected.ok).toBe(false);
    expect('value' in rejected).toBe(false);
  });
});
