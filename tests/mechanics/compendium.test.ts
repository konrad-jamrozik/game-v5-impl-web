/** Tests of COMP (Compendium) and of the directory of one file per GDR of GDR, GDR file layout. */
import { describe, expect, it } from 'vite-plus/test';
import {
  articleForTerm,
  metSubjects,
  resolveArticles,
  visibleArticles,
} from '../../src/engine/mechanics/compendium/compendium.ts';
import type { CompendiumArticleView } from '../../src/engine/player-api.ts';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  articleForTermView,
  compendiumArticlesView,
  revealedCompendiumView,
} from '../../src/engine/views/views.ts';
import { formatPlaceholderValue, parseTemplate } from '../../src/gdr/compendium-articles.ts';
import { bootstrapGdrCatalog, type CatalogCompendiumArticle, type GdrCatalog } from '../../src/gdr/index.ts';
import { ok, startEngine } from '../helpers/engine.ts';
import type { rawGdrs } from '../helpers/game.ts';
import {
  act,
  advance,
  agentIds,
  ARTICLE_DIRECTORY,
  arriveAgent,
  articleFile,
  catalogWith,
  completeLead,
  expectDefective,
  gdrs,
  missionAt,
  newCampaign,
  onlyFaction,
  RED_DAWN_ONLY_FILES,
  tweak,
  winning,
} from '../helpers/game.ts';

const articles = (state: CampaignState, catalog: GdrCatalog = gdrs) => compendiumArticlesView(state, catalog);
const visible = (state: CampaignState, catalog: GdrCatalog = gdrs) =>
  articles(state, catalog).map((article) => article.id);
const sites = (state: CampaignState) => Object.values(state.world.current.missionSites);
/**
 * COMP, Met subjects, in a World state with no Item in Storage or worn beyond the issued kit: the Fallback Weapon and
 * Armor, every Item Unlocked from the start, i.e. with no `unlocked_by`, and the AmmoTypes those Weapons spend.
 */
const startingEquipment = (catalog: GdrCatalog): string[] => {
  const items = [...catalog.weapons.values(), ...catalog.armors.values()].filter(
    (item) => item.price !== null && item.unlockedBy === null,
  );
  return [
    ...new Set([
      catalog.combatParameters.fallbackWeapon,
      catalog.equipment.fallbackArmor,
      ...items.map((item) => item.id),
      ...[...catalog.weapons.values()]
        .filter((weapon) => items.includes(weapon) && weapon.ammoType !== null)
        .map((weapon) => weapon.ammoType!),
    ]),
  ];
};
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

type Raw = ReturnType<typeof rawGdrs>;
/** One row of `formulas` in raw GDR form, as `scripts/build-gdr.ts` writes a nested mapping. */
const row = (label: unknown, text: unknown) => ({
  $entries: [
    ['label', label],
    ['text', text],
  ],
});
/** Adds a Guide article, or the article that `values` describe, in a file named after it. */
const addArticle = (raw: Raw, id: string, values: Record<string, unknown> = {}) => {
  raw.add(articleFile(id), {
    id,
    type: 'CompendiumArticle',
    category: 'guide',
    title: `Title of ${id}`,
    body: 'A test article.',
    ...values,
  });
};
/** A resolved templated text in the notation of COMP, Article links: links in [ ], inserted values in < >. */
const shown = (segments: CompendiumArticleView['body']) =>
  segments.map((segment) =>
    segment.kind === 'link'
      ? `[${segment.text}]`
      : segment.kind === 'value'
        ? `<${segment.text}>`
        : segment.text,
  );
/** An article as the catalog holds it, for tests of Article links alone. */
const entry = (
  id: string,
  body: string,
  terms: string[] = [],
  seeAlso: string[] = [],
): CatalogCompendiumArticle => ({
  type: 'CompendiumArticle',
  id,
  category: 'guide',
  title: `Title of ${id}`,
  subject: null,
  subjectType: null,
  body: [{ kind: 'text', text: body }],
  formulas: [],
  terms,
  seeAlso,
  listedUnder: null,
  visibleWhen: null,
});
const bodyOf = (list: readonly CatalogCompendiumArticle[], id: string) =>
  shown(resolveArticles(list).find((item) => item.article.id === id)!.body);
/**
 * The injected random outcomes of a Faction operation of the only Faction in its next Advance turn, read from the Game
 * build: the first Response MissionSiteArchetype whose Faction operation level the Faction's activity level weighs,
 * and the shortest Operation interval of that activity level.
 */
const responseOperation = (state: CampaignState) => {
  const faction = onlyFaction(state);
  const level = gdrs.factionActivityLevels.get(faction.state.activityLevel)!;
  const weighed = level.operationLevelWeights.filter(([, weight]) => weight > 0).map(([value]) => value);
  const archetype = gdrs.missionSiteArchetypes.find(
    (item) => item.kind === 'response' && weighed.includes(item.operationLevel!),
  )!;
  return {
    archetype: archetype.id,
    injected: {
      [`faction.${faction.id}.operationLevel`]: [archetype.operationLevel!],
      [`faction.${faction.id}.operationInterval`]: [level.operationEveryTurns![0]],
      [`mission.archetypeSelection.${faction.id}`]: [archetype.id],
    },
  };
};

