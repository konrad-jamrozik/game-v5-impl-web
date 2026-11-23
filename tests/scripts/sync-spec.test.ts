/** Tests of the pure part of `scripts/sync-spec.ts`; see PLACE, Keeping the copies current. */
import { describe, expect, it } from 'vite-plus/test';
import { SPEC_COPIES, copyPathOf, differencesOf, gitBlobHash } from '../../scripts/sync-spec.ts';

describe('PLACE: the path mapping of the copies', () => {
  it('keeps a file of a copied tree at the same relative path', () => {
    expect(copyPathOf('content/agents/agent_parameters.yaml')).toBe('content/agents/agent_parameters.yaml');
    expect(copyPathOf('assets/music/tracks/S6 SCNP A.mp3')).toBe('assets/music/tracks/S6 SCNP A.mp3');
    expect(copyPathOf('assets/sounds/main-click.wav')).toBe('assets/sounds/main-click.wav');
    expect(copyPathOf('assets/images/chatgpt-agents-i2.png')).toBe('assets/images/chatgpt-agents-i2.png');
    expect(copyPathOf('LICENSE')).toBe('LICENSE');
  });

  it('keeps the globe maps and the globe code where the web UI reads them', () => {
    expect(copyPathOf('lib/globe/assets/earth-day.webp')).toBe('public/globe/earth-day.webp');
    expect(copyPathOf('lib/globe/globe-scene.js')).toBe('src/web/globe/globe-scene.js');
    expect(copyPathOf('lib/globe/globe.d.ts')).toBe('src/web/globe/globe.d.ts');
  });

  it('copies no Cut content, track record, README, reference viewer, or specification', () => {
    for (const path of [
      'content/cut/missions/mission_site_archetypes.yaml',
      'assets/music/README.md',
      'assets/music/yaml/S6 SCNP A.yaml',
      'assets/sounds/README.md',
      'assets/images/README.md',
      'lib/globe/index.html',
      'lib/globe/README.md',
      'lib/globe/scripts/build-globe-textures.py',
      'docs/specs/design/ui/music.md',
      'LICENSE.md',
    ]) {
      expect(copyPathOf(path), path).toBeNull();
    }
  });

  it('maps no two rows to one copy', () => {
    const copies = SPEC_COPIES.map((row) => row.copy);
    expect(new Set(copies).size).toBe(copies.length);
    for (const row of SPEC_COPIES) {
      expect(row.source.endsWith('/'), row.source).toBe(row.copy.endsWith('/'));
    }
  });
});

describe('PLACE: what a mirror changes', () => {
  it('adds, replaces, and deletes until each copy equals its original', () => {
    const wanted = new Map([
      ['content/a.yaml', '1'],
      ['content/b.yaml', '2'],
      ['content/c.yaml', '3'],
    ]);
    const present = new Map([
      ['content/b.yaml', '2'],
      ['content/c.yaml', 'changed'],
      ['content/d.yaml', '4'],
    ]);
    expect(differencesOf(wanted, present)).toEqual([
      { kind: 'add', path: 'content/a.yaml' },
      { kind: 'replace', path: 'content/c.yaml' },
      { kind: 'delete', path: 'content/d.yaml' },
    ]);
    expect(differencesOf(wanted, wanted)).toEqual([]);
  });

  it('hashes bytes as Git hashes a file', () => {
    // The hash `git hash-object` prints for an empty file and for the five bytes "hello".
    expect(gitBlobHash(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(gitBlobHash(new TextEncoder().encode('hello'))).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
  });
});
