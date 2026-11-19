/** Tests, from the former Acceptance examples, of COMP (Compendium). */
import { describe, expect, it } from 'vitest';
import { visibleArticles } from '../../src/engine/mechanics/compendium/compendium.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { encyclopediaArticlesView } from '../../src/engine/views/views.ts';
import { bootstrapGdrCatalog, type GdrCatalog } from '../../src/gdr/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';
import {
  act,
  advance,
  agentIds,
  arriveAgent,
  catalogWith,
  expectDefective,
  gdrs,
  missionAt,
  newCampaign,
  onlyFaction,
  RED_DAWN_ONLY_FILES,
  tweak,
  winning,
} from '../helpers/game.ts';

const ARTICLES = 'compendium/encyclopedia_articles.yaml';

const visible = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  encyclopediaArticlesView(state, catalog).map((article) => article.id);
const sites = (state: CampaignState) => Object.values(state.world.current.missionSites);
const arrive = (state: CampaignState) =>
  tweak(state, (world) => {
    for (const item of Object.values(world.agents)) {
      arriveAgent(item.state);
    }
  });
/** Sets an Investigation's progress just short of its Actual required progress, so that any gain completes it. */
const finishing = (state: CampaignState, id: string) =>
  tweak(state, (world) => {
    const investigation = world.investigations[id]!;
    investigation.state.progress = investigation.constants.actualRequiredProgress * 100 - 1;
  });

describe('COMP: the Bootstrap EncyclopediaArticle GDRs', () => {
  it('supplies six Guide articles and one article about each of 32 other GDRs, in Game build order', () => {
    const articles = bootstrapGdrCatalog().encyclopediaArticles;
    expect(articles).toHaveLength(38);
    expect(articles.filter((article) => article.subject === null).map((article) => article.id)).toEqual([
      'guide_agency',
      'guide_agents',
      'guide_investigations',
      'guide_missions',
      'guide_panic',
      'guide_upgrades',
    ]);
    for (const article of articles.filter((item) => item.subject !== null)) {
      expect(article.id).toBe(`${article.subject}_article`);
    }
    expect(articles.find((article) => article.id === 'soldier_article')).toMatchObject({
      subject: 'soldier',
      subjectType: 'EnemyArchetype',
    });
  });
});

