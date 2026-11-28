/** COMPV: the Compendium View's categories, search, Article history, and Data sheets; TRVIEW, final condition. */
import { describe, expect, it } from 'vite-plus/test';
import type { CompendiumArticleView } from '../../src/engine/index.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  articleForTermView,
  compendiumArticlesView,
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  gameDataView,
  revealedCompendiumView,
  revealedLeadsView,
} from '../../src/engine/views/views.ts';
import { finalCondition } from '../../src/web/combat-log.ts';
import { groupDigits } from '../../src/web/format.ts';
import {
  articlesOf,
  categoryOf,
  compendiumCategories,
  currentArticle,
  dataSheet,
  effectParts,
  firstArticle,
  firstMatchingArticle,
  hasNextArticle,
  hasPreviousArticle,
  nextArticle,
  openHistory,
  previousArticle,
  searchArticles,
  showArticle,
  visibleHistory,
  type DataSheet,
  type SheetPart,
} from '../../src/web/compendium.ts';
import { q, roundDown, roundUp } from '../../src/kernel/index.ts';
import { catalogWith, completeLead, gdrs, newCampaign, tweak } from '../helpers/game.ts';

/** COMPV, Lead data sheet: the wording of each `investigate_again` value. */
const INVESTIGATE_AGAIN: Readonly<Record<string, string>> = {
  never: 'Never',
  until_mission_won: 'Until its Mission is won',
  always: 'Always',
};

/** COMPV, Mission site data sheet: `expires_in_turns` with "turns", and with "turn" for 1. */
const expiresText = (turns: number) => `${turns} ${turns === 1 ? 'turn' : 'turns'}`;

const article = (
  id: string,
  title: string,
  values: Partial<CompendiumArticleView> = {},
): CompendiumArticleView => ({
  id,
  category: 'guide',
  title,
  subject: null,
  subjectType: null,
  listedUnder: null,
  body: [],
  formulas: [],
  seeAlso: [],
  ...values,
});
const subject = (id: string, title: string, subjectType: string) =>
  article(`${id}_article`, title, { category: 'subject', subject: id, subjectType });

/** A Data sheet value as text, with each Article link in square brackets. */
const text = (parts: readonly SheetPart[]) =>
  parts.map((part) => (part.article === undefined ? part.text : `[${part.text}]`)).join('');
const rowsOf = (sheet: DataSheet | null) =>
  Object.fromEntries((sheet?.rows ?? []).map((row) => [row.label, text(row.value)]));

/** The Data sheet of the Subject article about `id` in a World state, from what Player API reports of it. */
function sheetOf(state: CampaignState, id: string): DataSheet | null {
  const articles = compendiumArticlesView(state, gdrs);
  const shown = articles.find((item) => item.subject === id);
  if (shown === undefined) {
    throw new Error(`No Player-visible article about ${id}`);
  }
  return dataSheet(shown, {
    gameData: gameDataView(gdrs),
    state: currentLiveWorldStateView(state, gdrs),
    retired: currentRetiredWorldStateView(state, gdrs),
    articles,
    articleForTerm: (term) => articleForTermView(state, gdrs, term),
  });
}

/**
 * The Data sheet of the article about `id` under Reveal hidden content (COMPV): from the Revealed Compendium, its
 * Article term lookup, and the revealed Leads, as the GUI reads them through `developer.queries`.
 */
function revealedSheetOf(state: CampaignState, id: string): DataSheet | null {
  const revealed = revealedCompendiumView(state, gdrs);
  const shown = revealed.articles.find((item) => item.subject === id)!;
  return dataSheet(shown, {
    gameData: gameDataView(gdrs),
    state: currentLiveWorldStateView(state, gdrs),
    retired: { ...currentRetiredWorldStateView(state, gdrs), leads: revealedLeadsView(state, gdrs) },
    articles: revealed.articles,
    articleForTerm: (term) => revealed.terms[term.toLowerCase()] ?? null,
  });
}

/** A World state in which every Lead of the test Game build is discovered and both Response Mission sites exist. */
/** Every Lead discovered, and `red_dawn_profile` completed, which makes the article about Red Dawn Player-visible. */
function everythingVisible(): CampaignState {
  const state = tweak(completeLead(newCampaign(), 'red_dawn_profile'), (world) => {
    for (const lead of gdrs.leads) {
      if (!world.discoveredLeads.includes(lead.id)) {
        world.discoveredLeads.push(lead.id);
      }
    }
  });
  return state;
}

