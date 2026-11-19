/** The terminal CLI and its file storage: an adapter over the engine API that adds no gameplay rule. */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTOPILOT_AIS } from '../../src/ai/index.ts';
import { createCli } from '../../src/cli/cli.ts';
import { FileStorage } from '../../src/cli/file-storage.ts';
import { MemoryStorage, createEngine, type Engine, type GameStorage } from '../../src/engine/index.ts';
import { ok } from '../helpers/engine.ts';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gv5-cli-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function start(storage: GameStorage): Promise<Engine> {
  let counter = 0;
  return createEngine(
    {
      storage,
      newId: () => {
        counter += 1;
        return `id-${counter}`;
      },
      randomNumbers: (count) => Array.from({ length: count }, (_, index) => index + 1),
    },
    { autopilotAis: [...AUTOPILOT_AIS] },
  );
}

async function run(engine: Engine, commands: string[], json = true): Promise<string[]> {
  const lines: string[] = [];
  const cli = createCli(engine, { json, write: (text) => lines.push(text) });
  for (const command of commands) {
    await cli.execute(command);
  }
  return lines;
}

const parse = (line: string | undefined) => JSON.parse(line ?? 'null') as Record<string, any>;

describe('File storage', () => {
  it('stores, lists, reads, and deletes Campaign saves and the Global configuration', async () => {
    const storage = new FileStorage(dir);
    expect(await storage.readGlobalConfiguration()).toBeNull();
    expect(await storage.listSaveHeaders()).toEqual([]);
    expect(await storage.readSave('a')).toBeNull();

    await storage.writeGlobalConfiguration('{"x":1}');
    expect(await storage.readGlobalConfiguration()).toBe('{"x":1}');

    const header = {
      saveId: 'c1.turn-end.1',
      campaignId: 'c1',
      kind: 'turnEnd',
      turn: 1,
      gameBuild: 'b',
      stamp: 's',
      writtenAt: '2026-11-17T00:00:00.000Z',
    };
    await storage.writeSave(header as never, 'body-text');
    expect(await storage.listSaveHeaders()).toEqual([header]);
    expect(await storage.readSave('c1.turn-end.1')).toBe('body-text');

    await storage.deleteSave('c1.turn-end.1');
    expect(await storage.listSaveHeaders()).toEqual([]);
    expect(await storage.readSave('c1.turn-end.1')).toBeNull();
  });

  it('skips a header file that cannot be parsed', async () => {
    const storage = new FileStorage(dir);
    await storage.writeSave({ saveId: 'good', campaignId: 'c', kind: 'manual', turn: 1 } as never, 'x');
    await writeFile(join(dir, 'saves', 'bad.header.json'), '{not json');
    expect((await storage.listSaveHeaders()).map((header) => header.saveId)).toEqual(['good']);
  });

  it('keeps a Campaign across Sessions: a second Session loads what the first saved', async () => {
    const first = await start(new FileStorage(dir));
    const saved = await run(first, ['new seed-one', 'hire', 'next', 'save', 'state']);
    const saveId = parse(saved[3]).value.saveId as string;
    const stateBefore = parse(saved[4]).value;

    const second = await start(new FileStorage(dir));
    const loaded = await run(second, [`load ${saveId}`, 'state']);
    expect(parse(loaded[0]).ok).toBe(true);
    expect(parse(loaded[1]).value).toEqual(stateBefore);
    expect((await readdir(join(dir, 'saves'))).length).toBeGreaterThan(0);
  });
});

