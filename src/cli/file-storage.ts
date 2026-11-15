/** Game storage as JSON files in a data directory, for the terminal CLI; see DEC-008. */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameStorage, SaveHeader } from '../engine/index.ts';

export class FileStorage implements GameStorage {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private savesDir(): string {
    return join(this.dir, 'saves');
  }

  private file(saveId: string, part: 'header' | 'body'): string {
    return join(this.savesDir(), `${encodeURIComponent(saveId)}.${part}.json`);
  }

  private async read(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /** Writes a file whole or not at all: a failed write leaves the earlier file as it was. */
  private async replace(path: string, text: string): Promise<void> {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, text);
    await rename(temporary, path);
  }

  readGlobalConfiguration(): Promise<string | null> {
    return this.read(join(this.dir, 'global-configuration.json'));
  }

  async writeGlobalConfiguration(text: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.replace(join(this.dir, 'global-configuration.json'), text);
  }

  async listSaveHeaders(): Promise<SaveHeader[]> {
    let names: string[];
    try {
      names = await readdir(this.savesDir());
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const headers: SaveHeader[] = [];
    for (const name of names.filter((item) => item.endsWith('.header.json')).sort()) {
      const text = await this.read(join(this.savesDir(), name));
      if (text !== null) {
        try {
          headers.push(JSON.parse(text) as SaveHeader);
        } catch {
          // A header that cannot be read is skipped; loading its Campaign save reports the failure.
        }
      }
    }
    return headers;
  }

  readSave(saveId: string): Promise<string | null> {
    return this.read(this.file(saveId, 'body'));
  }

  async writeSave(header: SaveHeader, body: string): Promise<void> {
    await mkdir(this.savesDir(), { recursive: true });
    await this.replace(this.file(header.saveId, 'body'), body);
    await this.replace(this.file(header.saveId, 'header'), JSON.stringify(header));
  }

  async deleteSave(saveId: string): Promise<void> {
    await rm(this.file(saveId, 'header'), { force: true });
    await rm(this.file(saveId, 'body'), { force: true });
  }
}
