/** TUTOR: Tutorials settings, Tutorial intro, Tutorial bubbles and notes, and Tutorials in the Compendium. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import {
  TUTORIAL_ANCHORS,
  type CompendiumArticleView,
  type TutorialBubbleView,
} from '../../src/engine/index.ts';
import { GlobalConfiguration } from '../../src/engine/session/global-configuration.ts';
import { compendiumArticlesView, gameDataView, tutorialBubblesView } from '../../src/engine/views/views.ts';
import { formatPlaceholderValue } from '../../src/gdr/compendium-articles.ts';
import { changedSettingLine, changedSettings } from '../../src/web/changed-settings.ts';
import { categoryOf, compendiumCategories, sectioning, sectionsOf } from '../../src/web/compendium.ts';
import { campaignStartEvent, eventAfter } from '../../src/web/special-events.ts';
import {
  bubbleGone,
  bubbleLook,
  bubbleShown,
  expiryText,
  parseProgress,
  playerTurnCountAfter,
  progressWithOpened,
  turnsLeft,
  TUTORIALS,
  tutorialArticleId,
  tutorialArticles,
  tutorialSettings,
  type TutorialSettings,
} from '../../src/web/tutorials.ts';
import { catalogWith, completeLead, expectDefective, gdrs, newCampaign } from '../helpers/game.ts';

const BUBBLES_FILE = 'tutorials/tutorial_bubbles.yaml';
const EVENTS_FILE = 'turn-summary/special_events.yaml';

/** Tutorials settings as Fixture values. */
function settings(values: Partial<TutorialSettings> = {}): TutorialSettings {
  return { on: true, lifetime: 3, playerTurnCount: 0, progress: {}, ...values };
}

function bubble(id: string, anchor: string, values: Partial<TutorialBubbleView> = {}): TutorialBubbleView {
  return {
    id,
    anchor,
    title: `Title of ${id}`,
    text: [{ kind: 'text', text: `Text of ${id}.` }],
    article: null,
    visible: true,
    ...values,
  };
}

/** The global configuration report of a Global configuration that stores `stored`. */
function report(stored: Record<string, unknown>) {
  const configuration = new GlobalConfiguration();
  configuration.load(JSON.stringify(stored));
  return configuration.report();
}

describe('TUTOR: Tutorials settings', () => {
  it('have their Game build defaults when nothing is stored', () => {
    const values = tutorialSettings(report({}));
    expect(values).toEqual({ on: true, lifetime: 3, playerTurnCount: 0, progress: {} });
  });

  it('fall back to their defaults for a stored value that is not permitted, and report it', () => {
    const invalid = report({ tutorialBubbleLifetime: 0, playerTurnCount: -1, tutorialProgress: '{"a":-1}' });
    expect(tutorialSettings(invalid)).toEqual(tutorialSettings(report({})));
    expect(invalid.problems).toHaveLength(3);
    expect(tutorialSettings(report({ tutorialBubbleLifetime: 101 })).lifetime).toBe(3);
    expect(tutorialSettings(report({ tutorialBubbleLifetime: 100 })).lifetime).toBe(100);
    expect(tutorialSettings(report({ tutorialBubbleLifetime: 1 })).lifetime).toBe(1);
    expect(tutorialSettings(report({ tutorialProgress: 'not JSON' })).progress).toEqual({});
  });

  it('read Tutorial progress as stored', () => {
    expect(tutorialSettings(report({ tutorialProgress: '{"a":0,"b":7}', playerTurnCount: 9 }))).toMatchObject(
      {
        playerTurnCount: 9,
        progress: { a: 0, b: 7 },
      },
    );
    expect(parseProgress('[1]')).toEqual({});
    expect(parseProgress(3)).toEqual({});
  });

  it('Reset tutorials empties Tutorial progress and leaves the Player Turn count as it is', () => {
    const configuration = new GlobalConfiguration();
    configuration.set('playerTurnCount', 12);
    configuration.set('tutorialProgress', '{"a":4}');
    configuration.reset('tutorialProgress');
    expect(tutorialSettings(configuration.report())).toMatchObject({ playerTurnCount: 12, progress: {} });
  });

  it('leaves Tutorial progress and the Player Turn count out of Changed settings, but not the bubble lifetime', () => {
    const changed = changedSettings(
      report({ playerTurnCount: 4, tutorialProgress: '{"a":1}', tutorialBubbleLifetime: 5 }).settings,
    );
    expect(changed.map((setting) => setting.setting)).toEqual(['tutorialBubbleLifetime']);
    expect(changedSettingLine(changed[0]!)).toBe('Tutorial bubble lifetime: 5 Turns (default 3 Turns)');
  });

  it('count an Advance turn only once it is committed, and never decrease', () => {
    expect(playerTurnCountAfter(4, { committed: true })).toBe(5);
    expect(playerTurnCountAfter(4, { committed: false })).toBe(4);
    // A rejected or failed Advance turn returns no outcome.
    expect(playerTurnCountAfter(4, null)).toBe(4);
  });
});