describe('COMPV: Panes', () => {
  const articles = [
    subject('rifle', 'Rifle', 'Weapon'),
    article('mechanics_skill', 'skill gain', { category: 'mechanics' }),
    article('mechanics_combat', 'Combat', { category: 'mechanics' }),
    subject('soldier', 'Soldier', 'EnemyArchetype'),
    article('guide_b', 'b guide'),
    article('guide_a', 'A guide'),
    subject('red_dawn', 'Red Dawn', 'FactionArchetype'),
    subject('agency', 'The Agency', 'AgencyArchetype'),
    subject('apprehend_member', 'Apprehend member', 'MissionSiteArchetype'),
  ];

  it('lists Guide first, then Mechanics, then the subject categories by name, each with its count', () => {
    expect(compendiumCategories(articles)).toEqual([
      { name: 'Guide', count: 2 },
      { name: 'Mechanics', count: 2 },
      { name: 'Enemies', count: 1 },
      { name: 'Factions', count: 1 },
      { name: 'Mission sites', count: 1 },
      { name: 'Other', count: 1 },
      { name: 'Weapons', count: 1 },
    ]);
    // A Subject article whose subject has a Type without a Data sheet is listed under Other.
    expect(categoryOf(subject('agency', 'The Agency', 'AgencyArchetype'))).toBe('Other');
    expect(categoryOf(subject('field_agent', 'Field agent', 'AgentArchetype'))).toBe('Agents');
    expect(categoryOf(subject('agent_cap', 'Agent cap', 'Upgrade'))).toBe('Upgrades');
    expect(categoryOf(subject('standard_uniform', 'Standard uniform', 'Armor'))).toBe('Armor');
    expect(categoryOf(subject('lead', 'A lead', 'Lead'))).toBe('Leads');
  });

  it('sorts the articles of a category by displayed title ignoring case', () => {
    expect(articlesOf(articles, 'Guide').map((item) => item.title)).toEqual(['A guide', 'b guide']);
    expect(articlesOf(articles, 'Mechanics').map((item) => item.title)).toEqual(['Combat', 'skill gain']);
    // When the Compendium View opens, the Guide category and its first article are selected.
    expect(firstArticle(articles)).toBe('guide_a');
    expect(firstArticle([])).toBeNull();
  });

  it('lists every Weapon, then every AmmoType, under Weapons', () => {
    const weapons = [
      subject('rifle_ammo', 'Rifle ammo', 'AmmoType'),
      subject('rifle', 'Rifle', 'Weapon'),
      subject('pistol_ammo', 'Pistol ammo', 'AmmoType'),
      subject('basic_pistol', 'Basic pistol', 'Weapon'),
    ];
    expect(categoryOf(weapons[0]!)).toBe('Weapons');
    expect(articlesOf(weapons, 'Weapons').map((item) => item.title)).toEqual([
      'Basic pistol',
      'Rifle',
      'Pistol ammo',
      'Rifle ammo',
    ]);
  });

  it('lists a Mechanics article with listed_under in that Type category, after its Subject articles', () => {
    const agents = [
      article('mechanics_deployable_agent', 'Deployable Agent', {
        category: 'mechanics',
        listedUnder: 'AgentArchetype',
      }),
      subject('field_agent', 'Field agent', 'AgentArchetype'),
      article('mechanics_away_agent', 'Away Agent', { category: 'mechanics', listedUnder: 'AgentArchetype' }),
      article('mechanics_combat', 'Combat', { category: 'mechanics' }),
    ];
    expect(compendiumCategories(agents)).toEqual([
      { name: 'Mechanics', count: 1 },
      { name: 'Agents', count: 3 },
    ]);
    expect(articlesOf(agents, 'Agents').map((item) => item.title)).toEqual([
      'Field agent',
      'Away Agent',
      'Deployable Agent',
    ]);
  });

  it('lists the articles listed under the topic combat in Combat, right after Agents, by displayed title', () => {
    const combat = [
      subject('rifle', 'Rifle', 'Weapon'),
      article('mechanics_hit_chance', 'Hit chance', { category: 'mechanics', listedUnder: 'combat' }),
      subject('soldier', 'Soldier', 'EnemyArchetype'),
      article('mechanics_combat', 'Combat', { category: 'mechanics', listedUnder: 'combat' }),
      subject('field_agent', 'Field agent', 'AgentArchetype'),
      subject('standard_uniform', 'Standard uniform', 'Armor'),
      article('mechanics_skill', 'Skill', { category: 'mechanics' }),
    ];
    expect(compendiumCategories(combat).map((category) => category.name)).toEqual([
      'Mechanics',
      'Agents',
      'Combat',
      'Armor',
      'Enemies',
      'Weapons',
    ]);
    expect(articlesOf(combat, 'Combat').map((item) => item.title)).toEqual(['Combat', 'Hit chance']);
  });

  it('searches the displayed titles of every category, ignoring case, and leaves out an empty category', () => {
    const found = searchArticles(articles, 'GUI');
    expect(found.map((item) => item.id)).toEqual(['guide_b', 'guide_a']);
    expect(compendiumCategories(found)).toEqual([{ name: 'Guide', count: 2 }]);
    // While the search field holds text, the categories show the numbers of matching articles.
    expect(compendiumCategories(searchArticles(articles, 'r'))).toEqual([
      { name: 'Enemies', count: 1 },
      { name: 'Factions', count: 1 },
      { name: 'Mission sites', count: 1 },
      { name: 'Weapons', count: 1 },
    ]);
    expect(searchArticles(articles, '')).toHaveLength(articles.length);
    expect(searchArticles(articles, 'no such title')).toEqual([]);
  });

  it('Enter in the search field shows the first article of the first category listed, or nothing', () => {
    // "r" matches no Guide or Mechanics article, so the first category listed is Enemies.
    expect(firstMatchingArticle(articles, 'r')).toBe('soldier_article');
    expect(firstMatchingArticle(articles, 'GUI')).toBe('guide_a');
    expect(firstMatchingArticle(articles, 'skill')).toBe('mechanics_skill');
    expect(firstMatchingArticle(articles, 'no such title')).toBeNull();
    // An empty search lists every article, so Enter shows the first article of Guide.
    expect(firstMatchingArticle(articles, '')).toBe('guide_a');
  });
});

