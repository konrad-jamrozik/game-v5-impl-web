/**
 * COMP (Compendium): reads a CompendiumArticle GDR, applies Compendium article GDR validation, and replaces every
 * Placeholder of its templated texts by the value of the GDR property it names. A Placeholder shows a value of the
 * Game build, never of Campaign state, so it is replaced once, when the catalog is built.
 */
import type {
  ArticleCategory,
  ArticleTemplate,
  CatalogCompendiumArticle,
  CompendiumArticleGdr,
  Condition,
  TemplatePart,
} from './types.ts';

/** A GDR as `scripts/build-gdr.ts` writes it: its properties as authored, with `id` and `type`. */
export type RawGdr = Readonly<Record<string, unknown>>;

const CATEGORIES: readonly ArticleCategory[] = ['guide', 'mechanics', 'subject'];
const PROPERTIES = [
  'id',
  'type',
  'category',
  'title',
  'body',
  'subject',
  'formulas',
  'terms',
  'see_also',
  'visible_when',
];

/** COMP, Displayed title: two texts are equal ignoring case exactly when they are equal in lower case. */
export function ignoringCase(text: string): string {
  return text.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** A nested mapping as `scripts/build-gdr.ts` writes it, or null for any other value. */
function entriesOf(value: unknown): [string, unknown][] | null {
  if (!isRecord(value) || !Array.isArray(value['$entries']) || Object.keys(value).length !== 1) {
    return null;
  }
  return value['$entries'] as [string, unknown][];
}

/**
 * COMP, Compendium article GDR validation, rules 1 to 3, and the form of `terms` and `see_also` under rules 7 and 8:
 * the article as authored, or the rules it violates.
 */
export function parseCompendiumArticle(
  raw: RawGdr,
  parseCondition: (raw: unknown) => Condition | null,
): { readonly article: CompendiumArticleGdr } | { readonly problems: readonly string[] } {
  const problems: string[] = [];
  // Rule 1: Category is valid.
  const category = CATEGORIES.find((item) => item === raw['category']);
  if (category === undefined) {
    return { problems: ['Category is valid'] };
  }
  // Rule 2: Exact properties.
  const extra = Object.keys(raw).filter((key) => !PROPERTIES.includes(key));
  if (extra.length > 0) {
    problems.push(`Exact properties (${extra.join(', ')})`);
  }
  const required = (key: string, needed: boolean): boolean => {
    const present = raw[key] !== undefined;
    if (present !== needed) {
      problems.push(`Exact properties (${key})`);
    }
    return present && needed;
  };
  // Rule 3: Text is present.
  const text = (key: string): string => {
    const value = raw[key];
    if (!isText(value)) {
      problems.push(`Text is present (${key})`);
      return '';
    }
    return value;
  };
  const body = required('body', true) ? text('body') : '';
  const title = required('title', category !== 'subject') ? text('title') : null;
  let subject: string | null = null;
  if (required('subject', category === 'subject')) {
    if (isText(raw['subject'])) {
      subject = raw['subject'];
    } else {
      problems.push('Subject exists');
    }
  }
  const formulas: { label: string; text: string }[] = [];
  if (required('formulas', category === 'mechanics')) {
    const rows: readonly unknown[] = Array.isArray(raw['formulas']) ? raw['formulas'] : [];
    for (const row of rows) {
      const entries = new Map(entriesOf(row) ?? []);
      const label = entries.get('label');
      const rowText = entries.get('text');
      if (entries.size === 2 && isText(label) && isText(rowText)) {
        formulas.push({ label, text: rowText });
      }
    }
    if (rows.length === 0 || formulas.length !== rows.length) {
      problems.push('Text is present (formulas)');
    }
  }
  // Rule 7: Article terms are valid; that no two are equal is checked across the Game build.
  const terms: string[] = [];
  if (raw['terms'] !== undefined) {
    const list: readonly unknown[] | null = Array.isArray(raw['terms']) ? raw['terms'] : null;
    for (const term of list ?? []) {
      if (isText(term) && !/[{}]/.test(term) && !/^\s|\s$/u.test(term)) {
        terms.push(term);
      } else {
        problems.push(`Article terms are valid (${JSON.stringify(term)})`);
      }
    }
    if (list === null) {
      problems.push('Article terms are valid');
    }
  }
  // Rule 8: See also is valid; what each identifier names is checked across the Game build.
  const seeAlso: string[] = [];
  if (raw['see_also'] !== undefined) {
    const list: readonly unknown[] | null = Array.isArray(raw['see_also']) ? raw['see_also'] : null;
    for (const target of list ?? []) {
      if (isText(target) && !seeAlso.includes(target)) {
        seeAlso.push(target);
      } else {
        problems.push(`See also is valid (${JSON.stringify(target)})`);
      }
    }
    if (list === null) {
      problems.push('See also is valid');
    }
  }
  // Rule 10: Visibility Condition is valid: a valid Condition of the Condition kind `lead_completed` only. That the
  // Lead it names exists is checked across the Game build.
  let visibleWhen: Condition | null = null;
  if (raw['visible_when'] !== undefined) {
    visibleWhen = parseCondition(raw['visible_when']);
    if (visibleWhen === null || usesFactionCondition(visibleWhen)) {
      problems.push('Visibility Condition is valid');
    }
  }
  if (problems.length > 0) {
    return { problems };
  }
  return {
    article: {
      type: 'CompendiumArticle',
      id: String(raw['id']),
      category,
      title,
      body,
      subject,
      formulas,
      terms,
      seeAlso,
      visibleWhen,
    },
  };
}

/** Whether a Condition uses a Condition kind other than `lead_completed` at any depth. */
function usesFactionCondition(condition: Condition): boolean {
  switch (condition.kind) {
    case 'all':
    case 'any':
      return condition.conditions.some(usesFactionCondition);
    case 'not':
      return usesFactionCondition(condition.condition);
    case 'mission_won':
    case 'mission_won_with_enemy':
      return true;
    case 'lead_completed':
      return false;
  }
}

/** The Leads the `lead_completed` Conditions of a Condition name, at any depth. */
export function leadsNamed(condition: Condition): string[] {
  switch (condition.kind) {
    case 'all':
    case 'any':
      return condition.conditions.flatMap(leadsNamed);
    case 'not':
      return leadsNamed(condition.condition);
    case 'mission_won':
    case 'mission_won_with_enemy':
      return [];
    case 'lead_completed':
      return [condition.lead];
  }
}

type AuthoredPart =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'placeholder';
      readonly gdr: string;
      readonly property: string;
      readonly index: number | null;
    };

