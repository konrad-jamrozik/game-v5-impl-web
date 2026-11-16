/** Acceptance examples of LIFE (Campaign Lifecycle), SAVES, and DETERM that need the engine. */
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../src/engine/saves/storage.ts';
import { CONTROLLER, expectOk, scriptedAi, startHarness, type Harness } from '../helpers/test-rules.ts';

const status = (h: Harness) => expectOk(h.core.getStatus(CONTROLLER));
const list = async (h: Harness) => expectOk(await h.core.listSaves(CONTROLLER));

describe('LIFE: Acceptance examples', () => {
  it('Session without a Campaign', async () => {
    const h = await startHarness();
    expect(status(h).hasCurrentCampaign).toBe(false);
    expect(status(h).devMode).toBe(false);
    const query = h.core.playerQuery(CONTROLLER, 'currentState');
    expect(query.ok).toBe(false);
    expect(!query.ok && query.error.code).toBe('no_current_campaign');
    const action = await h.act('gain', { amount: 1 });
    expect(!action.ok && action.error.code).toBe('no_current_campaign');
    expect(await list(h)).toEqual([]);
  });

  it('Operations without a Current campaign', async () => {
    const h = await startHarness();
    expect(h.core.getGlobalConfiguration(CONTROLLER).ok).toBe(true);
    expect((await h.core.listSaves(CONTROLLER)).ok).toBe(true);
    expect(h.core.listPresets(CONTROLLER).ok).toBe(true);
    expect(h.core.listAutopilotAis(CONTROLLER).ok).toBe(true);
    for (const result of [
      await h.core.save(CONTROLLER),
      await h.core.saveAsNew(CONTROLLER),
      await h.core.closeCampaign(CONTROLLER),
      await h.core.undoAction(CONTROLLER),
      await h.core.undoToAutosave(CONTROLLER),
      await h.core.advanceTurn(CONTROLLER),
      h.core.getTimelineStatus(CONTROLLER),
      h.core.enableDevMode(CONTROLLER),
      await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }),
    ]) {
      expect(!result.ok && result.error.code).toBe('no_current_campaign');
    }
  });

  it('Session not persisted', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'k' }));
    expectOk(await h.act('gain', { amount: 5 }));
    h.core.enableDevMode(CONTROLLER);
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    await h.restart();
    expect(status(h).hasCurrentCampaign).toBe(false);
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(status(h).hasCurrentCampaign).toBe(true);
    expect(status(h).devMode).toBe(false);
    expect(h.view().money).toBe(105);
  });

  it('Closing does not save', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('gain', { amount: 5 }));
    expectOk(await h.core.closeCampaign(CONTROLLER));
    expect(status(h).hasCurrentCampaign).toBe(false);
    expect((await list(h)).filter((save) => !save.isAutosave)).toEqual([]);
  });

  it('Failed load keeps the Campaign', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    h.storage.overwriteBody(saveId, h.storage.saves.get(saveId)!.body.replace('test-build', 'other-build'));
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'campaign a' }));
    const before = status(h);
    const result = await h.core.load(CONTROLLER, saveId);
    expect(!result.ok && result.error.code).toBe('incompatible_game_build');
    expect(status(h)).toEqual(before);
  });

  it('create, load, and close disable Dev mode; a failed create changes nothing', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(h.core.enableDevMode(CONTROLLER));
    const before = status(h);
    const failed = await h.core.createCampaign(CONTROLLER, { seed: '' });
    expect(failed.ok).toBe(false);
    expect(status(h)).toEqual(before);
    expectOk(await h.core.createCampaign(CONTROLLER));
    expect(status(h).devMode).toBe(false);
  });
});