describe('COMPV: Following links, the Article history', () => {
  it('Open: holds only the article selected, which is current', () => {
    const history = openHistory('a');
    expect(history).toEqual({ articles: ['a'], current: 0 });
    expect(currentArticle(history)).toBe('a');
    expect(hasPreviousArticle(history)).toBe(false);
    expect(hasNextArticle(history)).toBe(false);
  });

  it('Show another article: removes every article after the current one and adds the article shown', () => {
    let history = showArticle(showArticle(openHistory('a'), 'b'), 'c');
    expect(history).toEqual({ articles: ['a', 'b', 'c'], current: 2 });
    // Showing the current article again changes nothing.
    expect(showArticle(history, 'c')).toBe(history);
    history = previousArticle(previousArticle(history));
    expect(currentArticle(history)).toBe('a');
    expect(hasNextArticle(history)).toBe(true);
    history = showArticle(history, 'd');
    expect(history).toEqual({ articles: ['a', 'd'], current: 1 });
    // An article may be shown again later; it is added once more.
    expect(showArticle(history, 'a')).toEqual({ articles: ['a', 'd', 'a'], current: 2 });
  });

  it('Previous article and Next article move the current one, and stop at either end', () => {
    const history = showArticle(showArticle(openHistory('a'), 'b'), 'c');
    const back = previousArticle(history);
    expect(currentArticle(back)).toBe('b');
    expect(back.articles).toEqual(['a', 'b', 'c']);
    expect(currentArticle(nextArticle(back))).toBe('c');
    expect(nextArticle(history)).toBe(history);
    const first = previousArticle(back);
    expect(previousArticle(first)).toBe(first);
    expect(hasPreviousArticle(first)).toBe(false);
  });

  it('No longer Player-visible: the article leaves, and the one before it, or else after it, becomes current', () => {
    const history = { articles: ['a', 'b', 'c', 'd'], current: 2 };
    const visible = (...ids: string[]) => new Set(ids);
    // Nothing changes while every article is Player-visible.
    expect(visibleHistory(history, visible('a', 'b', 'c', 'd'), 'g')).toBe(history);
    // Another article leaves: the current one stays current.
    expect(visibleHistory(history, visible('a', 'c', 'd'), 'g')).toEqual({
      articles: ['a', 'c', 'd'],
      current: 1,
    });
    expect(visibleHistory(history, visible('a', 'b', 'c'), 'g')).toEqual({
      articles: ['a', 'b', 'c'],
      current: 2,
    });
    // The current one leaves: the article before it becomes current.
    expect(visibleHistory(history, visible('a', 'b', 'd'), 'g')).toEqual({
      articles: ['a', 'b', 'd'],
      current: 1,
    });
    // No article before it: the article after it.
    expect(visibleHistory(history, visible('d'), 'g')).toEqual({ articles: ['d'], current: 0 });
    // Neither: the first article of the Guide category is shown as in Open.
    expect(visibleHistory(history, visible('g'), 'g')).toEqual({ articles: ['g'], current: 0 });
    expect(visibleHistory({ articles: [], current: 0 }, visible('g'), 'g')).toEqual(openHistory('g'));
  });
});