/** COMP, Placeholders: neither part contains a full stop, a brace, or white space; an index has no leading zero. */
const PLACEHOLDER = /^([^.{}\s]+)\.([^.{}\s]+)(?:\.([1-9][0-9]*))?$/u;

/**
 * COMP, Placeholders: splits templated text into authored text and Placeholders. `{{` stands for one literal `{` and
 * `}}` for one literal `}`; every other `{` begins a Placeholder, which ends at the next `}`, and every other `}` is
 * invalid. Returns what is wrong as text when the templated text breaks these rules.
 */
export function parseTemplate(text: string): readonly AuthoredPart[] | string {
  const parts: AuthoredPart[] = [];
  let literal = '';
  let position = 0;
  const flush = () => {
    if (literal !== '') {
      parts.push({ kind: 'text', text: literal });
      literal = '';
    }
  };
  while (position < text.length) {
    const character = text.charAt(position);
    if ((character === '{' || character === '}') && text.charAt(position + 1) === character) {
      literal += character;
      position += 2;
    } else if (character === '}') {
      return `a "}" at character ${position + 1} closes no Placeholder`;
    } else if (character === '{') {
      const end = text.indexOf('}', position);
      const match = end < 0 ? null : PLACEHOLDER.exec(text.slice(position + 1, end));
      if (match === null) {
        return `${JSON.stringify(text.slice(position, end < 0 ? undefined : end + 1))} is not a Placeholder`;
      }
      flush();
      parts.push({
        kind: 'placeholder',
        gdr: match[1] ?? '',
        property: match[2] ?? '',
        index: match[3] === undefined ? null : Number(match[3]),
      });
      position = end + 1;
    } else {
      literal += character;
      position += 1;
    }
  }
  flush();
  return parts;
}

/**
 * COMP, Value formatting: the text a Placeholder shows for one value as `scripts/build-gdr.ts` writes it, or null for
 * a value of a shape that no Placeholder can show, e.g. a mapping or an absent value. A number is read as the exact
 * decimal number the GDR file states, and nothing is rounded.
 */
export function formatPlaceholderValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value < 0 ? `−${-value}` : String(Math.abs(value));
  }
  const decimal = isRecord(value) && Object.keys(value).length === 1 ? value['$decimal'] : undefined;
  const match = typeof decimal === 'string' ? /^([+-]?)(\d+)\.(\d+)$/.exec(decimal) : null;
  if (match === null) {
    return null;
  }
  const whole = (match[2] ?? '').replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const digits = fraction === '' ? whole : `${whole}.${fraction}`;
  return match[1] === '-' && /[1-9]/.test(digits) ? `−${digits}` : digits;
}