describe('DETERM: Acceptance examples', () => {
  async function play(h: Harness, withNoise: boolean): Promise<unknown[]> {
    const states: unknown[] = [];
    const record = () => states.push(h.state());
    h.core.enableDevMode(CONTROLLER);
    expectOk(await h.cheat('addMoney', { amount: 7 }));
    record();
    if (withNoise) {
      h.core.playerQuery(CONTROLLER, 'currentState');
      const rejected = await h.act('spend', { amount: 1_000_000 });
      expect(rejected.ok).toBe(false);
    }
    expectOk(await h.act('roll'));
    record();
    expectOk(await h.act('hire'));
    record();
    if (withNoise) {
      h.core.playerQuery(CONTROLLER, 'history');
    }
    expectOk(await h.core.advanceTurn(CONTROLLER));
    record();
    expectOk(await h.act('roll'));
    record();
    return states;
  }

  it('Equal outcomes; Same seed, same Campaign', async () => {
    const a = await startHarness();
    expectOk(await a.core.createCampaign(CONTROLLER, { seed: 'K' }));
    const first = await play(a, false);
    const b = await startHarness();
    expectOk(await b.core.createCampaign(CONTROLLER, { seed: 'K' }));
    const second = await play(b, true);
    expect(second).toEqual(first);
    const c = await startHarness();
    expectOk(await c.core.createCampaign(CONTROLLER, { seed: 'another' }));
    expect(await play(c, false)).not.toEqual(first);
  });

  it('Same save, another machine', async () => {
    const storage = new MemoryStorage();
    const a = await startHarness({ storage });
    expectOk(await a.core.createCampaign(CONTROLLER, { seed: 'machine' }));
    const { saveId } = expectOk(await a.core.save(CONTROLLER));
    const first = await play(a, false);
    const b = await startHarness({ storage });
    expectOk(await b.core.load(CONTROLLER, saveId));
    expect(await play(b, true)).toEqual(first);
  });

  it('Seed chosen by the engine', async () => {
    const c = await startHarness();
    expectOk(await c.core.createCampaign(CONTROLLER));
    const seed = status(c).campaignSeed!;
    expect(seed).toHaveLength(10);
    expect(/^[\x20-\x7e]{10}$/.test(seed)).toBe(true);
    const first = await play(c, false);
    const d = await startHarness();
    expectOk(await d.core.createCampaign(CONTROLLER, { seed }));
    expect(await play(d, false)).toEqual(first);
  });

  it('Seed fixed and hidden', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'hidden seed 123' }));
    expectOk(await h.act('roll'));
    expectOk(await h.core.undoAction(CONTROLLER));
    expectOk(await h.core.redoAction(CONTROLLER));
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(status(h).campaignSeed).toBe('hidden seed 123');
    for (const devMode of [false, true]) {
      if (devMode) {
        h.core.enableDevMode(CONTROLLER);
      }
      for (const query of ['currentState', 'turnReport', 'history', 'availableActions'] as const) {
        expect(JSON.stringify(h.core.playerQuery(CONTROLLER, query))).not.toContain('hidden seed 123');
      }
    }
  });

  it('Identifiers under replay', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('hire'));
    const before = h.view().agents;
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(h.view().agents).toEqual([]);
    expectOk(await h.core.redoAction(CONTROLLER));
    expect(h.view().agents).toEqual(before);
    const one = expectOk(await h.core.saveAsNew(CONTROLLER));
    const two = expectOk(await h.core.saveAsNew(CONTROLLER));
    expect(one.saveId).not.toBe(two.saveId);
  });

  it('Seed length limits', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'a'.repeat(64) }));
    const before = status(h);
    for (const seed of ['a'.repeat(65), '', 'café', 42]) {
      const result = await h.core.createCampaign(CONTROLLER, { seed });
      expect(!result.ok && result.error.code).toBe('invalid_input');
      expect(status(h)).toEqual(before);
    }
  });
});