describe('COMPV: Subject data sheets', () => {
  it('Agent data sheet: what a newly hired Agent starts with', () => {
    const state = newCampaign();
    const agent = gdrs.agentArchetype;
    const weapon = gdrs.weapons.get(agent.weapon)!;
    const armor = gdrs.armors.get(agent.armor)!;
    const sheet = sheetOf(state, agent.id);
    expect(sheet?.heading).toBe('New Agent');
    expect(rowsOf(sheet)).toEqual({
      Skill: String(agent.skill),
      Health: String(agent.baseHealth),
      Weapon: `[${weapon.name}] · damage ${weapon.damage}`,
      // E.g. "Standard uniform · armor 0", linked to the Subject article about the Armor.
      Armor: `[${armor.name}] · armor ${armor.armor}`,
    });
    // Labels: a label is an Article link to the article that the Article term lookup reports for its text.
    expect(sheet?.rows.map((row) => row.labelArticle)).toEqual([
      'mechanics_skill',
      'mechanics_health',
      null,
      'mechanics_damage',
    ]);
    // Numbers are in the Figure style.
    expect(sheet?.rows[0]?.value).toEqual([{ text: String(agent.skill), style: 'figure' }]);
  });

  it('Enemy data sheet: lists only the Player-visible Mission sites it appears at', () => {
    const soldier = gdrs.enemyArchetypes.get('soldier')!;
    const weapon = gdrs.weapons.get(soldier.weapon)!;
    const armor = gdrs.armors.get(soldier.armor)!;
    // At campaign creation no Player-visible Mission site holds a Soldier, so its article is not Player-visible (COMP,
    // Met subjects).
    expect(() => sheetOf(newCampaign(), 'soldier')).toThrow(/No Player-visible article about soldier/);
    // Under Reveal hidden content every article counts as Player-visible, so the row names every MissionSiteArchetype
    // that holds a Soldier.
    const revealed = rowsOf(revealedSheetOf(newCampaign(), 'soldier'));
    expect(revealed).toMatchObject({
      Skill: String(soldier.skill),
      Health: String(soldier.baseHealth),
      Weapon: `[${weapon.name}] · damage ${weapon.damage}`,
      // BOOT: the Soldier wears the Ballistic vest, which has a Subject article.
      Armor: `[${armor.name}] · armor ${armor.armor}`,
    });
    const holding = gdrs.missionSiteArchetypes.filter((site) =>
      site.enemies.some(([enemy]) => enemy === 'soldier'),
    );
    expect(revealed['Appears at']?.split(' · ')).toHaveLength(holding.length);
    const sheet = sheetOf(everythingVisible(), 'soldier');
    expect(sheet?.heading).toBe('Enemy');
    const appears = sheet?.rows.find((row) => row.label === 'Appears at');
    const names = gdrs.missionSiteArchetypes
      .filter((site) => site.kind === 'initiative' && site.enemies.some(([enemy]) => enemy === 'soldier'))
      .map((site) => site.name)
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
    expect(names.length).toBeGreaterThan(0);
    expect(text(appears?.value ?? [])).toBe(names.map((name) => `[${name}]`).join(' · '));
  });

  it('Weapon data sheet: its damage, the range of a hit, and who carries it', () => {
    const sidearm = gdrs.weapons.get(gdrs.agentArchetype.weapon)!;
    const sheet = sheetOf(newCampaign(), sidearm.id);
    expect(sheet?.heading).toBe('Weapon');
    const rows = rowsOf(sheet);
    expect(rows['Damage']).toBe(String(sidearm.damage));
    // COMBAT, Damage outcome: from weapon damage × (1 − weapon_damage_range), rounded up, to weapon damage ×
    // (1 + weapon_damage_range), rounded down, joined by an en dash, e.g. "5–15" for 10 and a range of 0.5.
    const range = gdrs.combatParameters.weaponDamageRange;
    const min = roundUp(q(sidearm.damage).mul(q(1).sub(range)));
    const max = roundDown(q(sidearm.damage).mul(q(1).add(range)));
    expect(rows['Damage of a hit']).toBe(`${min}–${max}`);
    expect(gameDataView(gdrs).weapons.find((item) => item.id === sidearm.id)?.damageOfAHit).toEqual({
      min,
      max,
    });
    expect(rows['Carried by']).toContain(`[${gdrs.agentArchetype.name}]`);
  });

  it('Armor data sheet: its armor and who wears it', () => {
    const armor = gdrs.armors.get(gdrs.agentArchetype.armor)!;
    const sheet = sheetOf(newCampaign(), armor.id);
    expect(sheet?.heading).toBe('Armor');
    expect(rowsOf(sheet)).toEqual({
      Armor: String(armor.armor),
      'Worn by': `[${gdrs.agentArchetype.name}]`,
    });
  });

  it('Upgrade data sheet: the price and what one acquisition adds, worded by its effect', () => {
    const state = newCampaign();
    const each = (id: string) => rowsOf(sheetOf(state, id))['Each purchase'];
    const upgrade = (id: string) => gdrs.upgrades.find((item) => item.id === id)!;
    expect(sheetOf(state, 'agent_cap')?.heading).toBe('Upgrade');
    expect(rowsOf(sheetOf(state, 'agent_cap'))['Price']).toBe(
      `${groupDigits(upgrade('agent_cap').price)} money`,
    );
    expect(each('agent_cap')).toBe(`+${upgrade('agent_cap').incrementHundredths / 100} to the Agent cap`);
    expect(each('transport_cap')).toMatch(/^\+\d+ to the Transport cap$/);
    expect(each('training_cap')).toMatch(/^\+\d+ to the Training cap$/);
    // GUI, Decimal quantities shown: the Increment of a Rate Upgrade is shown with two decimals.
    expect(each('training_skill_gain')).toMatch(/^\+\d+\.\d\d skill for each turn of Training$/);
    expect(each('exhaustion_recovery')).toMatch(/^\+\d+\.\d\d exhaustion recovered each turn$/);
    expect(each('health_recovery')).toMatch(/^\+\d+\.\d\d% of max health recovered each turn$/);
  });

  it('Faction data sheet: leads on to the Leads the Player has learned of', () => {
    // COMP, Article visibility: the article about Red Dawn waits for its profile Lead to be completed.
    expect(compendiumArticlesView(newCampaign(), gdrs).some((item) => item.subject === 'red_dawn')).toBe(
      false,
    );
    const profiled = completeLead(newCampaign(), 'red_dawn_profile');
    // The Leads of Red Dawn discovered so far, by the titles of their articles in alphabetical order.
    const ofRedDawn = gdrs.leads.filter((lead) => lead.faction === 'red_dawn').map((lead) => lead.id);
    const learned = profiled.world.current.discoveredLeads.filter((id) => ofRedDawn.includes(id));
    expect(learned.length).toBeGreaterThan(0);
    expect(learned.length).toBeLessThan(ofRedDawn.length);
    const titles = compendiumArticlesView(profiled, gdrs)
      .filter((item) => item.subject !== null && learned.includes(item.subject))
      .map((item) => item.title)
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
    expect(titles).toHaveLength(learned.length);
    expect(rowsOf(sheetOf(profiled, 'red_dawn'))).toEqual({
      Leads: titles.map((title) => `[${title}]`).join(' · '),
    });
    const all = rowsOf(sheetOf(everythingVisible(), 'red_dawn'))['Leads'] ?? '';
    expect(all.split(' · ')).toHaveLength(ofRedDawn.length);
  });

  it('Lead data sheet: its Faction, its Required progress once Assessed, and what it reveals', () => {
    const state = newCampaign();
    const lead = gdrs.leads.find((item) => item.id === 'locate_red_dawn_member')!;
    const site = gdrs.missionSiteArchetypes.find((item) => item.id === lead.onCompletion.createMissionSite)!;
    const sheet = sheetOf(state, lead.id);
    expect(sheet?.heading).toBe('Lead');
    const faction = gdrs.factionArchetypes.find((item) => item.id === lead.faction)!;
    // The Faction is no Article link while the article about it is not Player-visible.
    expect(rowsOf(sheet)).toEqual({
      Faction: faction.name,
      'Required progress': 'Unknown',
      Reveals: `[${site.name}]`,
      'Can be investigated again': INVESTIGATE_AGAIN[lead.investigateAgain],
    });
    expect(rowsOf(sheetOf(completeLead(state, 'red_dawn_profile'), lead.id))['Faction']).toBe(
      `[${faction.name}]`,
    );
    // "Unknown" is in Text muted until the Lead is an Assessed Lead.
    expect(sheet?.rows[1]?.value).toEqual([{ text: 'Unknown', style: 'muted' }]);
  });

  it('Lead data sheet: no Faction or Reveals row for a Lead without them, and On completion for its other Effects', () => {
    const state = everythingVisible();
    // A Lead without `faction` and with an empty `on_completion`.
    expect(Object.keys(rowsOf(sheetOf(state, 'criminal_organizations')))).toEqual([
      'Required progress',
      'Can be investigated again',
    ]);
    // An `eliminate_faction` Effect, in Positive.
    const terminate = sheetOf(state, 'terminate_red_dawn');
    expect(rowsOf(terminate)['On completion']).toBe('Eliminates the Faction');
    expect(rowsOf(terminate)['Reveals']).toBeUndefined();
    expect(terminate?.rows.find((row) => row.label === 'On completion')?.value).toEqual([
      { text: 'Eliminates the Faction', style: 'good' },
    ]);
    // A `win_campaign` Effect, in Positive, for a Lead that concerns no Faction.
    const peace = rowsOf(sheetOf(state, 'peace_on_earth'));
    expect(peace['On completion']).toBe('Wins the Campaign');
    expect(peace['Faction']).toBeUndefined();
    // A Lead with only a `create_mission_site` Effect has no On completion row.
    expect(rowsOf(sheetOf(state, 'locate_red_dawn_member'))['On completion']).toBeUndefined();
  });

  it('Mission site data sheet: what awaits a team there and what is at stake', () => {
    const state = everythingVisible();
    const site = gdrs.missionSiteArchetypes.find((item) => item.id === 'apprehend_member')!;
    const sheet = sheetOf(state, site.id);
    expect(sheet?.heading).toBe('Mission site');
    const rows = rowsOf(sheet);
    expect(rows['Appears']).toBe('When an Investigation completes');
    // COMPV, Mission site data sheet: `expires_in_turns` with "turns", and with "turn" for 1, as below.
    expect(rows['Expires in']).toBe(expiresText(site.expiresInTurns));
    expect(rows['Enemies']).toBe(
      site.enemies
        .map(([enemy, count]) => `${count} × [${gdrs.enemyArchetypes.get(enemy)!.name}]`)
        .join(' · '),
    );
    expect(rows['Reward for a win']).toBe(
      effectText({
        money: site.onWin.money,
        funding: site.onWin.funding,
        panicHundredths: -site.onWin.panicReductionHundredths,
        eliminateFaction: site.onWin.eliminateTargetFaction,
      }),
    );
    const revealers = gdrs.leads
      .filter((lead) => lead.onCompletion.createMissionSite === site.id)
      .map((lead) => `[${lead.name}]`);
    expect(revealers.length).toBeGreaterThan(0);
    expect(rows['Revealed by']).toBe(revealers.join(' · '));
    expect(rows['If lost or expired']).toBeUndefined();
    // No Initiative Mission site eliminates a Faction any more: a Terminate Lead does.
    expect(rowsOf(sheetOf(state, 'raid_hq'))['Reward for a win']).not.toMatch(/Eliminates/);

    // A Response Mission site is Player-visible only while a Mission site of it exists.
    const response = gdrs.missionSiteArchetypes.find((item) => item.kind === 'response')!;
    const level = gdrs.factionOperationLevels.find((item) => item.level === response.operationLevel)!;
    const withSite = tweak(newCampaign(), (world) => {
      const existing = Object.values(world.missionSites)[0];
      expect(existing).toBeUndefined();
      world.missionSites['mission-site-1'] = {
        id: 'mission-site-1',
        archetype: response.id,
      } as (typeof world.missionSites)[string];
    });
    const articles = compendiumArticlesView(withSite, gdrs);
    const shown = articles.find((item) => item.subject === response.id)!;
    // A Fixture value of 1 for `expires_in_turns` shows the singular.
    const expiringAtOnce = catalogWith((raw) => {
      raw.get(response.id)['expires_in_turns'] = 1;
    });
    const responseRows = rowsOf(
      dataSheet(shown, {
        gameData: gameDataView(expiringAtOnce),
        state: currentLiveWorldStateView(newCampaign(), gdrs),
        retired: currentRetiredWorldStateView(newCampaign(), gdrs),
        articles,
        articleForTerm: () => null,
      }),
    );
    expect(responseRows['Appears']).toBe(
      `When a Faction carries out an operation of level ${level.level} (${level.name})`,
    );
    expect(responseRows['Expires in']).toBe(expiresText(1));
    expect(expiresText(1)).toBe('1 turn');
    expect(responseRows['Reward for a win']).toBe(
      effectText({ money: level.onWin.money, funding: level.onWin.funding }),
    );
    expect(responseRows['If lost or expired']).toBe(
      effectText({
        funding: level.onIgnoredOrLost.funding,
        panicHundredths: level.onIgnoredOrLost.panicIncreaseHundredths,
      }),
    );
    expect(responseRows['Revealed by']).toBeUndefined();
  });

  it('a Guide article, a Mechanics article, and a subject of another Type have no Data sheet', () => {
    const state = newCampaign();
    const sources = {
      gameData: gameDataView(gdrs),
      state: currentLiveWorldStateView(state, gdrs),
      retired: currentRetiredWorldStateView(state, gdrs),
      articles: compendiumArticlesView(state, gdrs),
      articleForTerm: () => null,
    };
    expect(dataSheet(article('guide_a', 'A guide'), sources)).toBeNull();
    expect(dataSheet(article('mechanics_a', 'A mechanic', { category: 'mechanics' }), sources)).toBeNull();
    expect(dataSheet(subject('agency', 'The Agency', 'AgencyArchetype'), sources)).toBeNull();
  });
});