/**
 * COMP, Placeholder sources: the properties of a GDR of each Type that a Placeholder may name, or `every`, and
 * whether only `{subject.…}` in a Subject article about the GDR may name them. The table is exhaustive.
 */
const PLACEHOLDER_SOURCES: Readonly<
  Record<string, { readonly properties: readonly string[] | 'every'; readonly subjectOnly: boolean }>
> = {
  AgentArchetype: { properties: 'every', subjectOnly: false },
  AgentParameters: { properties: 'every', subjectOnly: false },
  RecoveryParameters: { properties: 'every', subjectOnly: false },
  EnemyArchetype: { properties: 'every', subjectOnly: false },
  Weapon: { properties: 'every', subjectOnly: false },
  Armor: { properties: 'every', subjectOnly: false },
  CombatParameters: { properties: 'every', subjectOnly: false },
  EconomyParameters: { properties: 'every', subjectOnly: false },
  Upgrade: { properties: 'every', subjectOnly: false },
  InvestigationParameters: { properties: 'every', subjectOnly: false },
  EndingParameters: { properties: 'every', subjectOnly: false },
  FactionArchetype: { properties: ['name'], subjectOnly: true },
  Lead: { properties: ['name', 'description'], subjectOnly: true },
  MissionSiteArchetype: { properties: ['name', 'expires_in_turns'], subjectOnly: true },
};

/**
 * COMP, Value formatting: the properties whose value is a reference to a GDR, as the property table of the Type
 * defines them, with the Type of the GDR they reference. A Placeholder shows the `name` of the referenced GDR.
 */
const REFERENCE_PROPERTIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  AgentArchetype: { weapon: 'Weapon', armor: 'Armor' },
  EnemyArchetype: { weapon: 'Weapon', armor: 'Armor' },
};

/** The GDRs of a Game build as authored, by identifier; an identifier is unique only within a Type (DEC-014). */
type RawGdrs = ReadonlyMap<string, readonly RawGdr[]>;

/**
 * COMP, Compendium article GDR validation, rule 9: the text that replaces one Placeholder, or what is wrong with the
 * Placeholder.
 */
function resolvePlaceholder(
  part: Extract<AuthoredPart, { kind: 'placeholder' }>,
  subject: RawGdr | null,
  gdrs: RawGdrs,
): { readonly text: string } | { readonly problem: string } {
  const written = `{${part.gdr}.${part.property}${part.index === null ? '' : `.${part.index}`}}`;
  // `subject` never names a GDR whose identifier is `subject`.
  const ofSubject = part.gdr === 'subject';
  let gdr: RawGdr | null;
  if (ofSubject) {
    gdr = subject;
  } else {
    const named = gdrs.get(part.gdr) ?? [];
    if (named.length > 1) {
      return { problem: `${written} names GDRs of more than one Type` };
    }
    gdr = named[0] ?? null;
  }
  if (gdr === null) {
    return { problem: `${written} names no GDR` };
  }
  const type = String(gdr['type']);
  if (part.property === 'id' || part.property === 'type' || !Object.hasOwn(gdr, part.property)) {
    return { problem: `${written} names no property of the ${type}` };
  }
  const source = PLACEHOLDER_SOURCES[type];
  if (source === undefined || (source.subjectOnly && !ofSubject)) {
    return {
      problem: `${written} names a GDR of a Type that Placeholder sources does not allow in that form`,
    };
  }
  if (source.properties !== 'every' && !source.properties.includes(part.property)) {
    return { problem: `${written} names a property that Placeholder sources does not allow` };
  }
  let value = gdr[part.property];
  if (Array.isArray(value)) {
    const list: readonly unknown[] = value;
    if (part.index === null) {
      return { problem: `${written} names a list and has no index` };
    }
    if (part.index > list.length) {
      return { problem: `${written} has an index beyond the ${list.length} entries of the list` };
    }
    value = list[part.index - 1];
  } else if (part.index !== null) {
    return { problem: `${written} has an index and names no list` };
  }
  const referencedType = REFERENCE_PROPERTIES[type]?.[part.property];
  if (referencedType !== undefined) {
    const referenced = (typeof value === 'string' ? (gdrs.get(value) ?? []) : []).find(
      (item) => item['type'] === referencedType,
    );
    const name = referenced?.['name'];
    return isText(name) ? { text: name } : { problem: `${written} references no GDR that has a name` };
  }
  const text = formatPlaceholderValue(value);
  return text === null ? { problem: `${written} names a value that Value formatting cannot show` } : { text };
}