describe('COMP: the Bootstrap CompendiumArticle GDRs', () => {
  it('supplies Guide, Mechanics, and Subject articles, in the order of their identifiers', () => {
    const bootstrap = bootstrapGdrCatalog();
    const all = bootstrap.compendiumArticles;
    const guides = all.filter((article) => article.category === 'guide');
    expect(guides.length).toBeGreaterThan(0);
    for (const article of guides) {
      expect(article.subject).toBeNull();
    }
    const mechanics = all.filter((article) => article.category === 'mechanics');
    expect(mechanics.length).toBeGreaterThan(0);
    for (const article of mechanics) {
      expect(article.id).toMatch(/^mechanics_/);
      expect(article.formulas.length).toBeGreaterThan(0);
      expect(article.subject).toBeNull();
    }
    const subjects = all.filter((article) => article.category === 'subject');
    expect(subjects.length).toBeGreaterThan(0);
    // GDRS, Compendium GDRs: every Armor has a Subject article.
    expect(
      subjects
        .filter((article) => article.subjectType === 'Armor')
        .map((article) => article.subject)
        .sort(),
    ).toEqual([...bootstrap.armors.keys()].sort());
    for (const article of subjects) {
      expect(article.id).toBe(`${article.subject}_article`);
    }
    // GDR, GDR file layout, Directory of one file per GDR: the ascending order of the identifiers.
    const ids = all.map((article) => article.id);
    expect(ids).toEqual([...ids].sort());
    // COMP, Displayed title: a Subject article is shown under the `name` of its subject, e.g. an EnemyArchetype's.
    const enemies = subjects.filter((article) => article.subjectType === 'EnemyArchetype');
    expect(enemies.length).toBeGreaterThan(0);
    for (const article of enemies) {
      expect(article.title).toBe(bootstrap.enemyArchetypes.get(article.subject!)!.name);
    }
    // No article is ever shown with an unreplaced Placeholder.
    for (const article of all) {
      const texts = [article.body, ...article.formulas.flatMap((item) => [item.label, item.text])];
      expect(texts.flat().every((part) => part.kind === 'value' || !/\{[a-z_]+\./.test(part.text))).toBe(
        true,
      );
    }
  });
});

describe('GDR: a directory of one file per GDR', () => {
  it('holds exactly one GDR in each file, named after its GDR', () => {
    expect(() =>
      catalogWith((raw) => {
        raw.add(articleFile('guide_panic'), {
          id: 'second_article',
          type: 'CompendiumArticle',
          category: 'guide',
          title: 'Second',
          body: 'A second article in one file.',
        });
      }),
    ).toThrow(/guide_panic\.yaml: a file in a directory of one file per GDR holds exactly one GDR/);
    expect(() => catalogWith((raw) => addArticle(raw, 'test_article', { id: 'other_article' }))).toThrow(
      /test_article\.yaml: a file in a directory of one file per GDR is named after its GDR/,
    );
  });

  it('never stands beside a file of the same Type', () => {
    expect(() =>
      catalogWith((raw) => {
        raw.add('compendium/compendium_articles.yaml', {
          id: 'in_a_file',
          type: 'CompendiumArticle',
          category: 'guide',
          title: 'In a file',
          body: 'An article in the file of its Type.',
        });
      }),
    ).toThrow(/CompendiumArticle: a Type has either a file or a directory of one file per GDR, never both/);
  });

  it('orders its GDRs by identifier, whatever the order of the files', () => {
    const catalog = catalogWith((raw) => {
      raw.files.reverse();
    });
    expect(catalog.compendiumArticles.map((article) => article.id)).toEqual(
      gdrs.compendiumArticles.map((article) => article.id),
    );
  });
});

describe('COMP: Placeholders', () => {
  it('Value formatting shows each value in one fixed form', () => {
    // A whole number: its digits, without separators.
    expect(formatPlaceholderValue(1000)).toBe('1000');
    expect(formatPlaceholderValue(0)).toBe('0');
    // A number with a fractional part: no trailing zeros, and a whole number when only zeros follow the full stop.
    expect(formatPlaceholderValue({ $decimal: '0.50' })).toBe('0.5');
    expect(formatPlaceholderValue({ $decimal: '0.1' })).toBe('0.1');
    expect(formatPlaceholderValue({ $decimal: '2.00' })).toBe('2');
    expect(formatPlaceholderValue({ $decimal: '12.345' })).toBe('12.345');
    // A negative number: the minus sign U+2212.
    expect(formatPlaceholderValue(-3)).toBe('−3');
    expect(formatPlaceholderValue({ $decimal: '-0.25' })).toBe('−0.25');
    expect(formatPlaceholderValue({ $decimal: '-0.00' })).toBe('0');
    // Text, unchanged.
    expect(formatPlaceholderValue('Until its Mission is won')).toBe('Until its Mission is won');
    // Any other shape cannot be shown: a mapping, an absent value, a whole list, a truth value.
    expect(formatPlaceholderValue({ $entries: [['money', 100]] })).toBeNull();
    expect(formatPlaceholderValue(null)).toBeNull();
    expect(formatPlaceholderValue(undefined)).toBeNull();
    expect(formatPlaceholderValue([1, 2])).toBeNull();
    expect(formatPlaceholderValue(true)).toBeNull();
  });

  it('follows the brace rules', () => {
    expect(parseTemplate('+{a_b.c} for {{each}} of {subject.list.2}')).toEqual([
      { kind: 'text', text: '+' },
      { kind: 'placeholder', gdr: 'a_b', property: 'c', index: null },
      { kind: 'text', text: ' for {each} of ' },
      { kind: 'placeholder', gdr: 'subject', property: 'list', index: 2 },
    ]);
    for (const invalid of [
      'a } b',
      '{open',
      '{no_property}',
      '{a.b.c.d}',
      '{a.b.0}',
      '{a.b.01}',
      '{a .b}',
      '{}',
      '{a.b.c}',
      '{a.{b}',
    ]) {
      expect(typeof parseTemplate(invalid), invalid).toBe('string');
    }
  });

  it('are replaced by the values of the Game build, and a reference by the name of the GDR it names', () => {
    const catalog = catalogWith((raw) => {
      // Without the Bootstrap articles, no Article term links a word of the test articles.
      raw.pruneArticles(true);
      raw.get('combat_parameters')['weapon_damage_range'] = { $decimal: '0.50' };
      addArticle(raw, 'test_values', {
        body:
          'Hire for {economy.hire_cost}, armed with a {field_agent.weapon}; a hit deals ' +
          '{combat_parameters.weapon_damage_range} either way, and survival {agent_parameters.experience_per_mission_survived.2}.',
      });
      addArticle(raw, 'test_subject', {
        category: 'subject',
        title: undefined,
        // The initiate is a Met subject from the start: the discovered first Lead creates Apprehend member.
        subject: 'initiate',
        body: 'Skill {subject.base_skill}, with a {subject.weapon}.',
      });
    });
    const state = newCampaign({ catalog });
    const view = articles(state, catalog);
    const economy = catalog.economy.hireCost;
    const weapon = catalog.weapons.get(catalog.agentArchetype.weapon)!.name;
    expect(shown(view.find((article) => article.id === 'test_values')!.body).join('')).toBe(
      `Hire for <${economy}>, armed with a <${weapon}>; a hit deals <0.5> either way, and survival ` +
        `<${catalog.agentParameters.experiencePerMissionSurvived[1]}>.`,
    );
    const initiate = catalog.enemyArchetypes.get('initiate')!;
    const subject = view.find((article) => article.id === 'test_subject')!;
    expect(subject.title).toBe(initiate.name);
    expect(shown(subject.body).join('')).toBe(
      `Skill <${initiate.skill}>, with a <${catalog.weapons.get(initiate.weapon)!.name}>.`,
    );
  });

  it('a Placeholder that names nothing, or something it may not name, is a data defect', () => {
    const cases: [string, RegExp][] = [
      ['{no_such_gdr.name}', /names no GDR/],
      ['{economy.no_such_property}', /names no property/],
      ['{economy.id}', /names no property/],
      // Placeholder sources: a FactionArchetype, a Lead, and a MissionSiteArchetype only as the subject.
      ['{red_dawn.name}', /Placeholder sources does not allow in that form/],
      ['{locate_red_dawn_member.description}', /Placeholder sources does not allow in that form/],
      // Placeholder sources: no row for the Type.
      ['{agency.name}', /Placeholder sources does not allow in that form/],
      ['{music.excluded_tracks.1}', /Placeholder sources does not allow in that form/],
      // `subject` in an article that has no subject.
      ['{subject.name}', /names no GDR/],
      // An index exactly when the value is a list, and then one from 1 to the number of entries.
      ['{agent_parameters.experience_per_mission_survived}', /names a list and has no index/],
      ['{agent_parameters.experience_per_mission_survived.9}', /has an index beyond the/],
      ['{economy.hire_cost.1}', /has an index and names no list/],
      // The brace rules.
      ['a lone } brace', /closes no Placeholder/],
      ['{economy}', /is not a Placeholder/],
    ];
    for (const [body, message] of cases) {
      expect(() => catalogWith((raw) => addArticle(raw, 'test_article', { body })), body).toThrow(message);
    }
    for (const [body, message] of cases) {
      expect(
        () =>
          catalogWith((raw) =>
            addArticle(raw, 'test_article', {
              category: 'mechanics',
              formulas: [row('Label', body)],
            }),
          ),
        body,
      ).toThrow(message);
    }
    // A Subject article may name only the properties that Placeholder sources lists for the Type of its subject.
    const subject = (id: string, body: string) =>
      catalogWith((raw) => {
        raw.files.splice(
          raw.files.findIndex((file) => file.path === articleFile(`${id}_article`)),
          1,
        );
        addArticle(raw, 'test_article', { category: 'subject', title: undefined, subject: id, body });
      });
    expect(subject('locate_red_dawn_member', '{subject.name}: {subject.description}')).toBeDefined();
    expect(() => subject('locate_red_dawn_member', '{subject.required_progress}')).toThrow(
      /names a property that Placeholder sources does not allow/,
    );
    expect(subject('apprehend_member', 'Gone in {subject.expires_in_turns} turns.')).toBeDefined();
    expect(() => subject('apprehend_member', '{subject.kind}')).toThrow(/does not allow/);
    expect(() => subject('red_dawn', '{subject.initial_lasts_turns}')).toThrow(/does not allow/);
    // A renamed or removed GDR property is a data defect of every article that still names it.
    expect(() => catalogWith((raw) => delete raw.get('economy')['hire_cost'])).toThrow(
      /Placeholders are valid \(\{economy\.hire_cost\} names no property/,
    );
  });
});

describe('COMP: Compendium article GDR validation', () => {
  it('rejects an article that breaks a rule', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      // COMP, CompendiumArticle: Category is valid.
      [{ category: 'lore' }, /Category is valid/],
      [{ category: undefined }, /Category is valid/],
      // Exact properties.
      [{ image: 'panic.png' }, /Exact properties \(image\)/],
      [{ title: undefined }, /Exact properties \(title\)/],
      [{ body: undefined }, /Exact properties \(body\)/],
      [{ subject: 'soldier' }, /Exact properties \(subject\)/],
      [{ formulas: [row('Label', 'Text')] }, /Exact properties \(formulas\)/],
      [{ category: 'mechanics' }, /Exact properties \(formulas\)/],
      [{ category: 'subject', subject: 'agency' }, /Exact properties \(title\)/],
      [{ category: 'subject', title: undefined }, /Exact properties \(subject\)/],
      // Text is present.
      [{ body: '' }, /Text is present \(body\)/],
      [{ title: '' }, /Text is present \(title\)/],
      [{ category: 'mechanics', formulas: [] }, /Text is present \(formulas\)/],
      [{ category: 'mechanics', formulas: [row('Label', '')] }, /Text is present \(formulas\)/],
      [
        { category: 'mechanics', formulas: [{ $entries: [['label', 'Only']] }] },
        /Text is present \(formulas\)/,
      ],
      [
        {
          category: 'mechanics',
          formulas: [
            {
              $entries: [
                ['label', 'A'],
                ['text', 'B'],
                ['note', 'C'],
              ],
            },
          ],
        },
        /Text is present \(formulas\)/,
      ],
      // Subject exists, is no CompendiumArticle, and has a name.
      [
        { category: 'subject', title: undefined, subject: 'no_such_gdr' },
        /test_article: Subject exists \(no_such_gdr\)/,
      ],
      [
        { category: 'subject', title: undefined, subject: 'guide_panic' },
        /test_article: Subject exists \(guide_panic\)/,
      ],
      [
        { category: 'subject', title: undefined, subject: 'economy' },
        /test_article: Subject exists \(economy has no name\)/,
      ],
      // One article per subject.
      [
        { category: 'subject', title: undefined, subject: 'soldier' },
        /test_article: One article per subject \(soldier\)/,
      ],
      // COMP, Displayed title: unique displayed titles, ignoring case, among titles and names of subjects alike.
      [{ title: 'PANIC' }, /Unique displayed titles \(PANIC\)/],
      [{ title: 'soldier' }, /Unique displayed titles/],
      // Article terms are valid.
      [{ terms: 'skill' }, /Article terms are valid/],
      [{ terms: [''] }, /Article terms are valid/],
      [{ terms: [' padded'] }, /Article terms are valid/],
      [{ terms: ['padded '] }, /Article terms are valid/],
      [{ terms: ['a {brace'] }, /Article terms are valid/],
      [{ terms: [5] }, /Article terms are valid/],
      [{ terms: ['SKILL'] }, /Article terms are valid \(SKILL is an Article term twice\)/],
      [{ terms: ['Fresh', 'fresh'] }, /Article terms are valid \(fresh is an Article term twice\)/],
      // See also is valid.
      [{ see_also: 'guide_panic' }, /See also is valid/],
      [{ see_also: ['no_such_article'] }, /See also is valid \(no_such_article\)/],
      [{ see_also: ['soldier'] }, /See also is valid \(soldier\)/],
      [{ see_also: ['test_article'] }, /See also is valid \(test_article\)/],
      [{ see_also: ['guide_panic', 'guide_panic'] }, /See also is valid/],
    ];
    for (const [values, message] of cases) {
      expect(
        () => catalogWith((raw) => addArticle(raw, 'test_article', values)),
        JSON.stringify(values),
      ).toThrow(message);
    }
  });

  it('accepts an article of each category, an empty list of terms, and a term that occurs nowhere', () => {
    const catalog = catalogWith((raw) => {
      addArticle(raw, 'test_guide', { terms: [], see_also: ['test_mechanics'] });
      addArticle(raw, 'test_mechanics', {
        category: 'mechanics',
        terms: ['a term found in no article'],
        formulas: [row('Label', 'Text')],
      });
    });
    expect(catalog.compendiumArticles.map((article) => article.id)).toContain('test_mechanics');
  });

  it('a displayed title may equal an Article term of another article', () => {
    // The Subject article about the Soldier is shown as "Soldier", and here another article has that Article term.
    const catalog = catalogWith((raw) => {
      raw.get('soldier_article')['terms'] = [];
      addArticle(raw, 'test_article', { terms: ['Soldier'] });
    });
    expect(catalog.compendiumArticles.find((article) => article.id === 'test_article')?.terms).toEqual([
      'Soldier',
    ]);
  });

  it('a subject that identifies GDRs of more than one Type identifies no single GDR', () => {
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

  it('a test Game build that supplies no CompendiumArticle is valid and reports no articles', () => {
    const catalog = catalogWith((raw) => raw.pruneArticles(true));
    expect(catalog.compendiumArticles).toEqual([]);
    const state = newCampaign({ catalog });
    expect(visible(state, catalog)).toEqual([]);
    expect(articleForTermView(state, catalog, 'skill')).toBeNull();
  });
});

describe('COMP: Article links', () => {
  it('resolves the example of the specification', () => {
    const catalog = catalogWith((raw) => {
      raw.pruneArticles(true);
      Object.assign(raw.get('agent_parameters'), {
        exhaustion_per_mission: 5,
        skill_penalty_pct_per_exhaustion: 1,
        exhaustion_free_points: 30,
      });
      addArticle(raw, 'mechanics_exhaustion', {
        category: 'mechanics',
        title: 'Exhaustion',
        terms: ['exhaustion', 'exhausted'],
        body: 'Exhaustion measures how tired an Agent is. Work and fighting raise it, and rest lowers it.',
        formulas: [
          row('Each Mission survived', '+{agent_parameters.exhaustion_per_mission}'),
          row(
            'Skill penalty',
            '−{agent_parameters.skill_penalty_pct_per_exhaustion}% of skill for each point above {agent_parameters.exhaustion_free_points}',
          ),
        ],
      });
      addArticle(raw, 'mechanics_agents', { title: 'Agents', terms: ['Agent', 'Agents'] });
      addArticle(raw, 'mechanics_skill', { title: 'Skill', terms: ['skill'] });
    });
    const article = articles(newCampaign({ catalog }), catalog).find(
      (item) => item.id === 'mechanics_exhaustion',
    )!;
    expect(shown(article.body)).toEqual([
      'Exhaustion measures how tired an ',
      '[Agent]',
      ' is. Work and fighting raise it, and rest lowers it.',
    ]);
    expect(article.formulas.map((item) => [shown(item.label), shown(item.text)])).toEqual([
      [['Each Mission survived'], ['+', '<5>']],
      [
        ['[Skill]', ' penalty'],
        ['−', '<1>', '% of skill for each point above ', '<30>'],
      ],
    ]);
    expect(article.body[1]).toEqual({ kind: 'link', text: 'Agent', article: 'mechanics_agents' });
    expect(article.formulas[1]!.label[0]).toEqual({
      kind: 'link',
      text: 'Skill',
      article: 'mechanics_skill',
    });
  });

  it('Match: ignoring case, at the boundaries of a word, in every script', () => {
    const list = [
      entry('reader', 'SKILL, skills, unskilled, skill7, skill-based, (Skill) and a skill'),
      entry('skill', 'About it.', ['skill']),
    ];
    // "skills", "unskilled", and "skill7" are other words; the first whole mention links, in its authored case.
    expect(bodyOf(list, 'reader')).toEqual([
      '[SKILL]',
      ', skills, unskilled, skill7, skill-based, (Skill) and a skill',
    ]);
    const scripts = [
      entry('reader', 'éskill skillé скилл skill٣ then skill.'),
      entry('skill', 'x', ['skill']),
    ];
    expect(bodyOf(scripts, 'reader')).toEqual(['éskill skillé скилл skill٣ then ', '[skill]', '.']);
    // A match may start and end a run.
    expect(bodyOf([entry('reader', 'skill'), entry('skill', 'x', ['skill'])], 'reader')).toEqual(['[skill]']);
  });

  it('Longest match: the longest Article term that matches at a position wins', () => {
    const list = [
      entry('reader', 'A Mission site holds a Mission, and Mission sites expire.'),
      entry('mission', 'x', ['Mission', 'Missions']),
      entry('site', 'x', ['Mission site', 'Mission sites']),
    ];
    expect(bodyOf(list, 'reader')).toEqual([
      'A ',
      '[Mission site]',
      ' holds a ',
      '[Mission]',
      ', and Mission sites expire.',
    ]);
  });

  it('No overlap: the scan continues after the matched text', () => {
    const list = [
      entry('reader', 'combat rating and rating'),
      entry('combat', 'x', ['combat rating']),
      entry('rating', 'x', ['rating']),
    ];
    // "rating" inside the matched "combat rating" is not matched again; its next mention links.
    expect(bodyOf(list, 'reader')).toEqual(['[combat rating]', ' and ', '[rating]']);
  });

  it('First mention links: once to each other article, and never to itself', () => {
    const list = [
      entry('reader', 'Skill and skill and effective skill; readers read.', ['readers']),
      entry('skill', 'x', ['skill', 'effective skill']),
    ];
    // The later mentions of either Article term of the same article stay plain text, and so does the article's own.
    expect(bodyOf(list, 'reader')).toEqual(['[Skill]', ' and skill and effective skill; readers read.']);
    expect(bodyOf(list, 'skill')).toEqual(['x']);
  });

  it('scans the body, then each formula row, its label before its text', () => {
    const article: CatalogCompendiumArticle = {
      ...entry('reader', 'Nothing here.'),
      category: 'mechanics',
      formulas: [
        { label: [{ kind: 'text', text: 'First' }], text: [{ kind: 'text', text: 'skill' }] },
        { label: [{ kind: 'text', text: 'Skill again' }], text: [{ kind: 'text', text: 'health' }] },
        { label: [{ kind: 'text', text: 'Health' }], text: [{ kind: 'text', text: 'skill' }] },
      ],
    };
    const resolved = resolveArticles([
      article,
      entry('skill', 'x', ['skill']),
      entry('health', 'x', ['health']),
    ])[0]!;
    expect(resolved.formulas.map((item) => [shown(item.label), shown(item.text)])).toEqual([
      [['First'], ['[skill]']],
      [['Skill again'], ['[health]']],
      [['Health'], ['skill']],
    ]);
  });

  it('Authored text only: an inserted value is never scanned, and no match extends across a Placeholder', () => {
    const article: CatalogCompendiumArticle = {
      ...entry('reader', ''),
      body: [
        { kind: 'text', text: 'Armed with a ' },
        { kind: 'value', text: 'Rifle' },
        { kind: 'text', text: '; combat ' },
        { kind: 'value', text: '5' },
        { kind: 'text', text: ' rating. Rifle.' },
      ],
    };
    const resolved = resolveArticles([
      article,
      entry('rifle', 'x', ['Rifle']),
      entry('rating', 'x', ['combat 5 rating', 'combat  rating']),
    ])[0]!;
    expect(shown(resolved.body)).toEqual([
      'Armed with a ',
      '<Rifle>',
      '; combat ',
      '<5>',
      ' rating. ',
      '[Rifle]',
      '.',
    ]);
  });

  it('Hidden articles: an article that is not Player-visible takes no part and cannot be told from an absent one', () => {
    const withHidden = (raw: Raw) => {
      raw.get('raid_safehouse_article')['terms'] = ['Raid safehouse'];
      addArticle(raw, 'test_reader', {
        body: 'Plan the Raid safehouse well; a Raid is costly, and so is the next Raid.',
        see_also: ['raid_safehouse_article', 'test_raid'],
      });
      addArticle(raw, 'test_raid', { title: 'Raids', terms: ['Raid'] });
    };
    const catalog = catalogWith(withHidden);
    const without = catalogWith((raw) => {
      withHidden(raw);
      raw.files.splice(
        raw.files.findIndex((file) => file.path === articleFile('raid_safehouse_article')),
        1,
      );
      raw.get('test_reader')['see_also'] = ['test_raid'];
    });
    const state = newCampaign({ catalog });
    const reader = (list: readonly CompendiumArticleView[]) =>
      list.find((article) => article.id === 'test_reader')!;

    // The Mission site of `raid_safehouse` is not Player-visible at campaign creation, so its article is hidden: its
    // Article term is plain text, the shorter Article term of another article links there, and it is no See also entry.
    const hidden = articles(state, catalog);
    expect(hidden.map((article) => article.id)).not.toContain('raid_safehouse_article');
    expect(shown(reader(hidden).body)).toEqual([
      'Plan the ',
      '[Raid]',
      ' safehouse well; a Raid is costly, and so is the next Raid.',
    ]);
    expect(reader(hidden).seeAlso).toEqual([{ kind: 'link', text: 'Raids', article: 'test_raid' }]);
    expect(articleForTermView(state, catalog, 'raid safehouse')).toBeNull();
    // Exactly what the Game build without the hidden article reports, for every article.
    expect(hidden).toEqual(articles(newCampaign({ catalog: without }), without));

    // A link appears where another was: once the article is Player-visible, its longer Article term matches there,
    // and the first later mention of the shorter one links instead.
    const discovered = tweak(state, (world) => {
      world.discoveredLeads.push('locate_red_dawn_safehouse');
    });
    const shownNow = articles(discovered, catalog);
    expect(shownNow.map((article) => article.id)).toContain('raid_safehouse_article');
    expect(shown(reader(shownNow).body)).toEqual([
      'Plan the ',
      '[Raid safehouse]',
      ' well; a ',
      '[Raid]',
      ' is costly, and so is the next Raid.',
    ]);
    expect(reader(shownNow).seeAlso).toEqual([
      { kind: 'link', text: 'Raid safehouse', article: 'raid_safehouse_article' },
      { kind: 'link', text: 'Raids', article: 'test_raid' },
    ]);
    expect(articleForTermView(discovered, catalog, 'RAID SAFEHOUSE')).toBe('raid_safehouse_article');

    // Subject visible, then hidden: in the earlier World state the links are plain text again.
    expect(articles(state, catalog)).toEqual(hidden);
  });

  it('Article term lookup: the Player-visible article with that Article term, ignoring case, or none', () => {
    const list = [entry('skill', 'x', ['skill', 'effective skill']), entry('other', 'x')];
    expect(articleForTerm('Skill', list)?.id).toBe('skill');
    expect(articleForTerm('EFFECTIVE SKILL', list)?.id).toBe('skill');
    expect(articleForTerm('skil', list)).toBeNull();
    // A displayed title is no Article term unless `terms` lists it.
    expect(articleForTerm('Title of other', list)).toBeNull();
    expect(articleForTerm('', list)).toBeNull();
    const state = newCampaign();
    expect(articleForTermView(state, gdrs, 'Skill')).toBe('mechanics_skill');
    expect(articleForTermView(state, gdrs, 'no such term')).toBeNull();
  });
});

describe('COMP: Article visibility and Player-visible information', () => {
  it('Campaign creation', () => {
    const state = newCampaign();
    const ids = visible(state);
    for (const id of [
      'guide_missions',
      'mechanics_combat',
      'initiate_article',
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
      // COMP, Met subjects: no Player-visible MissionSiteArchetype lists the soldier yet.
      'soldier_article',
    ]) {
      expect(ids).not.toContain(id);
    }
    // Every Guide article and Mechanics article, and every Agent and Upgrade article, in Game build order, with the
    // articles about the Met subjects: the Enemies of Apprehend member, which the discovered first Lead creates, their
    // Weapons and Armors, and the Agents' Combat pistol and Standard uniform.
    const all = gdrs.compendiumArticles;
    // The Contracting article waits for its `visible_when`, the completion of `contracting_opportunities`.
    const always = all.filter(
      (article) =>
        (article.category !== 'subject' && article.id !== 'mechanics_contracting') ||
        ['AgentArchetype', 'Upgrade'].includes(article.subjectType ?? ''),
    );
    const apprehend = gdrs.missionSiteArchetypes.find((item) => item.id === 'apprehend_member')!;
    const met = new Set([
      ...apprehend.enemies.flatMap(([id]) => {
        const enemy = gdrs.enemyArchetypes.get(id)!;
        return [enemy.id, enemy.weapon, enemy.armor];
      }),
      gdrs.agentArchetype.weapon,
      gdrs.agentArchetype.armor,
      // COMP, Met subjects: the Fallback Weapon and Armor, every Item Unlocked from the start, and their AmmoTypes.
      ...startingEquipment(gdrs),
    ]);
    expect(ids).toEqual(
      all
        .filter(
          (article) =>
            always.includes(article) ||
            (article.subject !== null && met.has(article.subject)) ||
            [
              'contracting_opportunities_article',
              'criminal_organizations_article',
              'locate_red_dawn_member_article',
              'apprehend_member_article',
            ].includes(article.id),
        )
        .map((article) => article.id),
    );
    // The query returns nothing about an article that is not Player-visible, not even that it exists: no identifier,
    // no subject, no Article link, and no See also entry names one.
    const reported = JSON.stringify(articles(state));
    expect(reported).not.toMatch(/safehouse_article|locate_red_dawn_hq|raid_hq|foil_/);
    const hiddenIds = all.map((article) => article.id).filter((id) => !ids.includes(id));
    expect(hiddenIds.length).toBeGreaterThan(0);
    for (const article of articles(state)) {
      const links = [
        ...article.body,
        ...article.formulas.flatMap((item) => [...item.label, ...item.text]),
        ...article.seeAlso,
      ].flatMap((segment) => (segment.kind === 'link' ? [segment.article] : []));
      expect(links.every((id) => ids.includes(id))).toBe(true);
      expect(links).not.toContain(article.id);
    }
    // An article is reported in its resolved form, never as authored.
    const initiate = articles(state).find((article) => article.id === 'initiate_article')!;
    expect(Object.keys(initiate).sort()).toEqual(
      [
        'body',
        'category',
        'formulas',
        'id',
        'listedUnder',
        'seeAlso',
        'subject',
        'subjectType',
        'title',
      ].sort(),
    );
    expect(initiate).toMatchObject({
      category: 'subject',
      title: gdrs.enemyArchetypes.get('initiate')!.name,
      subject: 'initiate',
      subjectType: 'EnemyArchetype',
      formulas: [],
    });
    // A Guide article or a Mechanics article is reported without a subject.
    expect(articles(state).find((article) => article.id === 'guide_agency')).toMatchObject({
      category: 'guide',
      subject: null,
      subjectType: null,
    });
    const combat = articles(state).find((article) => article.id === 'mechanics_combat')!;
    const authored = all.find((article) => article.id === 'mechanics_combat')!;
    expect(combat).toMatchObject({ category: 'mechanics', title: authored.title, subject: null });
    expect(combat.formulas.length).toBeGreaterThan(0);
    // Its See also entries, in the authored order, each shown under the displayed title of the article it names.
    expect(authored.seeAlso.length).toBeGreaterThan(0);
    expect(combat.seeAlso.map((link) => link.article)).toEqual(authored.seeAlso);
    expect(combat.seeAlso.map((link) => link.text)).toEqual(
      authored.seeAlso.map((id) => all.find((article) => article.id === id)!.title),
    );
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
    expect(beforeIds).not.toContain('interrogate_red_dawn_member_article');
    expect(beforeIds).not.toContain('locate_red_dawn_safehouse_article');

    // The Advance turn ending Turn t: the Mission is Won and discovers interrogate_red_dawn_member.
    state = advance(state, winning(state, site.id));
    expect(state.world.current.missions[missionAt(state, site.id)]!.state.lifecycle).toBe('Won');
    const after = visible(state);
    expect(after).toContain('interrogate_red_dawn_member_article');
    expect(after).not.toContain('locate_red_dawn_safehouse_article');
    expect(after).not.toContain('raid_safehouse_article');
    expect(after).not.toContain('red_dawn_article');

    // Undo restores the World state before that Advance turn, in which the article is absent again.
    expect(visible(before)).toEqual(beforeIds);
  });

  it('visible_when: the article about a Faction waits for its profile Lead to be completed', () => {
    const state = newCampaign();
    // Its subject, the FactionArchetype, is Player-visible from campaign creation, but its `visible_when` does not hold.
    expect(visible(state)).not.toContain('red_dawn_article');
    expect(gdrs.compendiumArticles.find((article) => article.id === 'red_dawn_article')!.visibleWhen).toEqual(
      {
        kind: 'lead_completed',
        lead: 'red_dawn_profile',
      },
    );
    const profiled = completeLead(state, 'red_dawn_profile');
    expect(visible(profiled)).toContain('red_dawn_article');
    expect(visible(profiled)).toContain('locate_red_dawn_safehouse_article');
    // COMP, CompendiumArticle: only `lead_completed`, naming a Lead of the Game build.
    expectDefective(
      (raw) =>
        (raw.get('red_dawn_article')['visible_when'] = { $entries: [['mission_won', 'apprehend_member']] }),
    );
    expectDefective(
      (raw) =>
        (raw.get('red_dawn_article')['visible_when'] = { $entries: [['lead_completed', 'no_such_lead']] }),
    );
    expectDefective((raw) => (raw.get('red_dawn_article')['visible_when'] = 'red_dawn_profile'));
    expect(
      catalogWith((raw) => delete raw.get('red_dawn_article')['visible_when']).compendiumArticles.find(
        (article) => article.id === 'red_dawn_article',
      )!.visibleWhen,
    ).toBeNull();
  });

  it('A Response Mission site', () => {
    let state = tweak(newCampaign(), (world) => {
      // Red Dawn starts at `dormant`, which has no operations; `faint` has them.
      Object.values(world.factions)[0]!.state.activityLevel = 'faint';
      Object.values(world.factions)[0]!.state.turnsUntilNextOperation = 1;
    });
    const operation = responseOperation(state);
    const article = `${operation.archetype}_article`;
    const other = gdrs.missionSiteArchetypes.find(
      (item) => item.kind === 'response' && item.id !== operation.archetype,
    )!;
    expect(visible(state)).not.toContain(article);
    state = advance(state, operation.injected);
    expect(sites(state).map((site) => site.archetype)).toEqual([operation.archetype]);
    expect(visible(state)).toContain(article);
    expect(visible(state)).not.toContain(`${other.id}_article`);

    // The Mission site stays in Campaign state when it is no longer Active, so the article stays Player-visible.
    const expired = tweak(state, (world) => {
      for (const site of Object.values(world.missionSites)) {
        site.state.lifecycle = 'Expired';
      }
    });
    expect(visible(expired)).toContain(article);
  });

  it('No gameplay effect: equal Campaign state with any set of articles, or none', () => {
    const none = catalogWith((raw) => raw.pruneArticles(true));
    let withArticles = newCampaign();
    let withoutArticles = newCampaign({ catalog: none });
    expect(withoutArticles).toEqual(withArticles);
    for (let turn = 0; turn < 3; turn += 1) {
      withArticles = advance(withArticles);
      withoutArticles = advance(withoutArticles, {}, none);
    }
    expect(withoutArticles).toEqual(withArticles);
    // COMP, Met subjects: some articles still wait for their subjects to be met.
    expect(visibleArticles(withArticles.world.current, gdrs).length).toBeLessThan(
      gdrs.compendiumArticles.length,
    );
  });

  it('every Bootstrap article lies in the directory of one file per GDR', () => {
    const files = RED_DAWN_ONLY_FILES.filter((file) => file.path.startsWith(ARTICLE_DIRECTORY));
    expect(files.map((file) => file.gdrs.length)).toEqual(files.map(() => 1));
    expect(files).toHaveLength(gdrs.compendiumArticles.length);
  });
});

describe('COMP: Player API', () => {
  it('getCompendiumArticles returns the Player-visible articles, and follows the World state on undo', async () => {
    const { engine } = await startEngine({ gdrFiles: RED_DAWN_ONLY_FILES });
    expect(engine.player.queries.getCompendiumArticles().ok).toBe(false);
    expect(engine.player.queries.getArticleForTerm('skill').ok).toBe(false);
    ok(await engine.session.campaign.create({ seed: 'compendium' }));
    const initial = ok(engine.player.queries.getCompendiumArticles());
    expect(initial.map((article) => article.id)).toEqual(visible(newCampaign({ firstLead: false })));
    expect(initial.find((article) => article.id === 'red_dawn_article')).toBeUndefined();
    expect(ok(engine.player.queries.getArticleForTerm('Combat rating'))).toBe('mechanics_combat_rating');
    // The Article term of the article about the MissionSiteArchetype that the second Lead creates.
    const term = gdrs.compendiumArticles.find((item) => item.id === 'apprehend_member_article')!.terms[0]!;
    expect(ok(engine.player.queries.getArticleForTerm(term))).toBeNull();

    // Scripted play: every Agent investigates the first Lead, one Advance turn at a time, until an Advance turn
    // completes it and so discovers the next Lead. It makes its own Player actions, so it is no Campaign test
    // (CTEST, Limits).
    const has = (id: string) =>
      ok(engine.player.queries.getCompendiumArticles()).some((article) => article.id === id);
    const team = ok(engine.player.queries.getCurrentLiveWorldState()).agents.map((agent) => agent.id);
    ok(await engine.player.actions.startInvestigation('criminal_organizations', team));
    let turns = 0;
    while (!has('locate_red_dawn_member_article') && turns < 100) {
      ok(await engine.player.actions.advanceTurn());
      turns += 1;
    }
    expect(has('locate_red_dawn_member_article')).toBe(true);
    expect(has('apprehend_member_article')).toBe(true);
    expect(has('locate_red_dawn_safehouse_article')).toBe(false);
    expect(ok(engine.player.queries.getArticleForTerm(term))).toBe('apprehend_member_article');

    // Undo to the Autosave before that Advance turn: the two articles are absent again.
    ok(await engine.session.timeline.undoToAutosave());
    expect(has('locate_red_dawn_member_article')).toBe(false);
    expect(has('apprehend_member_article')).toBe(false);
    expect(ok(engine.player.queries.getArticleForTerm(term))).toBeNull();
  });
});

describe('COMP: Met subjects', () => {
  const discover = (state: CampaignState, lead: string) =>
    tweak(state, (world) => {
      world.discoveredLeads.push(lead);
    });

  it('GDRS: the first World state shows, of the Subject articles, only field_agent, its issued kit, the Fallback Weapon and Armor, the Items Unlocked from the start and their Ammo, the Upgrades, contracting_opportunities, and criminal_organizations', () => {
    const catalog = bootstrapGdrCatalog();
    const state = newCampaign({ catalog, firstLead: false });
    const subjects = visibleArticles(state.world.current, catalog)
      .filter((article) => article.category === 'subject')
      .map((article) => article.subject);
    const upgrades = catalog.upgrades.map((upgrade) => upgrade.id);
    expect(upgrades.length).toBeGreaterThan(0);
    const fieldAgent = catalog.agentArchetype;
    expect([...subjects].sort()).toEqual(
      [
        fieldAgent.id,
        fieldAgent.weapon,
        fieldAgent.armor,
        ...startingEquipment(catalog).filter((id) => id !== fieldAgent.weapon && id !== fieldAgent.armor),
        ...upgrades,
        'contracting_opportunities',
        'criminal_organizations',
      ].sort(),
    );
    expect([...metSubjects(state.world.current, catalog)].sort()).toEqual(
      [...new Set([fieldAgent.weapon, fieldAgent.armor, ...startingEquipment(catalog)])].sort(),
    );
  });

  it('an Enemy is met once a Player-visible MissionSiteArchetype lists it, and its Weapon with it', () => {
    let state = newCampaign({ firstLead: false });
    expect(visible(state)).not.toContain('initiate_article');
    // COMP, Met subjects: the basic pistol is Unlocked from the start, so it is met from the start too.
    expect(visible(state)).toContain('basic_pistol_article');
    expect(visible(state)).not.toContain('basic_clothing_article');
    // COMP, Met subjects: the combat pistol is met from the start, because every Agent carries one.
    expect(visible(state)).toContain('combat_pistol_article');
    // COMP, Article visibility: an Armor's article needs no Met subject.
    expect(visible(state)).toContain('standard_uniform_article');

    // Discovering the Lead that creates Apprehend member, before any Mission site exists.
    state = discover(state, 'locate_red_dawn_member');
    const met = metSubjects(state.world.current, gdrs);
    expect(met.has('initiate')).toBe(true);
    expect(met.has('operative')).toBe(true);
    expect(met.has('basic_pistol')).toBe(true);
    expect(met.has('combat_pistol')).toBe(true);
    expect(met.has('soldier')).toBe(false);
    expect(visible(state)).toContain('initiate_article');
    expect(visible(state)).toContain('basic_pistol_article');
    expect(visible(state)).toContain('basic_clothing_article');

    // Every Weapon a met Enemy carries is met, and no other.
    const raid = gdrs.missionSiteArchetypes.find((item) => item.id === 'raid_safehouse')!;
    state = discover(state, 'locate_red_dawn_safehouse');
    const after = metSubjects(state.world.current, gdrs);
    for (const [enemy] of raid.enemies) {
      expect(after.has(enemy)).toBe(true);
      expect(after.has(gdrs.enemyArchetypes.get(enemy)!.weapon)).toBe(true);
    }
    const carried = new Set([
      gdrs.agentArchetype.weapon,
      ...startingEquipment(gdrs),
      ...[...gdrs.enemyArchetypes.values()]
        .filter((enemy) => after.has(enemy.id))
        .map((enemy) => enemy.weapon),
    ]);
    for (const weapon of gdrs.weapons.keys()) {
      expect(after.has(weapon)).toBe(carried.has(weapon));
    }
  });

  it('Enemy seen at a Mission site, then the site expires: its article stays Player-visible', () => {
    let state = tweak(newCampaign({ firstLead: false }), (world) => {
      // Red Dawn starts at `dormant`, which has no operations; `faint` has them.
      Object.values(world.factions)[0]!.state.activityLevel = 'faint';
      Object.values(world.factions)[0]!.state.turnsUntilNextOperation = 1;
    });
    const operation = responseOperation(state);
    state = advance(state, operation.injected);
    const foil = gdrs.missionSiteArchetypes.find((item) => item.id === operation.archetype)!;
    const enemy = foil.enemies[0]![0];
    expect(visible(state)).toContain(`${enemy}_article`);
    const expired = tweak(state, (world) => {
      for (const site of Object.values(world.missionSites)) {
        site.state.lifecycle = 'Expired';
      }
    });
    expect(visible(expired)).toContain(`${enemy}_article`);
  });
});

describe('COMP: Revealed Compendium', () => {
  it('reports every article resolved as though every article were Player-visible, and which are', () => {
    const state = newCampaign({ firstLead: false });
    const revealed = revealedCompendiumView(state, gdrs);
    const all = gdrs.compendiumArticles;
    expect(revealed.articles.map((article) => article.id)).toEqual(all.map((article) => article.id));
    const shownIds = visible(state);
    for (const article of revealed.articles) {
      expect(article.playerVisible).toBe(shownIds.includes(article.id));
    }
    // V is every article: each article resolves as it does in a World state in which every article is visible.
    const resolved = resolveArticles(all);
    expect(revealed.articles.map((article) => article.body)).toEqual(resolved.map((article) => article.body));
    // Every See also entry is kept, and Article links reach articles that are not Player-visible.
    for (const [index, article] of all.entries()) {
      expect(revealed.articles[index]!.seeAlso.map((link) => link.article)).toEqual(article.seeAlso);
    }
    const links = revealed.articles.flatMap((article) =>
      [...article.body, ...article.formulas.flatMap((row) => [...row.label, ...row.text])].flatMap(
        (segment) => (segment.kind === 'link' ? [segment.article] : []),
      ),
    );
    expect(links.some((id) => !shownIds.includes(id))).toBe(true);
    // The Article term lookup reports the article of any Article term.
    expect(revealed.terms['raid safehouse']).toBe('raid_safehouse_article');
    expect(revealed.terms['combat rating']).toBe('mechanics_combat_rating');
    for (const article of all) {
      for (const term of article.terms) {
        expect(revealed.terms[term.toLowerCase()]).toBe(articleForTerm(term, all)!.id);
      }
    }
  });

  it('is a Developer API query: only under Dev mode, and it changes nothing', async () => {
    const { engine } = await startEngine({ gdrFiles: RED_DAWN_ONLY_FILES });
    ok(await engine.session.campaign.create({ seed: 'revealed' }));
    expect(engine.developer.queries.getRevealedCompendium().ok).toBe(false);
    expect(engine.developer.queries.getRevealedLeads().ok).toBe(false);
    ok(engine.session.developer.enable());
    const before = ok(engine.session.timeline.getStatus());
    const revision = engine.getRevision();
    const revealed = ok(engine.developer.queries.getRevealedCompendium());
    expect(revealed.articles).toHaveLength(gdrs.compendiumArticles.length);
    expect(revealed.articles.filter((article) => article.playerVisible).map((article) => article.id)).toEqual(
      ok(engine.player.queries.getCompendiumArticles()).map((article) => article.id),
    );
    // Every Lead, as though discovered and Assessed; investigating an undiscovered one stays impossible.
    const leads = ok(engine.developer.queries.getRevealedLeads());
    expect(leads.map((lead) => lead.id)).toEqual(gdrs.leads.map((lead) => lead.id));
    const hq = leads.find((lead) => lead.id === 'locate_red_dawn_hq')!;
    expect(hq.requiredProgress).toBe(
      gdrs.leads.find((lead) => lead.id === 'locate_red_dawn_hq')!.requiredProgress,
    );
    expect(hq.canBeInvestigatedNow).toBe(false);
    expect(ok(engine.player.queries.getAvailableActions()).startInvestigation).not.toContain(
      'locate_red_dawn_hq',
    );
    expect(
      ok(engine.player.queries.getCurrentRetiredWorldState()).leads.map((lead) => lead.id),
    ).not.toContain('locate_red_dawn_hq');
    expect(engine.getRevision()).toBe(revision);
    expect(ok(engine.session.timeline.getStatus())).toEqual(before);
  });
});