const effectText = (effects: Parameters<typeof effectParts>[0]) => text(effectParts(effects));

describe('COMPV: Effects shown', () => {
  it('words each Effect so that the Player reads at once whether it helps or harms', () => {
    expect(effectParts({ money: 100, funding: -1, panicHundredths: -200, eliminateFaction: true })).toEqual([
      { text: '+100 money', style: 'good' },
      { text: ' · ', separator: true },
      { text: '−1 funding', style: 'bad' },
      { text: ' · ', separator: true },
      { text: '−2.00% Panic', style: 'good' },
      { text: ' · ', separator: true },
      { text: 'Eliminates the Faction', style: 'good' },
    ]);
    expect(effectParts({ panicHundredths: 30, funding: 5, defeat: true })).toEqual([
      { text: '+5 funding', style: 'good' },
      { text: ' · ', separator: true },
      { text: '+0.30% Panic', style: 'bad' },
      { text: ' · ', separator: true },
      { text: 'Loses the Campaign', style: 'bad' },
    ]);
    // GUI, Decimal quantities shown: a Panic Effect always has two decimals, e.g. "−0.10% Panic".
    expect(effectText({ panicHundredths: -10 })).toBe('−0.10% Panic');
    expect(effectText({ panicHundredths: 500 })).toBe('+5.00% Panic');
    // An Effect list that holds no Effect.
    expect(effectParts({})).toEqual([{ text: 'None' }]);
  });
});

describe('TRVIEW: the final condition of a participant of a Combat report', () => {
  it('words it and colours it on both sides alike', () => {
    expect(finalCondition('agent', 'dead')).toEqual({ text: 'Killed', tone: 'tone-bad' });
    expect(finalCondition('enemy', 'dead')).toEqual({ text: 'Dead', tone: 'tone-bad' });
    expect(finalCondition('agent', 'incapacitated')).toEqual({ text: 'Incapacitated', tone: 'tone-warning' });
    expect(finalCondition('enemy', 'incapacitated')).toEqual({ text: 'Incapacitated', tone: 'tone-warning' });
    expect(finalCondition('agent', 'ableToFight')).toEqual({ text: '', tone: null });
    expect(finalCondition('enemy', 'ableToFight')).toEqual({ text: '', tone: null });
  });
});
