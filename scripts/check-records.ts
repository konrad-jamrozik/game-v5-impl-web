/**
 * Checks the two record files that Implementation Records requires: their entry format, their numbering, the
 * categories, the Resolution of each Specification problem, and the links between Specification problems and
 * Implementation decisions. It also checks the two tracking records that Specification Tracking requires: the form of
 * the Specification baseline, and that the Specification map has its sections in order and lists only existing paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const PROBLEM_CATEGORIES = ['Conflict', 'Implicit gap', 'Needed TODO', 'Duplicate'];
const DECISION_CATEGORIES = [
  'Asked by the specifications',
  'Conflict resolution',
  'Gap resolution',
  'Treatment of guidance',
];
/** Each Guidance specification must have a Treatment of guidance decision naming it. */
const GUIDANCE_SPECIFICATIONS = ['Tech Stack Suggestion', 'DEPDIR', 'SCHEMA', 'GHPAGES', 'UPDATES'];
/** A Resolved or Declined Specification problem names a commit of the specifications by its full hash. */
const FULL_HASH = /\b[0-9a-f]{40}\b/;

interface Entry {
  id: string;
  number: number;
  title: string;
  body: string;
  fields: Map<string, string>;
}

const errors: string[] = [];

function parse(file: string, prefix: string, title: string): Entry[] {
  const text = readFileSync(join(root, 'records', file), 'utf8').replaceAll('\r\n', '\n');
  if (!text.startsWith(`# ${title}\n`)) {
    errors.push(`${file}: must start with the H1 "# ${title}"`);
  }
  const entries: Entry[] = [];
  const sections = text.split(/^## /m).slice(1);
  for (const section of sections) {
    const heading = section.slice(0, section.indexOf('\n'));
    const match = new RegExp(`^(${prefix}-(\\d+)): (.+)$`).exec(heading);
    if (!match) {
      errors.push(`${file}: heading "## ${heading}" is not "${prefix}-<number>: <title>"`);
      continue;
    }
    const body = section.slice(heading.length + 1);
    const fields = new Map<string, string>();
    for (const part of body.split(/^- \*\*/m).slice(1)) {
      const end = part.indexOf(':**');
      if (end > 0) {
        fields.set(part.slice(0, end), part.slice(end + 3).trim());
      }
    }
    entries.push({ id: match[1]!, number: Number(match[2]), title: match[3]!, body, fields });
  }
  entries.forEach((entry, index) => {
    if (entry.number !== index + 1) {
      errors.push(`${file}: ${entry.id} is entry ${index + 1}; entries are numbered from 1 in order`);
    }
  });
  return entries;
}

function ids(text: string, prefix: string): string[] {
  return [...text.matchAll(new RegExp(`${prefix}-\\d+`, 'g'))].map((m) => m[0]);
}

const problems = parse('specification-problems.md', 'PROB', 'Specification problems');
const decisions = parse('implementation-decisions.md', 'DEC', 'Implementation decisions');
const decisionById = new Map(decisions.map((d) => [d.id, d]));
const problemById = new Map(problems.map((p) => [p.id, p]));

for (const problem of problems) {
  for (const field of ['Category', 'Affected specifications', 'Description', 'Links', 'Resolution']) {
    if (!problem.fields.get(field)) {
      errors.push(`${problem.id}: missing "${field}"`);
    }
  }
  const category = problem.fields.get('Category') ?? '';
  if (!PROBLEM_CATEGORIES.includes(category)) {
    errors.push(`${problem.id}: unknown category "${category}"`);
  }
  const resolution = problem.fields.get('Resolution') ?? '';
  const kind = /^(Open|Resolved|Declined)\b/.exec(resolution)?.[1];
  if (kind === undefined) {
    errors.push(`${problem.id}: its Resolution must be Open, Resolved, or Declined`);
  } else if (kind !== 'Open' && !FULL_HASH.test(resolution)) {
    errors.push(`${problem.id}: a ${kind} Resolution must name a commit by its full hash`);
  }
  const wanted =
    category === 'Conflict' || category === 'Duplicate' ? 'Conflict resolution' : 'Gap resolution';
  const linked = ids(problem.fields.get('Links') ?? '', 'DEC');
  const settling = linked.filter((id) => decisionById.get(id)?.fields.get('Category') === wanted);
  if (settling.length === 0) {
    errors.push(`${problem.id}: must link at least one ${wanted} decision`);
  }
  for (const id of linked) {
    const decision = decisionById.get(id);
    if (!decision) {
      errors.push(`${problem.id}: links ${id}, which does not exist`);
    } else if (!ids(decision.fields.get('Links') ?? '', 'PROB').includes(problem.id)) {
      errors.push(`${problem.id}: links ${id}, but ${id} does not link back`);
    }
  }
}

for (const decision of decisions) {
  for (const field of [
    'Category',
    'Affected specifications',
    'Description',
    'Options considered',
    'Option chosen',
    'Why',
    'Links',
  ]) {
    if (!decision.fields.get(field)) {
      errors.push(`${decision.id}: missing "${field}"`);
    }
  }
  const category = decision.fields.get('Category') ?? '';
  if (!DECISION_CATEGORIES.includes(category)) {
    errors.push(`${decision.id}: unknown category "${category}"`);
  }
  const linked = ids(decision.fields.get('Links') ?? '', 'PROB');
  for (const id of linked) {
    const problem = problemById.get(id);
    if (!problem) {
      errors.push(`${decision.id}: links ${id}, which does not exist`);
    } else if (!ids(problem.fields.get('Links') ?? '', 'DEC').includes(decision.id)) {
      errors.push(`${decision.id}: links ${id}, but ${id} does not link back`);
    }
  }
  if ((category === 'Conflict resolution' || category === 'Gap resolution') && linked.length === 0) {
    errors.push(`${decision.id}: a ${category} decision must link the problem it settles`);
  }
  if (
    category === 'Treatment of guidance' &&
    !/Used as is|Used with modifications|Used a different approach/.test(decision.body)
  ) {
    errors.push(
      `${decision.id}: must state "Used as is", "Used with modifications", or "Used a different approach"`,
    );
  }
}

for (const specification of GUIDANCE_SPECIFICATIONS) {
  const found = decisions.some(
    (d) =>
      d.fields.get('Category') === 'Treatment of guidance' &&
      (d.fields.get('Affected specifications') ?? '').includes(specification),
  );
  if (!found) {
    errors.push(`No Treatment of guidance decision names the Guidance specification ${specification}`);
  }
}

// The tracking records; see Specification Tracking.
const baseline = readFileSync(join(root, 'records', 'specification-baseline.md'), 'utf8').replaceAll(
  '\r\n',
  '\n',
);
if (!/^# Specification baseline\n\nRevision: [0-9a-f]{40}\n$/.test(baseline)) {
  errors.push('specification-baseline.md: must hold the H1 and one line "Revision: <full commit hash>"');
}
const map = readFileSync(join(root, 'records', 'specification-map.md'), 'utf8').replaceAll('\r\n', '\n');
if (!map.startsWith('# Specification map\n')) {
  errors.push('specification-map.md: must start with the H1 "# Specification map"');
}
const mapSections = map.split(/^## /m).slice(1);
const specIds: string[] = [];
for (const mapSection of mapSections) {
  const heading = mapSection.slice(0, mapSection.indexOf('\n'));
  const specId = /^([A-Z]+): .+$/.exec(heading)?.[1];
  if (specId === undefined) {
    errors.push(`specification-map.md: heading "## ${heading}" is not "<Spec ID>: <title>"`);
    continue;
  }
  specIds.push(specId);
  const lines = mapSection
    .slice(heading.length)
    .split('\n')
    .filter((line) => line.trim() !== '');
  const paths = lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim());
  if (paths.length !== lines.length && !(lines.length === 1 && lines[0] === 'No files.')) {
    errors.push(`specification-map.md: ${specId} must hold a list of paths or the single line "No files."`);
  }
  for (const path of paths) {
    if (!existsSync(join(root, path))) {
      errors.push(`specification-map.md: ${specId} lists ${path}, which does not exist`);
    }
  }
}
if (specIds.join() !== [...specIds].sort().join() || new Set(specIds).size !== specIds.length) {
  errors.push('specification-map.md: sections must be in alphabetical order of Spec ID, each once');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `records ok: ${problems.length} problems, ${decisions.length} decisions, ${specIds.length} mapped specifications`,
);