describe('COMP: examples', () => {
  it('Campaign creation', () => {
    const state = newCampaign();
    const ids = visible(state);
    for (const id of [
      'guide_missions',
      'soldier_article',
      'transport_cap_article',
      'locate_red_dawn_member_article',
      'apprehend_member_article',
    ]) {
      expect(ids).toContain(id);
    }
    for (const id of [
      'locate_red_dawn_safehouse_article',
      'raid_safehouse_article',
      'foil_sabotage_article',
    ]) {
      expect(ids).not.toContain(id);
    }
    // Every other article: the Guide articles, and every Agent, Enemy, Weapon, Upgrade, and initial Faction article.
    expect(ids).toEqual([
      'guide_agency',
      'guide_agents',
      'guide_investigations',
      'guide_missions',
      'guide_panic',
      'guide_upgrades',
      'field_agent_article',
      'initiate_article',
      'soldier_article',
      'cult_leader_article',
      'sidearm_article',
      'rifle_article',
      'heavy_rifle_article',
      'agent_cap_article',
      'transport_cap_article',
      'training_cap_article',
      'weapon_damage_article',
      'max_health_article',
      'training_skill_gain_article',
      'exhaustion_recovery_article',
      'health_recovery_article',
      'red_dawn_article',
      'locate_red_dawn_member_article',
      'apprehend_member_article',
    ]);
    // The query returns nothing about an article that is not Player-visible, not even that it exists.
    const references = encyclopediaArticlesView(state, gdrs).flatMap((article) => [
      article.id,
      article.subject ?? '',
    ]);
    expect(references.join(' ')).not.toMatch(/safehouse|locate_red_dawn_hq|raid_hq|foil_/);
    const soldier = encyclopediaArticlesView(state, gdrs).find((article) => article.id === 'soldier_article');
    expect(soldier).toEqual({
      id: 'soldier_article',
      title: expect.any(String),
      body: expect.any(String),
      subject: 'soldier',
      subjectType: 'EnemyArchetype',
    });
    // A Guide article is reported without a subject.
    expect(encyclopediaArticlesView(state, gdrs)[0]).toMatchObject({ subject: null, subjectType: null });
  });

  it('The first Mission Won', () => {
    let state = newCampaign();
    const ids = agentIds(state);
    state = act(state, 'startInvestigation', { lead: 'locate_red_dawn_member', agents: [ids[0]] });
    const investigation = Object.values(state.world.current.investigations)[0]!.id;
    state = advance(state);
    state = advance(finishing(state, investigation));
    const site = sites(state)[0]!;
    expect(site.archetype).toBe('apprehend_member');
    state = act(arrive(state), 'deployAgents', { missionSite: site.id, agents: ids });
    const before = state;
    const beforeIds = visible(before);
    expect(beforeIds).not.toContain('locate_red_dawn_safehouse_article');
    expect(beforeIds).not.toContain('raid_safehouse_article');

    // The Advance turn ending Turn t: the Mission is Won and discovers locate_red_dawn_safehouse.
    state = advance(state, winning(state, site.id));
    expect(state.world.current.missions[missionAt(state, site.id)]!.state.lifecycle).toBe('Won');
    const after = visible(state);
    expect(after).toContain('locate_red_dawn_safehouse_article');
    expect(after).toContain('raid_safehouse_article');
    expect(after).not.toContain('locate_red_dawn_hq_article');
    expect(after).not.toContain('raid_hq_article');
    // Game build order: each article where the Game build supplies it.
    expect(after.indexOf('locate_red_dawn_member_article')).toBeLessThan(
      after.indexOf('locate_red_dawn_safehouse_article'),
    );

    // Undo restores the World state before that Advance turn, in which both articles are absent again.
    expect(visible(before)).toEqual(beforeIds);
  });

  it('A Response Mission site', () => {
    let state = tweak(newCampaign(), (world) => {
      Object.values(world.factions)[0]!.state.turnsUntilNextOperation = 1;
    });
    const f = onlyFaction(state).id;
    expect(visible(state)).not.toContain('foil_sabotage_article');
    state = advance(state, {
      [`faction.${f}.operationLevel`]: [2],
      [`faction.${f}.operationInterval`]: [20],
      [`mission.archetypeSelection.${f}`]: ['foil_sabotage'],
    });
    expect(sites(state).map((site) => site.archetype)).toEqual(['foil_sabotage']);
    expect(visible(state)).toContain('foil_sabotage_article');
    expect(visible(state)).not.toContain('foil_recruitment_push_article');

    // The Mission site stays in Campaign state when it is no longer Active, so the article stays Player-visible.
    const expired = tweak(state, (world) => {
      for (const site of Object.values(world.missionSites)) {
        site.state.lifecycle = 'Expired';
      }
    });
    expect(visible(expired)).toContain('foil_sabotage_article');
  });

  it('GDR validation', () => {
    const article = (values: Record<string, unknown>) => ({
      id: 'test_article',
      type: 'EncyclopediaArticle',
      title: 'Test article',
      body: 'A test article.',
      ...values,
    });
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ subject: 'no_such_gdr' }, /test_article: Subject exists \(no_such_gdr\)/],
      [{ subject: 'guide_panic' }, /test_article: Subject exists \(guide_panic\)/],
      [{ subject: 'soldier' }, /test_article: One article per subject \(soldier\)/],
      [{ title: 'Panic' }, /test_article: Unique titles \(Panic\)/],
      [{ body: '' }, /body Text is present/],
      [{ image: 'panic.png' }, /Exact properties \(image\)/],
    ];
    for (const [values, message] of cases) {
      expect(() => catalogWith((raw) => raw.add(ARTICLES, article(values)))).toThrow(message);
    }
    expectDefective((raw) => raw.add(ARTICLES, article({ title: '' })));
    expectDefective((raw) => {
      const { title: _title, ...rest } = article({});
      raw.add(ARTICLES, rest);
    });
    // A subject that identifies GDRs of more than one Type identifies no single GDR (DEC-014).
    expect(() =>
      catalogWith((raw) => {
        raw.add('combat/weapons.yaml', {
          id: 'soldier',
          type: 'Weapon',
          name: 'Soldier',
          base_weapon_damage: 1,
        });
      }),
    ).toThrow(/soldier_article: Subject exists \(soldier identifies GDRs of more than one Type\)/);
  });

  it('A test Game build that supplies no EncyclopediaArticle is valid and reports no articles', () => {
    const catalog = catalogWith((raw) => {
      raw.files.splice(
        raw.files.findIndex((file) => file.path === ARTICLES),
        1,
      );
    });
    expect(catalog.encyclopediaArticles).toEqual([]);
    expect(visible(newCampaign({ catalog }), catalog)).toEqual([]);
  });

  it('No gameplay effect: equal Campaign state with any set of articles, or none', () => {
    const none = catalogWith((raw) => {
      raw.files.splice(
        raw.files.findIndex((file) => file.path === ARTICLES),
        1,
      );
    });
    let withArticles = newCampaign();
    let withoutArticles = newCampaign({ catalog: none });
    expect(withoutArticles).toEqual(withArticles);
    for (let turn = 0; turn < 3; turn += 1) {
      withArticles = advance(withArticles);
      withoutArticles = advance(withoutArticles, {}, none);
    }
    expect(withoutArticles).toEqual(withArticles);
    expect(visibleArticles(withArticles.world.current, gdrs)).toHaveLength(24);
  });
});