describe('TUTOR: Showing a bubble', () => {
  it('disappears once the Player Turn count is at least its count in Tutorial progress plus the lifetime', () => {
    const opened = settings({ lifetime: 3, progress: { a: 5 } });
    expect(turnsLeft('a', { ...opened, playerTurnCount: 5 })).toBe(3);
    expect(turnsLeft('a', { ...opened, playerTurnCount: 7 })).toBe(1);
    expect(bubbleGone('a', { ...opened, playerTurnCount: 7 })).toBe(false);
    expect(bubbleGone('a', { ...opened, playerTurnCount: 8 })).toBe(true);
    expect(bubbleGone('a', { ...opened, playerTurnCount: 20 })).toBe(true);
  });

  it('never disappears while never opened', () => {
    expect(turnsLeft('a', settings({ playerTurnCount: 1000 }))).toBeNull();
    expect(bubbleGone('a', settings({ playerTurnCount: 1000 }))).toBe(false);
  });

  it('is shown exactly when Tutorials on, its visible_when holds, and it has not disappeared', () => {
    const shown = bubble('a', 'campaign_screen.panic');
    expect(bubbleShown(shown, settings(), false)).toBe(true);
    expect(bubbleShown(shown, settings({ on: false }), false)).toBe(false);
    expect(bubbleShown({ ...shown, visible: false }, settings(), false)).toBe(false);
    expect(bubbleShown(shown, settings({ progress: { a: 0 }, playerTurnCount: 3 }), false)).toBe(false);
    // Turning Tutorials on again brings back a bubble that has not disappeared.
    expect(bubbleShown(shown, settings({ progress: { a: 0 }, playerTurnCount: 2 }), false)).toBe(true);
  });

  it('under Revealed presentation is shown whatever its visible_when, but not while Tutorials on is false', () => {
    const hidden = bubble('a', 'campaign_screen.panic', { visible: false });
    expect(bubbleShown(hidden, settings(), true)).toBe(true);
    expect(bubbleShown(hidden, settings({ on: false }), true)).toBe(false);
  });

  it('looks New until it is in Tutorial progress, and Seen once it is', () => {
    expect(bubbleLook('a', settings())).toBe('new');
    expect(bubbleLook('a', settings({ progress: { a: 0 } }))).toBe('seen');
  });
});

describe('TUTOR: Tutorial notes', () => {
  it('opening a new bubble adds it to Tutorial progress with the current Player Turn count', () => {
    const before = settings({ playerTurnCount: 6, progress: { b: 2 } });
    const after = progressWithOpened('a', before);
    expect(after).not.toBeNull();
    expect(parseProgress(after)).toEqual({ a: 6, b: 2 });
    expect(turnsLeft('a', { ...before, progress: parseProgress(after) })).toBe(before.lifetime);
  });

  it('opening a bubble already in Tutorial progress changes nothing', () => {
    expect(progressWithOpened('b', settings({ playerTurnCount: 6, progress: { b: 2 } }))).toBeNull();
  });

  it('says when the bubble disappears', () => {
    expect(expiryText(3)).toBe('Disappears in 3 Turns');
    expect(expiryText(2)).toBe('Disappears in 2 Turns');
    expect(expiryText(1)).toBe('Disappears after this Turn');
  });
});