/**
 * COMP, Compendium article GDR validation, rules 4 to 9, across the Game build. Returns each article with its
 * displayed title, the Type of its subject, and every Placeholder replaced. `gdrs` holds every GDR of the Game build
 * as authored. A `subject` or a Placeholder that identifies GDRs of more than one Type identifies no single GDR and
 * is a data defect (DEC-045).
 */
export function validateCompendiumArticles(
  articles: readonly CompendiumArticleGdr[],
  gdrs: readonly RawGdr[],
  problems: string[],
): CatalogCompendiumArticle[] {
  const byId = new Map<string, RawGdr[]>();
  for (const gdr of gdrs) {
    const id = String(gdr['id']);
    byId.set(id, [...(byId.get(id) ?? []), gdr]);
  }
  const articleIds = new Set(articles.map((article) => article.id));
  const titles = new Set<string>();
  const subjects = new Set<string>();
  const terms = new Set<string>();

  return articles.map((article) => {
    const report = (message: string) => {
      problems.push(`CompendiumArticle ${article.id}: ${message}`);
    };
    // Rule 4: Subject exists, is not a CompendiumArticle, and has a `name` that is non-empty text.
    let subject: RawGdr | null = null;
    let title = article.title ?? '';
    if (article.subject !== null) {
      const named = (byId.get(article.subject) ?? []).filter((gdr) => gdr['type'] !== 'CompendiumArticle');
      const name = named[0]?.['name'];
      if (named.length > 1) {
        report(`Subject exists (${article.subject} identifies GDRs of more than one Type)`);
      } else if (named[0] === undefined) {
        report(`Subject exists (${article.subject})`);
      } else if (!isText(name)) {
        report(`Subject exists (${article.subject} has no name)`);
      } else {
        subject = named[0];
        title = name;
      }
      // Rule 5: One article per subject.
      if (subjects.has(article.subject)) {
        report(`One article per subject (${article.subject})`);
      }
      subjects.add(article.subject);
    }
    // Rule 6: Unique displayed titles, ignoring case.
    if (title !== '') {
      if (titles.has(ignoringCase(title))) {
        report(`Unique displayed titles (${title})`);
      }
      titles.add(ignoringCase(title));
    }
    // Rule 7: no two Article terms of the Game build are equal ignoring case.
    for (const term of article.terms) {
      if (terms.has(ignoringCase(term))) {
        report(`Article terms are valid (${term} is an Article term twice)`);
      }
      terms.add(ignoringCase(term));
    }
    // Rule 8: each See also identifier names a CompendiumArticle other than the article itself.
    for (const target of article.seeAlso) {
      if (target === article.id || !articleIds.has(target)) {
        report(`See also is valid (${target})`);
      }
    }
    // Rule 10: each Lead a `lead_completed` Condition of `visible_when` names is a Lead of the Game build, as LEAD,
    // Lead completed Condition kind, permits.
    for (const lead of article.visibleWhen === null ? [] : leadsNamed(article.visibleWhen)) {
      if (!(byId.get(lead) ?? []).some((gdr) => gdr['type'] === 'Lead')) {
        report(`Visibility Condition is valid (${lead})`);
      }
    }
    // Rule 9: Placeholders are valid.
    const template = (text: string): ArticleTemplate => {
      const parts = parseTemplate(text);
      if (typeof parts === 'string') {
        report(`Placeholders are valid (${parts})`);
        return [];
      }
      return parts.map((part): TemplatePart => {
        if (part.kind === 'text') {
          return part;
        }
        const resolved = resolvePlaceholder(part, subject, byId);
        if ('problem' in resolved) {
          report(`Placeholders are valid (${resolved.problem})`);
          return { kind: 'value', text: '' };
        }
        return { kind: 'value', text: resolved.text };
      });
    };
    return {
      type: article.type,
      id: article.id,
      category: article.category,
      title,
      subject: article.subject,
      subjectType: subject === null ? null : (subject['type'] as CatalogCompendiumArticle['subjectType']),
      body: template(article.body),
      formulas: article.formulas.map((row) => ({ label: template(row.label), text: template(row.text) })),
      terms: article.terms,
      seeAlso: article.seeAlso,
      visibleWhen: article.visibleWhen,
    };
  });
}