describe('Terminal CLI', () => {
  it('prints exactly what the engine API returns, in JSON mode', async () => {
    const engine = await start(new MemoryStorage());
    const lines = await run(engine, ['new s', 'state', 'actions', 'report', 'history', 'timeline', 'ais']);
    expect(parse(lines[1]).value).toEqual(
      JSON.parse(JSON.stringify(ok(engine.player.queries.getCurrentState()))),
    );
    expect(parse(lines[2]).value).toEqual(
      JSON.parse(JSON.stringify(ok(engine.player.queries.getAvailableActions()))),
    );
    expect(parse(lines[3]).value).toBeNull();
    expect(parse(lines[4]).value).toEqual(JSON.parse(JSON.stringify(ok(engine.player.queries.getHistory()))));
    expect(parse(lines[5]).value).toEqual(ok(engine.session.timeline.getStatus()));
    expect(parse(lines[6]).value[0].autopilotAiId).toBe('basic');
  });

  it('plays the same Campaign as the same calls on the engine API', async () => {
    const viaCli = await start(new MemoryStorage());
    await run(viaCli, [
      'new same-seed',
      'hire',
      'assign Contracting agent-2 agent-3',
      'investigate locate_red_dawn_member agent-4',
      'next',
      'next',
      'undo',
      'buy training_cap',
      'next',
    ]);

    const viaApi = await start(new MemoryStorage());
    ok(await viaApi.session.campaign.create({ seed: 'same-seed' }));
    ok(await viaApi.player.actions.hireAgent());
    ok(await viaApi.player.actions.assignAgents(['agent-2', 'agent-3'], 'Contracting'));
    ok(await viaApi.player.actions.startInvestigation('locate_red_dawn_member', ['agent-4']));
    ok(await viaApi.player.actions.advanceTurn());
    ok(await viaApi.player.actions.advanceTurn());
    await viaApi.session.timeline.undoAction();
    ok(await viaApi.player.actions.purchaseUpgrade('training_cap'));
    ok(await viaApi.player.actions.advanceTurn());

    expect(ok(viaCli.player.queries.getCurrentState())).toEqual(ok(viaApi.player.queries.getCurrentState()));
    expect(ok(viaCli.player.queries.getHistory())).toEqual(ok(viaApi.player.queries.getHistory()));
  });

  it('reports a rejected command with the engine error and changes nothing', async () => {
    const engine = await start(new MemoryStorage());
    const lines = await run(engine, ['hire', 'new s', 'deploy nowhere agent-2', 'buy nothing', 'inspect']);
    expect(parse(lines[0]).error.code).toBe('no_current_campaign');
    expect(parse(lines[2]).ok).toBe(false);
    expect(parse(lines[3]).ok).toBe(false);
    expect(parse(lines[4]).error.code).toBe('dev_mode_disabled');
    expect(ok(engine.session.timeline.getStatus()).timelineEntries).toBe(0);
  });

  it('plays a whole Campaign to its ending with the Basic Autopilot AI, readable for a person', async () => {
    const engine = await start(new FileStorage(dir));
    const lines = await run(
      engine,
      ['new full-campaign', 'auto basic turns 400', 'state', 'agents', 'factions'],
      false,
    );
    expect(lines[1]).toMatch(/^reason: campaignEnded$/m);
    expect(lines[2]).toMatch(/^ending:\n {2}ending: (Victory|Defeat)$/m);
    expect(lines[3]).toMatch(/^-\n {2}id: agent-/);
    expect(ok(engine.session.getStatus()).campaignEnded).toBe(true);
    const after = await run(engine, ['next'], false);
    expect(after[0]).toMatch(/^error \(/);
  });

  it('gives Developer access only in Dev mode and reaches every cheat operation', async () => {
    const engine = await start(new MemoryStorage());
    const lines = await run(engine, [
      'new s',
      'addmoney 5',
      'dev on',
      'addmoney 5',
      'addagents 2',
      'inspect',
      'dev off',
    ]);
    expect(parse(lines[1]).error.code).toBe('dev_mode_disabled');
    expect(parse(lines[3]).ok).toBe(true);
    expect(parse(lines[4]).ok).toBe(true);
    expect(parse(lines[5]).value.timeline).toBeDefined();
    expect(ok(engine.player.queries.getCurrentState()).agency.money).toBe(505);
  });

  it('prints the whole result in both Output forms', async () => {
    const engine = await start(new MemoryStorage());
    await run(engine, ['new forms']);
    const [json] = await run(engine, ['agents']);
    const [text] = await run(engine, ['agents'], false);
    const agents = parse(json).value as Record<string, unknown>[];
    expect(agents).toHaveLength(ok(engine.player.queries.getCurrentState()).agents.length);
    // Every scalar of every Agent appears in the readable form, under its own key.
    for (const agent of agents) {
      for (const [key, value] of Object.entries(agent)) {
        if (value === null || typeof value !== 'object') {
          expect(text).toContain(
            `${key}: ${value === null ? '-' : String(value as string | number | boolean)}`,
          );
        }
      }
    }
  });

  it('reports a Compendium article in its resolved form, in both Output forms, and looks up an Article term', async () => {
    const engine = await start(new MemoryStorage());
    await run(engine, ['new compendium']);
    const [json, term, none] = await run(engine, ['articles', 'term Combat rating', 'term no such term']);
    // CLI, Output forms: exactly what the engine API returns: the text, the inserted values, and the Article links.
    expect(parse(json).value).toEqual(ok(engine.player.queries.getCompendiumArticles()));
    const exhaustion = (parse(json).value as Record<string, any>[]).find(
      (article) => article['id'] === 'mechanics_exhaustion',
    )!;
    const segments = [
      ...exhaustion['body'],
      ...exhaustion['formulas'].flatMap((row: Record<string, any>) => [...row['label'], ...row['text']]),
    ] as { kind: string; text: string; article?: string }[];
    expect(segments.some((segment) => segment.kind === 'value')).toBe(true);
    expect(segments.find((segment) => segment.kind === 'link')?.article).toMatch(/^[a-z_]+$/);
    expect(segments.map((segment) => segment.text).join('')).not.toMatch(/[{}]/);
    expect(parse(term)).toMatchObject({ command: 'term', ok: true, value: 'mechanics_combat' });
    expect(parse(none)).toMatchObject({ command: 'term', ok: true, value: null });
    // The readable form gives the same segments, as a table of each segment's kind, text, and linked article.
    const [text] = await run(engine, ['articles'], false);
    expect(text).toContain('id: mechanics_exhaustion');
    expect(text).toMatch(/^\s+kind\s+text\s+article$/m);
    expect(text).toMatch(/^\s+link\s+Agent\s+mechanics_agents$/m);
    expect(text).toMatch(/^\s+value\s+\d+$/m);
  });

  it('reaches the New-Campaign setup and an Autopilot engagement while it runs', async () => {
    const engine = await start(new MemoryStorage());
    const lines = await run(engine, ['setup', 'new reach', 'engage basic turns 50']);
    expect(parse(lines[0]).ok).toBe(true);
    const engagement = parse(lines[2]).value.engagementId as string;
    const after = await run(engine, [
      `autostatus ${engagement}`,
      `disengage ${engagement}`,
      `wait ${engagement}`,
    ]);
    expect(parse(after[0]).ok).toBe(true);
    expect(parse(after[1]).ok).toBe(true);
    expect(parse(after[2]).value.reason).toBeDefined();
  });
});