describe('TUTOR: Tutorials in the Compendium', () => {
  const article: CompendiumArticleView = {
    id: 'some_article',
    category: 'mechanics',
    title: 'Some article',
    subject: null,
    subjectType: null,
    listedUnder: null,
    section: 'Campaign',
    subjectOrder: null,
    subjectLead: null,
    body: [],
    formulas: [],
    seeAlso: [],
  };
  const guide: CompendiumArticleView = {
    ...article,
    id: 'some_guide',
    category: 'guide',
    title: 'A guide',
    section: null,
  };
  const bubbles = [
    bubble('exhaustion', 'agents_view.exhaustion_column', { article: 'some_article' }),
    bubble('panic', 'campaign_screen.panic', { article: 'not_listed' }),
    bubble('intro', 'tutorial_intro.bubble'),
    bubble('hidden', 'agents_view.hire', { visible: false }),
  ];

  it('lists every bubble whose visible_when holds, shown as a Guide article', () => {
    const listed = tutorialArticles(bubbles, false, [article]);
    expect(listed.map((item) => item.id)).toEqual(
      ['exhaustion', 'panic', 'intro'].map((id) => tutorialArticleId(id)),
    );
    expect(listed[0]).toMatchObject({
      category: 'guide',
      title: 'Title of exhaustion',
      body: bubbles[0]!.text,
      seeAlso: [{ kind: 'link', text: 'Some article', article: 'some_article' }],
    });
    // An article that is not listed is no See also entry.
    expect(listed[1]?.seeAlso).toEqual([]);
    // Reveal hidden content lists every bubble.
    expect(tutorialArticles(bubbles, true, [])).toHaveLength(bubbles.length);
  });

  it('lists the bubbles whatever Tutorials on is, and whether or not one was opened or has disappeared', () => {
    // The list reads no Tutorials setting: what the Global configuration of either Player holds changes nothing.
    const off = tutorialSettings(report({ tutorialsOn: false }));
    const gone = settings({ playerTurnCount: 100, progress: { exhaustion: 0 } });
    expect(off.on).toBe(false);
    expect(bubbleGone('exhaustion', gone)).toBe(true);
    expect(bubbleShown(bubbles[1]!, off, false)).toBe(false);
    expect(tutorialArticles(bubbles, false, []).map((item) => item.id)).toContain(
      tutorialArticleId('exhaustion'),
    );
    expect(tutorialArticles(bubbles, false, []).map((item) => item.id)).toContain(tutorialArticleId('panic'));
  });

  it('is the Tutorials section of Guide, after its Guides, each sorted by displayed title', () => {
    const listed = tutorialArticles(bubbles, true, []);
    const all = [article, guide, ...listed];
    expect(compendiumCategories(all).map((category) => category.name)).toEqual(['Guide', 'Mechanics']);
    expect(listed.every((item) => categoryOf(item) === 'Guide')).toBe(true);
    const sections = sectionsOf(all, 'Guide', sectioning({ missionSiteArchetypes: [], upgrades: [] }));
    expect(sections.map((section) => section.name)).toEqual(['Guides', TUTORIALS]);
    expect(sections[1]?.articles.map((item) => item.title)).toEqual(
      listed.map((item) => item.title).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)),
    );
  });
});

describe('TUTOR: TutorialBubble GDRs', () => {
  const raw = (values: Record<string, unknown>) => ({
    id: 'test_bubble',
    type: 'TutorialBubble',
    anchor: 'campaign_screen.panic',
    title: 'A title',
    text: 'A text.',
    ...values,
  });
  /** A test Game build whose bubbles are exactly `bubbles`. */
  const withBubbles = (bubbles: Record<string, unknown>[]) =>
    catalogWith((files) => {
      const file = files.files.find((item) => item.path === BUBBLES_FILE)!;
      file.gdrs = bubbles;
    });

  it('of the Game build each stand beside an anchor the GUI offers, no two beside one', () => {
    const anchors = gdrs.tutorialBubbles.map((item) => item.anchor);
    expect(anchors.every((anchor) => (TUTORIAL_ANCHORS as readonly string[]).includes(anchor))).toBe(true);
    expect(new Set(anchors).size).toBe(anchors.length);
    const articles = new Set(gdrs.compendiumArticles.map((item) => item.id));
    expect(gdrs.tutorialBubbles.every((item) => item.article === null || articles.has(item.article))).toBe(
      true,
    );
  });

  it('every Tutorial anchor is one the GUI renders a bubble at', () => {
    const screens = join(import.meta.dirname, '..', '..', 'src', 'web', 'screens');
    const source = readdirSync(screens)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => readFileSync(join(screens, name), 'utf8'))
      .join('\n');
    for (const anchor of TUTORIAL_ANCHORS) {
      expect(source, anchor).toContain(`anchor="${anchor}"`);
    }
  });

  it('a Game build may supply none', () => {
    expect(withBubbles([]).tutorialBubbles).toEqual([]);
  });

  it('an anchor the GUI does not offer is a data defect, and so are two bubbles beside one anchor', () => {
    expectDefective((files) => {
      files.files.find((item) => item.path === BUBBLES_FILE)!.gdrs = [
        raw({ anchor: 'campaign_screen.globe' }),
      ];
    });
    expect(() => withBubbles([raw({ anchor: 'campaign_screen.globe' })])).toThrow(/is not a Tutorial anchor/);
    expect(() => withBubbles([raw({}), raw({ id: 'second_bubble' })])).toThrow(
      /a second TutorialBubble has anchor campaign_screen.panic/,
    );
  });

  it('an article that names no Compendium article is a data defect', () => {
    expect(() => withBubbles([raw({ article: 'no_such_article' })])).toThrow(/is not a CompendiumArticle/);
    const article = gdrs.compendiumArticles[0]!.id;
    expect(withBubbles([raw({ article })]).tutorialBubbles[0]?.article).toBe(article);
  });

  it('a visible_when takes the Condition kinds of a CompendiumArticle visible_when only', () => {
    const lead = gdrs.leads[0]!.id;
    const completed = { $entries: [['lead_completed', lead]] };
    expect(withBubbles([raw({ visible_when: completed })]).tutorialBubbles[0]?.visibleWhen).toEqual({
      kind: 'lead_completed',
      lead,
    });
    expect(() =>
      withBubbles([raw({ visible_when: { $entries: [['lead_completed', 'no_such_lead']] } })]),
    ).toThrow(/Visibility Condition is valid \(no_such_lead\)/);
    const site = gdrs.missionSiteArchetypes[0]!.id;
    expect(() => withBubbles([raw({ visible_when: { $entries: [['mission_won', site]] } })])).toThrow(
      /Visibility Condition is valid/,
    );
    expect(() => withBubbles([raw({ unknown_property: 1 })])).toThrow(/defective/);
  });

  it('a text has its Placeholders replaced as in a Compendium article', () => {
    const value = formatPlaceholderValue(rawValue('combat_parameters', 'weapon_damage_range'));
    expect(value).not.toBeNull();
    const catalog = withBubbles([
      raw({ text: 'Range {combat_parameters.weapon_damage_range}, {{literal}}.' }),
    ]);
    const shown = catalog.tutorialBubbles[0]!.text.map((part) => part.text).join('');
    expect(shown).toBe(`Range ${value}, {literal}.`);
    expect(() => withBubbles([raw({ text: 'A {no_such_gdr.name}.' })])).toThrow(/Placeholders are valid/);
  });

  it('are shown while visible_when holds in the Current world state', () => {
    const lead = gdrs.leads.find((item) => item.discoveredWhen === null)!.id;
    const catalog = withBubbles([
      raw({ id: 'plain_bubble' }),
      raw({
        id: 'lead_bubble',
        anchor: 'agents_view.hire',
        visible_when: { $entries: [['lead_completed', lead]] },
      }),
    ]);
    const state = newCampaign({ catalog });
    const visible = (view: readonly TutorialBubbleView[]) =>
      Object.fromEntries(view.map((item) => [item.id, item.visible]));
    expect(visible(tutorialBubblesView(state, catalog))).toEqual({ plain_bubble: true, lead_bubble: false });
    expect(visible(tutorialBubblesView(completeLead(state, lead, catalog), catalog))).toEqual({
      plain_bubble: true,
      lead_bubble: true,
    });
    // A bubble changes no Campaign state and is reported apart from the Compendium articles.
    expect(compendiumArticlesView(state, catalog)).toEqual(
      compendiumArticlesView(newCampaign({ catalog }), catalog),
    );
  });
});

