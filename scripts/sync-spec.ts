/**
 * PLACE, Keeping the copies current: mirrors every file this Implementation copies from the Spec repo, from a commit of
 * the Spec repo and never from its working tree, so that uncommitted work there is never copied. After a run each copy
 * equals its original: files are added, replaced, and deleted, and every byte is kept, also of the binary assets.
 *
 * Usage: npm run sync:spec -- [--from <dir>] [--rev <revision>] [--check]
 *
 * - `--from <dir>`: the Spec repo clone; `../game-v5` beside this Implementation repo when absent.
 * - `--rev <revision>`: the commit to mirror; `origin/main` when absent. The script does not fetch, so `origin/main`
 *   is the commit the clone last fetched.
 * - `--check`: changes nothing, prints each difference, and exits with code 1 when there is any.
 *
 * It prints the full hash of the commit it mirrored as a `Spec:` line, the trailer of the commit that follows it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * One row of the path mapping. A `source` that ends in `/` is a tree of the Spec repo: every file under it is copied
 * to the same relative path under `copy`, apart from the paths `except` names, each a file or a tree ending in `/`.
 * Any other `source` is one file, copied to the file `copy`. Paths are relative to the repository roots.
 */
export interface SpecCopy {
  readonly source: string;
  readonly copy: string;
  readonly except?: readonly string[];
}

/**
 * The path mapping: what this Implementation copies from the Spec repo, and where it keeps each copy. The `copy` of a
 * tree holds nothing but copies, so a file there that its `source` lacks is deleted.
 */
export const SPEC_COPIES: readonly SpecCopy[] = [
  // PLACE, Game data in an Implementation: the GDR files, never the Cut content.
  { source: 'content/', copy: 'content/', except: ['content/cut/'] },
  // PLACE, Music in an Implementation: the Track files. The track records and the README are elsewhere in assets/music/.
  { source: 'assets/music/tracks/', copy: 'assets/music/tracks/' },
  // PLACE, Sounds in an Implementation: the Sound files.
  { source: 'assets/sounds/', copy: 'assets/sounds/', except: ['assets/sounds/README.md'] },
  // PLACE, Artwork in an Implementation: the web UI shows every image file of the directory.
  { source: 'assets/images/', copy: 'assets/images/', except: ['assets/images/README.md'] },
  // GLOBE, Globe files in the Implementation repo: the four maps and the four code files; not the reference viewer's
  // page, the README, or the script that rebuilds the maps.
  { source: 'lib/globe/assets/', copy: 'public/globe/' },
  { source: 'lib/globe/globe.js', copy: 'src/web/globe/globe.js' },
  { source: 'lib/globe/globe-scene.js', copy: 'src/web/globe/globe-scene.js' },
  { source: 'lib/globe/globe.css', copy: 'src/web/globe/globe.css' },
  { source: 'lib/globe/globe.d.ts', copy: 'src/web/globe/globe.d.ts' },
  // The license of the specifications is the license of this Implementation.
  { source: 'LICENSE', copy: 'LICENSE' },
];

const isTree = (path: string): boolean => path.endsWith('/');

const covers = (pattern: string, path: string): boolean =>
  isTree(pattern) ? path.startsWith(pattern) : path === pattern;

/** Where the copy of a Spec repo file is kept in this Implementation repo; null for a file that is not copied. */
export function copyPathOf(specPath: string, copies: readonly SpecCopy[] = SPEC_COPIES): string | null {
  for (const { source, copy, except = [] } of copies) {
    if (!covers(source, specPath) || except.some((pattern) => covers(pattern, specPath))) {
      continue;
    }
    return isTree(source) ? copy + specPath.slice(source.length) : copy;
  }
  return null;
}

export interface Difference {
  readonly kind: 'add' | 'replace' | 'delete';
  /** The path of the copy, relative to the root of this Implementation repo. */
  readonly path: string;
}

/**
 * What a mirror changes: `wanted` and `present` map the path of each copy to the Git blob hash of its content, as the
 * Spec repo commit holds it and as this Implementation repo holds it now.
 */
