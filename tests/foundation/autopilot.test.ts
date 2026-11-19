/** Acceptance examples of AUTO (Autopilot) and DEV (Developer Access), with scripted Autopilot AIs. */
import { describe, expect, it } from 'vitest';
import type { AutopilotAiRunner, Principal } from '../../src/engine/session/core.ts';
import { CONTROLLER, expectOk, scriptedAi, startHarness, type Harness } from '../helpers/test-rules.ts';

async function withAis(make: (core: () => Harness['core']) => AutopilotAiRunner[]): Promise<Harness> {
  let harness: Harness | null = null;
  const h = await startHarness({ ais: make(() => harness!.core) });
  harness = h;
  expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'autopilot' }));
  return h;
}

/** Lets a scripted step that outlives its Autopilot engagement run to its end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

async function run(h: Harness, id: string, limit: unknown) {
  const { engagementId } = expectOk(await h.core.engage(CONTROLLER, id, limit));
  const result = expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
  await settle();
  return result;
}

describe('AUTO: Acceptance examples', () => {
  it('Listing Autopilot AIs', async () => {
    const h = await withAis((core) => [
      scriptedAi('x', core, [async (api) => void (await api.act('gain', { amount: 1 }))]),
      scriptedAi('y', core, [async (api) => void (await api.act('gain', { amount: 1 }))]),
    ]);
    expectOk(await h.core.closeCampaign(CONTROLLER));
    expect(expectOk(h.core.listAutopilotAis(CONTROLLER)).map((ai) => ai.autopilotAiId)).toEqual(['x', 'y']);
    expectOk(await h.core.createCampaign(CONTROLLER));
    await run(h, 'x', { kind: 'singleAction' });
    expect(expectOk(h.core.listAutopilotAis(CONTROLLER))).toEqual([
      { autopilotAiId: 'x', name: 'Test AI x' },
      { autopilotAiId: 'y', name: 'Test AI y' },
    ]);
    const before = h.state();
    const rejected = await h.core.engage(CONTROLLER, 'z', { kind: 'singleAction' });
    expect(!rejected.ok && rejected.error.code).toBe('invalid_input');
    for (const limit of [
      null,
      {},
      { kind: 'turnAdvancements' },
      { kind: 'turnAdvancements', count: 0 },
      'x',
    ]) {
      expect((await h.core.engage(CONTROLLER, 'x', limit)).ok).toBe(false);
    }
    expect(h.state()).toEqual(before);
    expect(expectOk(h.core.getStatus(CONTROLLER)).autopilot).toBeNull();
  });

  it('Limit accounting', async () => {
    const seen: string[] = [];
    const h = await withAis((core) => [
      scriptedAi('single', core, [
        async (api) => {
          for (let i = 0; i < 5; i += 1) {
            api.core.playerQuery(api.principal, 'currentState');
          }
          const rejected = (await api.act('spend', { amount: 10 ** 9 })) as { ok: boolean };
          seen.push(`rejected:${!rejected.ok}`);
          await api.act('gain', { amount: 1 });
          const late = (await api.act('gain', { amount: 1 })) as { ok: boolean; error?: { code: string } };
          seen.push(`late:${late.error?.code}`);
        },
      ]),
      scriptedAi('turns', core, [
        async (api) => {
          await api.act('gain', { amount: 1 });
          await api.advance();
          await api.act('gain', { amount: 1 });
          await api.advance();
          const third = (await api.advance()) as { ok: boolean };
          seen.push(`third:${third.ok}`);
        },
      ]),
    ]);
    const single = await run(h, 'single', { kind: 'singleAction' });
    expect(single).toMatchObject({
      reason: 'limitReached',
      limitReached: true,
      progress: { playerActions: 1 },
    });
    expect(seen).toEqual(['rejected:true', 'late:engagement_ended']);
    expect(h.view().money).toBe(101);
    const turns = await run(h, 'turns', { kind: 'turnAdvancements', count: 2 });
    expect(turns.progress).toEqual({ playerActions: 2, turnAdvancements: 2 });
    expect(seen.at(-1)).toBe('third:false');
    expect(h.view().turn).toBe(3);
  });

  it('Engagement ends at the first Advance turn', async () => {
    const outcomes: boolean[] = [];
    const h = await withAis((core) => [
      scriptedAi('x', core, [
        async (api) => {
          await api.act('gain', { amount: 1 });
          await api.advance();
          outcomes.push(((await api.act('gain', { amount: 1 })) as { ok: boolean }).ok);
        },
      ]),
    ]);
    const result = await run(h, 'x', { kind: 'turnAdvancements', count: 1 });
    expect(result.reason).toBe('limitReached');
    expect(outcomes).toEqual([false]);
    expect(h.view()).toMatchObject({ turn: 2 });
  });

  it('turnActions: the requested Advance turn is withheld and the Turn is left to the player', async () => {
    const outcomes: unknown[] = [];
    const h = await withAis((core) => [
      scriptedAi('x', core, [
        async (api) => {
          await api.act('gain', { amount: 1 });
          await api.act('gain', { amount: 1 });
          outcomes.push(expectOk((await api.advance()) as { ok: true; value: unknown }));
          outcomes.push(((await api.act('gain', { amount: 1 })) as { ok: boolean }).ok);
        },
      ]),
    ]);
    const result = await run(h, 'x', { kind: 'turnActions' });
    expect(result).toMatchObject({
      reason: 'advanceTurnWithheld',
      limitReached: false,
      progress: { playerActions: 2, turnAdvancements: 0 },
    });
    expect(outcomes).toEqual([{ committed: false, withheld: true }, false]);
    expect(h.view()).toMatchObject({ turn: 1, money: 102 });
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(2);
  });

  it('singleAction: an Autopilot AI with nothing to do ends the engagement with no Player action', async () => {
    const h = await withAis((core) => [scriptedAi('x', core, [async (api) => void (await api.advance())])]);
    const before = h.state();
    for (const limit of [{ kind: 'singleAction' }, { kind: 'turnActions' }]) {
      const result = await run(h, 'x', limit);
      expect(result).toMatchObject({
        reason: 'advanceTurnWithheld',
        progress: { playerActions: 0, turnAdvancements: 0 },
      });
    }
    // Campaign state and the Timeline are unchanged, and both Autosaves of the engagement are written.
    expect(h.state()).toEqual(before);
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(0);
    const kinds = expectOk(await h.core.listSaves(CONTROLLER)).map((save) => save.autosaveKind);
    expect(kinds).toEqual(expect.arrayContaining(['engagement', 'disengagement']));
  });

  it('turnAdvancements commits the requested Advance turn', async () => {
    const h = await withAis((core) => [scriptedAi('x', core, [async (api) => void (await api.advance())])]);
    const result = await run(h, 'x', { kind: 'turnAdvancements', count: 2 });
    expect(result).toMatchObject({
      reason: 'limitReached',
      progress: { playerActions: 0, turnAdvancements: 2 },
    });
    expect(h.view().turn).toBe(3);
  });

  it('Disengagement during an action; the Session controller is limited during an engagement', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await withAis((core) => [
      scriptedAi('x', core, [
        async (api) => {
          await api.act('gain', { amount: 1 });
          await gate;
          await api.act('gain', { amount: 1 });
        },
      ]),
    ]);
    const { engagementId } = expectOk(
      await h.core.engage(CONTROLLER, 'x', { kind: 'turnAdvancements', count: 5 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(expectOk(h.core.getStatus(CONTROLLER)).autopilot?.engagementId).toBe(engagementId);
    expect(expectOk(h.core.getAutopilotStatus(CONTROLLER, engagementId)).status).toBe('active');
    // Allowed during an engagement: queries, statuses, Global configuration.
    expect(h.core.playerQuery(CONTROLLER, 'currentState').ok).toBe(true);
    expect(h.core.getTimelineStatus(CONTROLLER).ok).toBe(true);
    expect((await h.core.setGlobalSetting(CONTROLLER, 'musicVolume', 30)).ok).toBe(true);
    // Unavailable during an engagement.
    for (const result of [
      await h.act('gain', { amount: 1 }),
      await h.core.advanceTurn(CONTROLLER),
      await h.core.undoAction(CONTROLLER),
      await h.core.save(CONTROLLER),
      await h.core.createCampaign(CONTROLLER),
      await h.core.closeCampaign(CONTROLLER),
      await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }),
      await h.core.setCampaignConfiguration(CONTROLLER, { multiplier: 3 }),
      h.core.enableDevMode(CONTROLLER),
      h.core.developerQuery(CONTROLLER),
    ]) {
      expect(!result.ok && result.error.code).toBe('autopilot_active');
    }
    const result = expectOk(await h.core.disengage(CONTROLLER, engagementId));
    expect(result).toMatchObject({ reason: 'disengagedByController', limitReached: false });
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The first action remains; the late action of the ended engagement changed nothing.
    expect(h.view().money).toBe(101);
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(1);
    expect(expectOk(await h.core.undoAction(CONTROLLER))).toBeNull();
  });

  it('AI failed: an error, or no valid action', async () => {
    const h = await withAis((core) => [
      scriptedAi('throws', core, [
        async (api) => {
          await api.act('gain', { amount: 1 });
          throw new Error('boom');
        },
      ]),
      scriptedAi('idle', core, [() => undefined]),
    ]);
    const thrown = await run(h, 'throws', { kind: 'turnAdvancements', count: 1 });
    expect(thrown).toMatchObject({ reason: 'aiFailed', progress: { playerActions: 1 } });
    expect(h.view().money).toBe(101);
    const idle = await run(h, 'idle', { kind: 'singleAction' });
    expect(idle.reason).toBe('aiFailed');
  });

  it('Campaign ended disengages, and limit reached takes precedence on the same action', async () => {
    const h = await withAis((core) => [
      scriptedAi('ender', core, [async (api) => void (await api.act('end'))]),
    ]);
    expect((await run(h, 'ender', { kind: 'turnAdvancements', count: 3 })).reason).toBe('campaignEnded');
    expectOk(await h.core.createCampaign(CONTROLLER));
    const second = scriptedAi('ender', () => h.core, [async (api) => void (await api.act('end'))]);
    void second;
    expect((await run(h, 'ender', { kind: 'singleAction' })).reason).toBe('limitReached');
  });
});

describe('ENG: Principal access matrix', () => {
  it('an Autopilot AI reaches no Session API, Developer API, or Campaign save', async () => {
    const codes: string[] = [];
    const code = (result: { ok: boolean; error?: { code: string } }) =>
      codes.push(result.ok ? 'ok' : (result.error?.code ?? '?'));
    const h = await withAis((core) => [
      scriptedAi('x', core, [
        async (api) => {
          const p: Principal = api.principal;
          code(api.core.getStatus(p));
          code(await api.core.listSaves(p));
          code(await api.core.save(p));
          code(await api.core.load(p, 'anything'));
          code(await api.core.undoAction(p));
          code(api.core.enableDevMode(p));
          code(api.core.developerQuery(p));
          code(
            await api.core.commitAction(p, { surface: 'developer', name: 'addMoney', args: { amount: 5 } }),
          );
          code(await api.core.disengage(p, 'x'));
          code(api.core.getGlobalConfiguration(p));
          await api.act('gain', { amount: 1 });
        },
      ]),
    ]);
    expectOk(h.core.enableDevMode(CONTROLLER));
    await run(h, 'x', { kind: 'singleAction' });
    expect(codes).toEqual(new Array(10).fill('unauthorized'));
    expect(h.view().money).toBe(101);
  });
});

describe('DEV: Acceptance examples', () => {
  it('Developer isolation', async () => {
    const seen: string[] = [];
    const h = await withAis((core) => [
      scriptedAi('x', core, [
        async (api) => {
          seen.push(JSON.stringify(api.core.playerQuery(api.principal, 'currentState')));
          seen.push(JSON.stringify(await api.act('spend', { amount: 10 ** 9 })));
          seen.push(JSON.stringify(api.core.developerQuery(api.principal)));
          await api.act('gain', { amount: 1 });
        },
      ]),
    ]);
    const denied = h.core.developerQuery(CONTROLLER);
    expect(!denied.ok && denied.error.code).toBe('dev_mode_disabled');
    expectOk(h.core.enableDevMode(CONTROLLER));
    const hidden = (expectOk(h.core.developerQuery(CONTROLLER)) as { world: { current: { hidden: number } } })
      .world.current.hidden;
    expect(hidden).toBeGreaterThan(0);
    expect(JSON.stringify(h.core.playerQuery(CONTROLLER, 'currentState'))).not.toContain('hidden');
    await run(h, 'x', { kind: 'singleAction' });
    for (const text of seen) {
      expect(text).not.toContain('hidden');
      expect(text).not.toContain('autopilot');
    }
    expect(seen[2]).toContain('unauthorized');
    expectOk(h.core.disableDevMode(CONTROLLER));
    expect(h.core.developerQuery(CONTROLLER).ok).toBe(false);
    expect((await h.cheat('addMoney', { amount: 1 })).ok).toBe(false);
  });

  it('a cheat is one Timeline entry, validated, and undone and redone without Dev mode', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(h.core.enableDevMode(CONTROLLER));
    const invalid = await h.cheat('addMoney', { amount: -5 });
    expect(invalid.ok).toBe(false);
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(0);
    expectOk(await h.cheat('addMoney', { amount: 5 }));
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(1);
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(expectOk(h.core.getStatus(CONTROLLER)).devMode).toBe(false);
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(h.view().money).toBe(100);
    expectOk(await h.core.redoAction(CONTROLLER));
    expect(h.view().money).toBe(105);
  });
});