/** The value of a property of a GDR of the test Game build, as authored. */
function rawValue(id: string, property: string): unknown {
  let value: unknown;
  catalogWith((files) => {
    value = files.get(id)[property];
  });
  return value;
}

describe('TUTOR: Tutorial intro', () => {
  const data = gameDataView(gdrs);
  const intro = data.specialEvents.find((event) => event.trigger === 'tutorial_intro');

  it('is the Special event of tutorial_intro, with points, one of them the bubble point', () => {
    expect(intro).toBeDefined();
    expect(intro!.points.length).toBeGreaterThan(0);
    expect(intro!.points.filter((point) => point.icon === 'bubble')).toHaveLength(1);
    expect(gdrs.tutorialBubbles.some((item) => item.anchor === 'tutorial_intro.bubble')).toBe(true);
  });

  it('follows the welcome while Tutorials on is true, and nothing follows it', () => {
    const welcome = campaignStartEvent(data)!;
    expect(eventAfter(welcome, data, true)).toBe(intro);
    expect(eventAfter(welcome, data, false)).toBeNull();
    expect(eventAfter(intro!, data, true)).toBeNull();
  });

  it('points are only for tutorial_intro, and each names a known icon', () => {
    const withEvents = (events: Record<string, unknown>[]) =>
      catalogWith((files) => {
        files.files.find((item) => item.path === EVENTS_FILE)!.gdrs = events;
      });
    const point = (icon: string) => ({
      $entries: [
        ['heading', 'A heading'],
        ['text', 'A text.'],
        ['icon', icon],
      ],
    });
    const event = (trigger: string, points: unknown[]) => ({
      id: `${trigger}_event`,
      type: 'SpecialEvent',
      trigger,
      title: 'A title',
      text: 'A text.',
      points,
    });
    expect(withEvents([event('tutorial_intro', [point('records')])]).specialEvents[0]?.points).toEqual([
      { heading: 'A heading', text: 'A text.', icon: 'records' },
    ]);
    expect(() => withEvents([event('tutorial_intro', [point('rocket')])])).toThrow(/defective/);
    expect(() => withEvents([event('campaign_start', [point('records')])])).toThrow(
      /points are only for the trigger tutorial_intro/,
    );
  });
});