describe('SAVES: Acceptance examples', () => {
  it('Save and load', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'A' }));
    expectOk(await h.act('gain', { amount: 11 }));
    const saved = h.state();
    const { saveId } = expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'B' }));
    expectOk(await h.core.load(CONTROLLER, saveId));
    expect(h.state()).toEqual(saved);
    expect(status(h).devMode).toBe(false);
    expect(status(h).autopilot).toBeNull();
    expect(status(h).currentSaveId).toBe(saveId);

    const before = status(h);
    h.storage.overwriteBody(saveId, '{"not":"a save"');
    const corrupt = await h.core.load(CONTROLLER, saveId);
    expect(!corrupt.ok && corrupt.error.code).toBe('corrupt_campaign_save');
    expect(status(h)).toEqual(before);
    const missing = await h.core.load(CONTROLLER, 'no-such-save');
    expect(!missing.ok && missing.error.code).toBe('unreadable_campaign_save');
    expect(!missing.ok && missing.error.message).toContain('no-such-save');
  });

  it('Keeping a line of play by saving as new', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const s1 = expectOk(await h.core.save(CONTROLLER)).saveId;
    const original = h.state();
    expectOk(await h.core.load(CONTROLLER, s1));
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.act('gain', { amount: 1 }));
    }
    const s2 = expectOk(await h.core.saveAsNew(CONTROLLER)).saveId;
    expect(status(h).currentSaveId).toBe(s2);
    expectOk(await h.act('gain', { amount: 1 }));
    expect(expectOk(await h.core.save(CONTROLLER)).saveId).toBe(s2);
    expectOk(await h.core.load(CONTROLLER, s2));
    expect(h.view().money).toBe(104);
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).timelineEntries).toBe(4);
    expectOk(await h.core.load(CONTROLLER, s1));
    expect(h.state()).toEqual(original);
    const saves = await list(h);
    expect(saves.find((s) => s.saveId === s1)!.campaignId).toBe(
      saves.find((s) => s.saveId === s2)!.campaignId,
    );
  });

  it('Campaign configuration isolation', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const a = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(h.core.selectPreset(CONTROLLER, 'hard'));
    expectOk(await h.core.createCampaign(CONTROLLER));
    const b = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.core.load(CONTROLLER, a));
    expect(h.state().configuration).toEqual({ startingMoney: 100, multiplier: 1 });
    expectOk(await h.core.load(CONTROLLER, b));
    expect(h.state().configuration).toEqual({ startingMoney: 60, multiplier: 2 });
  });

  it('Listing before loading', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const first = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const second = expectOk(await h.core.saveAsNew(CONTROLLER)).saveId;
    await h.restart();
    const saves = await list(h);
    const manual = saves.filter((save) => !save.isAutosave);
    expect(manual.map((save) => save.turn).sort()).toEqual([1, 2]);
    expect(new Set(saves.map((save) => save.campaignId)).size).toBe(1);
    expect(saves.some((save) => save.autosaveKind === 'current')).toBe(true);
    expect(saves.some((save) => save.autosaveKind === 'turnEnd' && save.turn === 1)).toBe(true);
    expect(saves.every((save) => !save.isCurrentSave)).toBe(true);
    expectOk(await h.core.load(CONTROLLER, second));
    const after = await list(h);
    expect(after.find((save) => save.saveId === second)!.isCurrentSave).toBe(true);
    expect(after.find((save) => save.saveId === first)!.isCurrentSave).toBe(false);
  });

  it('Deleting a Campaign save and a Campaign', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const first = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const second = expectOk(await h.core.saveAsNew(CONTROLLER)).saveId;
    const campaignId = (await list(h)).find((save) => save.saveId === first)!.campaignId;
    expectOk(await h.core.closeCampaign(CONTROLLER));
    expectOk(await h.core.deleteSaveById(CONTROLLER, first));
    const after = await list(h);
    expect(after.some((save) => save.saveId === first)).toBe(false);
    expect(after.some((save) => save.saveId === second)).toBe(true);
    expect(after.some((save) => save.isAutosave)).toBe(true);
    expectOk(await h.core.deleteCampaignSaves(CONTROLLER, campaignId));
    expect((await list(h)).filter((save) => save.campaignId === campaignId)).toEqual([]);
    expect(h.storage.saves.size).toBe(0);
    const again = await h.core.deleteSaveById(CONTROLLER, second);
    expect(!again.ok && again.error.code).toBe('unknown_campaign_save');
  });

  it('Deleting while playing', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    const other = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.core.createCampaign(CONTROLLER));
    const own = expectOk(await h.core.save(CONTROLLER)).saveId;
    const saves = await list(h);
    const ownCampaign = saves.find((save) => save.saveId === own)!.campaignId;
    const before = saves.length;
    const rejected = await h.core.deleteSaveById(CONTROLLER, own);
    expect(!rejected.ok && rejected.error.code).toBe('current_campaign');
    const rejectedCampaign = await h.core.deleteCampaignSaves(CONTROLLER, ownCampaign);
    expect(!rejectedCampaign.ok && rejectedCampaign.error.code).toBe('current_campaign');
    expect(await list(h)).toHaveLength(before);
    expectOk(await h.core.deleteSaveById(CONTROLLER, other));
    expect(await list(h)).toHaveLength(before - 1);
  });

  it('A delete that Game storage refuses deletes no Campaign save', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.core.save(CONTROLLER));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const saves = await list(h);
    expectOk(await h.core.closeCampaign(CONTROLLER));
    const campaignId = saves[0]!.campaignId;
    let deletions = 0;
    // The second deletion is refused, after the first already succeeded.
    h.storage.failDelete = () => (deletions += 1) === 2;
    const result = await h.core.deleteCampaignSaves(CONTROLLER, campaignId);
    expect(!result.ok && result.error.code).toBe('undeletable_campaign_save');
    h.storage.failDelete = null;
    expect((await list(h)).map((save) => save.saveId).sort()).toEqual(
      saves.map((save) => save.saveId).sort(),
    );
  });

  it('Resuming without saving', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('roll'));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expectOk(await h.act('hire'));
    const last = h.state();
    await h.restart();
    const current = (await list(h)).find((save) => save.autosaveKind === 'current')!;
    expectOk(await h.core.load(CONTROLLER, current.saveId));
    expect(h.state()).toEqual(last);
    expect(status(h).currentSaveId).toBeNull();
    const created = expectOk(await h.core.save(CONTROLLER));
    expect(created.saveId).not.toBe(current.saveId);
    expect((await list(h)).find((save) => save.saveId === current.saveId)!.isAutosave).toBe(true);
  });

  it('The Current Autosave follows every change', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => void (await api.act('gain', { amount: 2 })),
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    const currentBody = () => {
      const header = [...h.storage.saves.values()].filter((s) => s.header.kind === 'currentAutosave');
      expect(header).toHaveLength(1);
      return JSON.parse(header[0]!.body) as { entries: unknown[]; position: number };
    };
    expectOk(await h.act('gain', { amount: 1 }));
    expect(currentBody().entries).toHaveLength(1);
    const { engagementId } = expectOk(await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }));
    expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    expect(currentBody().entries).toHaveLength(2);
    expectOk(await h.core.undoAction(CONTROLLER));
    expect(currentBody().position).toBe(1);
  });

  it('Autosave limit', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    for (let i = 0; i < 7; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    const turnEnds = (await list(h))
      .filter((save) => save.autosaveKind === 'turnEnd')
      .map((save) => save.turn);
    expect(turnEnds).toEqual([3, 4, 5, 6, 7]);
  });

  it('One Autopilot engagement, one Engagement Autosave', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [async (api) => void (await api.advance())]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    for (let i = 0; i < 4; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    const { engagementId } = expectOk(
      await h.core.engage(CONTROLLER, 'x', { kind: 'turnAdvancements', count: 30 }),
    );
    const result = expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    expect(result.reason).toBe('limitReached');
    expect(result.progress.turnAdvancements).toBe(30);
    const saves = await list(h);
    expect(saves.filter((s) => s.autosaveKind === 'turnEnd').map((s) => s.turn)).toEqual([1, 2, 3, 4]);
    expect(saves.filter((s) => s.autosaveKind === 'engagement').map((s) => s.turn)).toEqual([5]);
    expect(saves.filter((s) => s.autosaveKind === 'current').map((s) => s.turn)).toEqual([35]);
  });

  it('A second Autopilot engagement replaces the Engagement Autosave', async () => {
    let harness: Harness | null = null;
    const ai = scriptedAi('x', () => harness!.core, [
      async (api) => void (await api.act('gain', { amount: 1 })),
    ]);
    const h = await startHarness({ ais: [ai] });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER));
    for (let i = 0; i < 2; i += 1) {
      const { engagementId } = expectOk(await h.core.engage(CONTROLLER, 'x', { kind: 'singleAction' }));
      expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    }
    const engagement = [...h.storage.saves.values()].filter((s) => s.header.kind === 'engagementAutosave');
    expect(engagement).toHaveLength(1);
    expect((JSON.parse(engagement[0]!.body) as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it('Autosave limit 0', async () => {
    const h = await startHarness();
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autosaveLimit', 0));
    expectOk(await h.core.createCampaign(CONTROLLER));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    const saves = await list(h);
    expect(saves.filter((s) => s.autosaveKind === 'turnEnd')).toEqual([]);
    expect(saves.filter((s) => s.autosaveKind === 'current').map((s) => s.turn)).toEqual([2]);
  });

  it('Too large', async () => {
    const h = await startHarness({ saveSizeLimitBytes: 2000 });
    expectOk(await h.core.createCampaign(CONTROLLER));
    const small = expectOk(await h.core.save(CONTROLLER)).saveId;
    const smallBody = h.storage.saves.get(small)!.body;
    for (let i = 0; i < 120; i += 1) {
      await h.act('hire');
    }
    const before = status(h);
    const result = await h.core.save(CONTROLLER);
    expect(!result.ok && result.error.code).toBe('save_size_limit_exceeded');
    expect(h.storage.saves.get(small)!.body).toBe(smallBody);
    expect(status(h)).toEqual(before);
    const asNew = await h.core.saveAsNew(CONTROLLER);
    expect(!asNew.ok && asNew.error.code).toBe('save_size_limit_exceeded');
  });

  it('An Autosave that cannot be written is reported and removed, and the operation completes', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER));
    h.storage.failWrite = (header) => header.kind === 'currentAutosave';
    const result = await h.act('gain', { amount: 3 });
    expect(result.ok && result.autosaveFailures.map((f) => [f.autosave, f.code])).toEqual([
      ['current', 'unwritable_campaign_save'],
    ]);
    expect(h.view().money).toBe(103);
    expect((await list(h)).filter((s) => s.autosaveKind === 'current')).toEqual([]);
    h.storage.failWrite = (header) => header.kind === 'manual';
    const save = await h.core.save(CONTROLLER);
    expect(!save.ok && save.error.code).toBe('unwritable_campaign_save');
    expect(status(h).currentSaveId).toBeNull();
  });
});
