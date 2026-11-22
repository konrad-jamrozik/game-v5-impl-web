/** Game storage in IndexedDB, run against an in-memory IndexedDB. */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vite-plus/test';
import { AUTOPILOT_AIS } from '../../src/ai/index.ts';
import { createEngine, type Engine, type SaveHeader } from '../../src/engine/index.ts';
import { IndexedDbStorage } from '../../src/web/indexeddb-storage.ts';
import { ok } from '../helpers/engine.ts';

function start(factory: IDBFactory): Promise<Engine> {
  let counter = 0;
  return createEngine(
    {
      storage: new IndexedDbStorage(factory),
      newId: () => {
        counter += 1;
        return `id-${counter}`;
      },
      randomNumbers: (count) => Array.from({ length: count }, (_, index) => index + 1),
    },
    { autopilotAis: [...AUTOPILOT_AIS] },
  );
}

describe('IndexedDB storage', () => {
  it('stores, lists, reads, replaces, and deletes Campaign saves and the Global configuration', async () => {
    const storage = new IndexedDbStorage(new IDBFactory());
    expect(await storage.readGlobalConfiguration()).toBeNull();
    expect(await storage.listSaveHeaders()).toEqual([]);
    expect(await storage.readSave('a')).toBeNull();

    await storage.writeGlobalConfiguration('{"x":1}');
    expect(await storage.readGlobalConfiguration()).toBe('{"x":1}');

    const header = {
      saveId: 'a',
      campaignId: 'c',
      kind: 'manual',
      turn: 1,
      gameBuild: 'b',
      stamp: 's',
      writtenAt: '2026-11-17T00:00:00.000Z',
    };
    await storage.writeSave(header as unknown as SaveHeader, 'one');
    await storage.writeSave({ ...header, turn: 2 } as unknown as SaveHeader, 'two');
    expect(await storage.listSaveHeaders()).toEqual([{ ...header, turn: 2 }]);
    expect(await storage.readSave('a')).toBe('two');

    await storage.deleteSave('a');
    expect(await storage.listSaveHeaders()).toEqual([]);
    expect(await storage.readSave('a')).toBeNull();
  });

  it('keeps a Campaign across Sessions through the Current Autosave', async () => {
    const factory = new IDBFactory();
    const first = await start(factory);
    ok(await first.session.campaign.create({ seed: 'web-seed' }));
    ok(await first.player.actions.hireAgents(1));
    ok(await first.player.actions.advanceTurn());
    ok(await first.player.actions.hireAgents(1));
    ok(await first.session.globalConfiguration.set('musicVolume', 30));
    const before = ok(first.player.queries.getCurrentLiveWorldState());
    const campaignId = ok(first.session.getStatus()).campaignId;

    const second = await start(factory);
    const theme = ok(second.session.globalConfiguration.get()).settings.find(
      (item) => item.setting === 'musicVolume',
    );
    expect(theme?.effectiveValue).toBe(30);
    const saves = ok(await second.session.saves.list());
    const current = saves.find((save) => save.campaignId === campaignId && save.autosaveKind === 'current');
    expect(current).toBeDefined();
    ok(await second.session.saves.load(current?.saveId ?? ''));
    expect(ok(second.player.queries.getCurrentLiveWorldState())).toEqual(before);
    expect(ok(second.session.timeline.getStatus()).canUndoAction).toBe(true);
  });
});
