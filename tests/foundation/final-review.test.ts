/** Tests for the behaviors the final conformance reviews found untested or wrong. */
import { describe, expect, it } from 'vite-plus/test';
import { createCli } from '../../src/cli/cli.ts';
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
    const second = expectOk(await h.core.save(CONTROLLER)).saveId;
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
      timeline: { turnStartState: { liveWorldState: object } };
    };
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.timeline.turnStartState.liveWorldState)).toBe(true);
  });
});

describe('GDRS: the GDRs', () => {
  // TESTVAL, Content checked by structure: the walk checks where each chain leads, never how many GDRs it passes.
  it('supply a Victory path through the Leads of every Faction to Peace on Earth', () => {
    const catalog = bootstrapGdrCatalog();
    const byId = (id: string) => catalog.leads.find((lead) => lead.id === id)!;
    // The first Lead, discovered at the start, concerns no Faction.
    const first = catalog.leads.filter((lead) => lead.discoveredWhen === null);
    expect(first.map((lead) => lead.faction)).toEqual([null]);
    // Follow each Faction's chain from its first Lead: a Lead that creates a Mission site discovers the next Lead by a
    // Won Mission there, and one that creates none discovers the next one by its completion, up to the Terminate Lead.
    const next = (lead: string, site: string | null) =>
      catalog.leads.filter((item) => {
        const condition = item.discoveredWhen;
        return site === null
          ? condition?.kind === 'lead_completed' && condition.lead === lead
          : condition?.kind === 'mission_won' &&
              condition.missionSiteArchetype === site &&
              item.faction === byId(lead).faction;
      });
    const terminates: string[] = [];
    for (const faction of catalog.factionArchetypes) {
      const starts = next(first[0]!.id, null).filter((lead) => lead.faction === faction.id);
      expect(starts, `the first Lead of ${faction.id}`).toHaveLength(1);
      let lead = starts[0]!;
      const path: string[] = [lead.id];
      while (!lead.onCompletion.eliminateFaction) {
        const following = next(lead.id, lead.onCompletion.createMissionSite);
        expect(following, `after ${lead.id}`).toHaveLength(1);
        lead = following[0]!;
        // A chain that came back to a Lead it passed would never reach its Terminate Lead.
        expect(path, `after ${lead.id}`).not.toContain(lead.id);
        path.push(lead.id);
      }
      expect(path.at(-1)).toBe(`terminate_${faction.id}`);
      expect(path.every((id) => byId(id).faction === faction.id)).toBe(true);
      terminates.push(lead.id);
    }
    // Peace on Earth, the one Lead that wins the Campaign, is discovered once every Terminate Lead is completed.
    const winning = catalog.leads.filter((lead) => lead.onCompletion.winCampaign);
    expect(winning.map((lead) => lead.id)).toEqual(['peace_on_earth']);
    expect(winning[0]).toMatchObject({
      faction: null,
      discoveredWhen: {
        kind: 'all',
        conditions: terminates.map((lead) => ({ kind: 'lead_completed', lead })),
      },
      onCompletion: { createMissionSite: null, eliminateFaction: false },
    });
  });
});