describe('COMP: Player API', () => {
  it('getEncyclopediaArticles returns the Player-visible articles, and follows the World state on undo', async () => {
    const { engine } = await startEngine({ gdrFiles: RED_DAWN_ONLY_FILES });
    expect(engine.player.queries.getEncyclopediaArticles().ok).toBe(false);
    ok(await engine.session.campaign.create({ seed: 'compendium' }));
    const initial = ok(engine.player.queries.getEncyclopediaArticles());
    expect(initial.map((article) => article.id)).toEqual(visible(newCampaign()));
    expect(initial.find((article) => article.id === 'red_dawn_article')).toMatchObject({
      subject: 'red_dawn',
      subjectType: 'FactionArchetype',
    });

    // Play with the Basic Autopilot AI, one Advance turn at a time, until an Advance turn discovers a Lead.
    const has = (id: string) =>
      ok(engine.player.queries.getEncyclopediaArticles()).some((article) => article.id === id);
    let turns = 0;
    while (!has('locate_red_dawn_safehouse_article') && turns < 300) {
      const { engagementId } = ok(
        await engine.session.autopilot.engage('basic', { kind: 'turnAdvancements', count: 1 }),
      );
      ok(await engine.session.autopilot.whenDisengaged(engagementId));
      expect(ok(engine.player.queries.getCurrentState()).ending).toBeNull();
      turns += 1;
    }
    expect(has('locate_red_dawn_safehouse_article')).toBe(true);
    expect(has('raid_safehouse_article')).toBe(true);
    expect(has('locate_red_dawn_hq_article')).toBe(false);

    // Undo to the Autosave before that Advance turn: the two articles are absent again.
    ok(await engine.session.timeline.undoToAutosave());
    expect(has('locate_red_dawn_safehouse_article')).toBe(false);
    expect(has('raid_safehouse_article')).toBe(false);
  });
});
