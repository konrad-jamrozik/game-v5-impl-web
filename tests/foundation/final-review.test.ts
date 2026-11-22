/** Tests for the behaviors the final conformance reviews found untested or wrong. */
import { describe, expect, it } from 'vite-plus/test';
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
  it('supplies 268 GDRs, and a Victory path through the Leads of every Faction to Peace on Earth', () => {
    // GDRS, GDR files: 23 files that each hold every GDR of one Type, and one file for each of the 136 Compendium
    // articles in the one directory that holds one file per GDR.
    const articleFiles = RAW_GDR_FILES.filter((file) =>
      file.path.startsWith('compendium/compendium_articles/'),
    );
    expect(articleFiles).toHaveLength(136);
    expect(RAW_GDR_FILES).toHaveLength(23 + 136);
    expect(RAW_GDR_FILES.reduce((sum, file) => sum + file.gdrs.length, 0)).toBe(268);
    const catalog = bootstrapGdrCatalog();
    // GDRS, Scope: the counts of the GDRs that grew.
    expect([
      catalog.enemyArchetypes.size,
      catalog.weapons.size,
      catalog.armors.size,
      catalog.leads.length,
      catalog.missionSiteArchetypes.filter((site) => site.kind === 'initiative').length,
      catalog.missionSiteArchetypes.filter((site) => site.kind === 'response').length,
      catalog.factionActivityLevels.size,
      catalog.factionOperationLevels.length,
    ]).toEqual([9, 9, 9, 44, 6, 15, 8, 5]);
    expect(catalog.factionArchetypes.map((faction) => [faction.id, faction.initialActivityLevel])).toEqual([
      ['red_dawn', 'faint'],
      ['exalt', 'dormant'],
      ['black_lotus', 'dormant'],
    ]);
    expect(catalog.factionActivityLevels.get('dormant')).toMatchObject({
      operationEveryTurns: null,
      operationLevelWeights: [],
    });
    const byId = (id: string) => catalog.leads.find((lead) => lead.id === id)!;
    // The first Lead concerns no Faction and creates no Mission site; it is completed once.
    expect(byId('criminal_organizations')).toMatchObject({
      faction: null,
      discoveredWhen: null,
      investigateAgain: 'never',
      onCompletion: { createMissionSite: null, eliminateFaction: false, winCampaign: false },
    });
    // Follow each Faction's chain from its first Lead: a locate Lead's Won Mission discovers the next Lead, and a Lead
    // that creates no Mission site discovers the next one by its completion, up to the Terminate Lead.
    const next = (lead: string, site: string | null) =>
      catalog.leads.filter((item) => {
        const condition = item.discoveredWhen;
        return site === null
          ? condition?.kind === 'lead_completed' && condition.lead === lead
          : condition?.kind === 'mission_won' &&
              condition.missionSiteArchetype === site &&
              item.faction === byId(lead).faction;
      });
    for (const faction of catalog.factionArchetypes) {
      let lead = byId(`locate_${faction.id}_member`);
      expect(lead.discoveredWhen).toEqual({ kind: 'lead_completed', lead: 'criminal_organizations' });
      const path: string[] = [lead.id];
      while (!lead.onCompletion.eliminateFaction) {
        const following = next(lead.id, lead.onCompletion.createMissionSite);
        expect(following, `after ${lead.id}`).toHaveLength(1);
        lead = following[0]!;
        path.push(lead.id);
      }
      expect(path).toHaveLength(14);
      expect(path.filter((id) => byId(id).onCompletion.createMissionSite !== null)).toHaveLength(6);
      expect(path.at(-1)).toBe(`terminate_${faction.id}`);
      expect(path.every((id) => byId(id).faction === faction.id)).toBe(true);
      // The locate Leads of tiers 1 to 5 can be completed again; the HQ Lead only until its Mission is Won.
      expect(byId(`locate_${faction.id}_outpost`).investigateAgain).toBe('always');
      expect(byId(`locate_${faction.id}_hq`).investigateAgain).toBe('until_mission_won');
      expect(byId(`${faction.id}_profile`).investigateAgain).toBe('never');
    }
    // Peace on Earth wins the Campaign once all three Terminate Leads are completed.
    expect(byId('peace_on_earth')).toMatchObject({
      faction: null,
      discoveredWhen: {
        kind: 'all',
        conditions: catalog.factionArchetypes.map((faction) => ({
          kind: 'lead_completed',
          lead: `terminate_${faction.id}`,
        })),
      },
      onCompletion: { createMissionSite: null, eliminateFaction: false, winCampaign: true },
    });
    // No Mission site eliminates a Faction.
    expect(catalog.missionSiteArchetypes.some((site) => site.onWin.eliminateTargetFaction)).toBe(false);
  });
});
