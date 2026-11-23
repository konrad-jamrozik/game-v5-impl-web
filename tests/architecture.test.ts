/**
 * PLACE, Repository root of an Implementation: no file of the Implementation imports a path outside the
 * Implementation directory. Also checks the layer matrix of the source folders against resolved paths.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const root = resolve(import.meta.dirname, '..');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(pattern)) {
    found.push(match[1]!);
  }
  return found;
}

const files = listFiles(root);

/** Which top-level source folders each source folder may import. */
const LAYERS: Record<string, readonly string[]> = {
  kernel: ['kernel'],
  gdr: ['gdr', 'kernel'],
  engine: ['engine', 'gdr', 'kernel'],
  ai: ['ai', 'engine'],
  cli: ['cli', 'engine', 'ai'],
  web: ['web', 'engine', 'ai'],
};

describe('PLACE: Repository root of an Implementation', () => {
  it('imports no path outside the Implementation directory', () => {
    // The scan finds the source files, so that an empty scan cannot pass.
    expect(files.some((file) => file.startsWith(join(root, 'src') + sep))).toBe(true);
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          if (!target.startsWith(root + sep)) {
            offenders.push(`${relative(root, file)} -> ${specifier}`);
          }
        } else if (/^([a-zA-Z]:)?[\\/]/.test(specifier)) {
          offenders.push(`${relative(root, file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('holds its own Git ignore rules', () => {
    expect(existsSync(join(root, '.gitignore'))).toBe(true);
  });

  it('holds its own copy of the GDR files', () => {
    expect(statSync(join(root, 'content')).isDirectory()).toBe(true);
  });
});

describe('Layer boundaries', () => {
  const src = join(root, 'src');

  it('lets each layer import only the layers allowed for it', () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.startsWith(src + sep))) {
      const layer = relative(src, file).split(sep)[0]!;
      const allowed = LAYERS[layer];
      if (!allowed) {
        offenders.push(`${relative(root, file)}: unknown layer`);
        continue;
      }
      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith('.')) {
          if (['kernel', 'gdr', 'engine', 'ai'].includes(layer) && /^(node:|fs$|path$)/.test(specifier)) {
            offenders.push(`${relative(root, file)} -> ${specifier}`);
          }
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (!target.startsWith(src + sep)) {
          offenders.push(`${relative(root, file)} -> ${specifier} (outside src)`);
          continue;
        }
        const targetLayer = relative(src, target).split(sep)[0]!;
        if (!allowed.includes(targetLayer)) {
          offenders.push(`${relative(root, file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lets the Autopilot AI reach the engine only through the Player API types', () => {
    const offenders: string[] = [];
    const ai = join(src, 'ai');
    for (const file of files.filter((f) => f.startsWith(ai + sep))) {
      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith('.')) {
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (
          target.startsWith(join(src, 'engine') + sep) &&
          !target.endsWith(join('engine', 'player-api.ts'))
        ) {
          offenders.push(`${relative(root, file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lets the adapters reach the engine only through its public API', () => {
    const offenders: string[] = [];
    for (const layer of ['cli', 'web']) {
      const dir = join(src, layer);
      for (const file of files.filter((f) => f.startsWith(dir + sep))) {
        for (const specifier of importsOf(file)) {
          if (!specifier.startsWith('.')) {
            continue;
          }
          const target = resolve(dirname(file), specifier);
          const inEngine = target.startsWith(join(src, 'engine') + sep);
          const inAi = target.startsWith(join(src, 'ai') + sep);
          if (inEngine && !target.endsWith(join('engine', 'index.ts'))) {
            offenders.push(`${relative(root, file)} -> ${specifier}`);
          }
          if (inAi && !target.endsWith(join('ai', 'index.ts'))) {
            offenders.push(`${relative(root, file)} -> ${specifier}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