export function differencesOf(
  wanted: ReadonlyMap<string, string>,
  present: ReadonlyMap<string, string>,
): Difference[] {
  const differences: Difference[] = [];
  for (const [path, hash] of wanted) {
    const held = present.get(path);
    if (held === undefined) {
      differences.push({ kind: 'add', path });
    } else if (held !== hash) {
      differences.push({ kind: 'replace', path });
    }
  }
  for (const path of present.keys()) {
    if (!wanted.has(path)) {
      differences.push({ kind: 'delete', path });
    }
  }
  return differences.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The hash Git gives a file of these bytes, so that a copy is compared with its original without reading the original. */
export function gitBlobHash(bytes: Uint8Array, algorithm: 'sha1' | 'sha256' = 'sha1'): string {
  return createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

interface Options {
  readonly from: string;
  readonly rev: string;
  readonly check: boolean;
}

class UsageError extends Error {}

function parseOptions(args: readonly string[], root: string): Options {
  let from = resolve(root, '..', 'game-v5');
  let rev = 'origin/main';
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--check') {
      check = true;
    } else if ((arg === '--from' || arg === '--rev') && value !== undefined) {
      if (arg === '--from') {
        from = resolve(value);
      } else {
        rev = value;
      }
      index += 1;
    } else {
      throw new UsageError(`Usage: npm run sync:spec -- [--from <dir>] [--rev <revision>] [--check]`);
    }
  }
  return { from, rev, check };
}

/** Runs Git in the Spec repo clone. The arguments are an array, never a shell string: `cmd.exe` drops `^`. */
function git(from: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['-C', from, ...args], {
    maxBuffer: 1024 ** 3,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

interface SourceFile {
  /** The path of the copy, relative to the root of this Implementation repo. */
  readonly copy: string;
  readonly blob: string;
}

/** Every file of the commit that the path mapping copies, read from the commit's tree. */
function sourceFiles(from: string, commit: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const { source } of SPEC_COPIES) {
    const path = isTree(source) ? source.slice(0, -1) : source;
    const listing = git(from, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', path]).toString('utf8');
    for (const line of listing.split('\0')) {
      if (line === '') {
        continue;
      }
      const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/s.exec(line);
      if (!match) {
        throw new Error(`Unexpected line from git ls-tree: ${line}`);
      }
      const [, mode, type, blob, specPath] = match as unknown as [string, string, string, string, string];
      const copy = copyPathOf(specPath);
      if (copy === null) {
        continue;
      }
      if (type !== 'blob' || mode === '120000') {
        throw new Error(`${specPath} is not a regular file in the Spec repo, so it cannot be copied`);
      }
      files.push({ copy, blob });
    }
  }
  return files;
}

function listFiles(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...listFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else {
      out.push(prefix + entry.name);
    }
  }
  return out;
}

/** Every copy this Implementation repo holds now: each file under the `copy` of a tree, and each copied file. */
function presentFiles(root: string, algorithm: 'sha1' | 'sha256'): Map<string, string> {
  const present = new Map<string, string>();
  for (const { source, copy } of SPEC_COPIES) {
    const paths = isTree(source)
      ? listFiles(join(root, copy), copy)
      : existsSync(join(root, copy))
        ? [copy]
        : [];
    for (const path of paths) {
      present.set(path, gitBlobHash(readFileSync(join(root, path)), algorithm));
    }
  }
  return present;
}

function removeEmptyDirectories(root: string, path: string): void {
  let dir = dirname(join(root, path));
  while (dir.startsWith(root) && dir !== root && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

function main(): void {
  const root = resolve(import.meta.dirname, '..');
  const options = parseOptions(process.argv.slice(2), root);
  if (!existsSync(options.from)) {
    throw new UsageError(`The Spec repo clone ${options.from} does not exist; name it with --from <dir>.`);
  }
  const commit = git(options.from, ['rev-parse', '--verify', `${options.rev}^{commit}`])
    .toString('utf8')
    .trim();
  const sources = sourceFiles(options.from, commit);
  const wanted = new Map(sources.map((file) => [file.copy, file.blob]));
  if (wanted.size !== sources.length) {
    throw new Error('Two files of the Spec repo map to one copy; correct SPEC_COPIES.');
  }
  const present = presentFiles(root, commit.length === 64 ? 'sha256' : 'sha1');
  const differences = differencesOf(wanted, present);

  for (const { kind, path } of differences) {
    if (!options.check) {
      const target = join(root, path);
      if (kind === 'delete') {
        rmSync(target);
        removeEmptyDirectories(root, path);
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, git(options.from, ['cat-file', 'blob', wanted.get(path)!]));
      }
    }
    console.log(`${options.check ? 'would ' : ''}${kind} ${path}`);
  }

  const count = `${differences.length} of ${wanted.size} copies`;
  console.log(options.check ? `${count} differ from their originals.` : `${count} changed.`);
  console.log(`Spec: ${commit}`);
  if (options.check && differences.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
