/** Tests for the behaviors the final conformance reviews found untested or wrong. */
import { describe, expect, it } from 'vitest';
import { createCli } from '../../src/cli/cli.ts';
import { RAW_GDR_FILES } from '../../src/gdr/generated/raw-gdrs.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';
import { CONTROLLER, expectOk, scriptedAi, startHarness, type Harness } from '../helpers/test-rules.ts';

const turnEnds = async (h: Harness) =>
  expectOk(await h.core.listSaves(CONTROLLER))
    .filter((save) => save.autosaveKind === 'turnEnd')
    .map((save) => save.turn);

describe('AUTO: Lifecycle and concurrency', () => {
  it('disengages as AI failed when the Autopilot AI exhausts its execution budget', async () => {
    let harness: Harness | null = null;
    let calls = 0;
    const h = await startHarness({
      ais: [
        scriptedAi('loop', () => harness!.core, [
          async (api) => {
            // Repeats an invalid action until the engine stops answering this Autopilot engagement.
            for (;;) {
              const result = (await api.act('no-such-action')) as { ok: boolean; error?: { code: string } };
              calls += 1;
              if (!result.ok && result.error?.code === 'engagement_ended') {
                return;
              }
            }
          },
        ]),
      ],
    });
    harness = h;
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'budget' }));
    const before = h.state();
    const { engagementId } = expectOk(await h.core.engage(CONTROLLER, 'loop', { kind: 'singleAction' }));
    const result = expectOk(await h.core.whenDisengaged(CONTROLLER, engagementId));
    expect(result.reason).toBe('aiFailed');
    expect(result.detail).toMatch(/execution budget/);
    expect(result.progress.playerActions).toBe(0);
    expect(calls).toBeGreaterThan(1000);
    expect(expectOk(h.core.getStatus(CONTROLLER)).autopilot).toBeNull();
    expect(h.state()).toEqual(before);
  });
});

describe('TLINE: Autosave navigation', () => {
  it('a Turn-end Autosave holds the Timeline of the Turn-end state, including its Undone actions', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'undone' }));
    expectOk(await h.act('gain', { amount: 1 }));
    expectOk(await h.act('gain', { amount: 2 }));
    const withBoth = h.state();
    expectOk(await h.core.undoAction(CONTROLLER));
    const turnEnd = h.state();
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER)).undoneActions).toBe(0);

    expectOk(await h.core.undoToAutosave(CONTROLLER));
    expect(h.state()).toEqual(turnEnd);
    expect(expectOk(h.core.getTimelineStatus(CONTROLLER))).toMatchObject({
      timelineEntries: 2,
      undoneActions: 1,
    });
    expectOk(await h.core.redoAction(CONTROLLER));
    expect(h.state()).toEqual(withBoth);
  });

  it('lowering the Autosave limit to 0 removes the Turn-end Autosaves at the next Turn end', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'limit' }));
    for (let i = 0; i < 3; i += 1) {
      expectOk(await h.core.advanceTurn(CONTROLLER));
    }
    expect(await turnEnds(h)).toEqual([1, 2, 3]);
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autosaveLimit', 2));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expect(await turnEnds(h)).toEqual([3, 4]);
    expectOk(await h.core.setGlobalSetting(CONTROLLER, 'autosaveLimit', 0));
    expectOk(await h.core.advanceTurn(CONTROLLER));
    expect(await turnEnds(h)).toEqual([]);
  });
});

describe('SAVES: Loading', () => {
  it('a body stored under another Campaign save ID is a Corrupt Campaign save', async () => {
    const h = await startHarness();
    expectOk(await h.core.createCampaign(CONTROLLER, { seed: 'one' }));
    const first = expectOk(await h.core.save(CONTROLLER)).saveId;
    expectOk(await h.act('gain', { amount: 5 }));
    const second = expectOk(await h.core.saveAsNew(CONTROLLER)).saveId;
    const firstSave = h.storage.saves.get(first);
    const secondSave = h.storage.saves.get(second);
    if (firstSave === undefined || secondSave === undefined) {
      throw new Error('The Campaign saves were not written');
    }
    h.storage.saves.set(first, { header: firstSave.header, body: secondSave.body });
    const before = h.state();
    const loaded = await h.core.load(CONTROLLER, first);
    expect(!loaded.ok && loaded.error.code).toBe('corrupt_campaign_save');
    expect(h.state()).toEqual(before);
  });
});

describe('DEV and DETERM: hidden values in the interfaces', () => {
  it('the terminal CLI shows the Campaign seed only while Dev mode is enabled', async () => {
    const { engine } = await startEngine();
    const lines: string[] = [];
    const text = createCli(engine, { json: false, write: (line) => lines.push(line) });
    const json = createCli(engine, { json: true, write: (line) => lines.push(line) });
    await text.execute('new secret-seed');
    await text.execute('status');
    await json.execute('status');
    expect(lines.join('\n')).not.toContain('secret-seed');
    await text.execute('dev on');
    await text.execute('status');
    expect(lines.at(-1)).toContain('secret-seed');
    await json.execute('dev maybe');
    expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({ ok: false, error: { code: 'invalid_command' } });
    expect(ok(engine.session.getStatus()).devMode).toBe(true);
  });

  it('full Campaign state inspection is read-only', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'frozen' }));
    ok(engine.session.developer.enable());
    const state = ok(engine.developer.queries.getCampaignState()) as {
      worldState: { currentWorldState: object };
    };
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.worldState.currentWorldState)).toBe(true);
  });
});

describe('BOOT: the Bootstrap GDRs', () => {
  it('supplies 36 GDRs in 20 files, and a Victory path from the first Lead to the Faction elimination', () => {
    expect(RAW_GDR_FILES).toHaveLength(20);
    expect(RAW_GDR_FILES.reduce((sum, file) => sum + file.gdrs.length, 0)).toBe(36);
    const catalog = bootstrapGdrCatalog();
    const leads = catalog.leads;
    const sites = catalog.missionSiteArchetypes;
    // Follow the Leads from one without prerequisites to one whose Mission site eliminates the Faction.
    let lead = leads.find((item) => item.requires.length === 0);
    const path: string[] = [];
    while (lead !== undefined) {
      const current = lead;
      path.push(current.id);
      const site = sites.find((item) => item.id === current.onCompletion.createMissionSite);
      if (site?.onWin?.eliminateTargetFaction === true) {
        break;
      }
      lead = leads.find((item) =>
        item.requires.some((required) => required.missionWon === current.onCompletion.createMissionSite),
      );
    }
    expect(path).toEqual(['locate_red_dawn_member', 'locate_red_dawn_safehouse', 'locate_red_dawn_hq']);
    expect(lead).toBeDefined();
  });
});
