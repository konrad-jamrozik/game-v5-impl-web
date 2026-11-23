/**
 * Game storage: the persisted root of one Global configuration and zero or more Campaign saves; see ENG, Data
 * ownership. Adapters implement this interface, e.g. over IndexedDB or over files.
 */
export type SaveKind =
  | 'manual'
  | 'currentAutosave'
  | 'turnEndAutosave'
  | 'autopilotAutosave'
  | 'engagementAutosave'
  | 'disengagementAutosave'
  | 'furthestProgressAutosave';

/** What Game storage keeps beside the body of each Campaign save, so that listing reads no body. */
export interface SaveHeader {
  readonly saveId: string;
  readonly campaignId: string;
  readonly kind: SaveKind;
  /** The Turn the saved World state belongs to. */
  readonly turn: number;
  /**
   * The number of Player actions from the start of that Turn to the saved World state; absent from a header that
   * an earlier Game build wrote.
   */
  readonly actions?: number;
  /** The Game build that wrote the Campaign save. */
  readonly gameBuild: string;
  /** Identifies the saved World state on its line of play. */
  readonly stamp: string;
  /** When the Campaign save was last written, as an ISO 8601 UTC time; not Campaign state, see SAVES. */
  readonly writtenAt: string;
}

export interface GameStorage {
  /** The stored Global configuration text, or null when none was stored. */
  readGlobalConfiguration(): Promise<string | null>;
  writeGlobalConfiguration(text: string): Promise<void>;
  listSaveHeaders(): Promise<SaveHeader[]>;
  /** The body of a Campaign save, or null when it does not exist. Throws when Game storage cannot be read. */
  readSave(saveId: string): Promise<string | null>;
  /** Writes or replaces a Campaign save. Throws when Game storage refuses the write. */
  writeSave(header: SaveHeader, body: string): Promise<void>;
  deleteSave(saveId: string): Promise<void>;
}

/** Game storage held in memory, for tests and for a Session that persists nothing. */
export class MemoryStorage implements GameStorage {
  private globalConfiguration: string | null = null;
  readonly saves = new Map<string, { header: SaveHeader; body: string }>();
  /** Test hooks: make a write or a read fail for a matching Campaign save. */
  failWrite: ((header: SaveHeader) => boolean) | null = null;
  failRead: ((saveId: string) => boolean) | null = null;
  failDelete: ((saveId: string) => boolean) | null = null;
  writeCount = 0;

  readGlobalConfiguration(): Promise<string | null> {
    return Promise.resolve(this.globalConfiguration);
  }

  writeGlobalConfiguration(text: string): Promise<void> {
    this.globalConfiguration = text;
    return Promise.resolve();
  }

  listSaveHeaders(): Promise<SaveHeader[]> {
    return Promise.resolve([...this.saves.values()].map((save) => save.header));
  }

  readSave(saveId: string): Promise<string | null> {
    if (this.failRead?.(saveId)) {
      return Promise.reject(new Error('Game storage is unavailable'));
    }
    return Promise.resolve(this.saves.get(saveId)?.body ?? null);
  }

  writeSave(header: SaveHeader, body: string): Promise<void> {
    if (this.failWrite?.(header)) {
      return Promise.reject(new Error('Game storage refused the write'));
    }
    this.writeCount += 1;
    this.saves.set(header.saveId, { header, body });
    return Promise.resolve();
  }

  deleteSave(saveId: string): Promise<void> {
    if (this.failDelete?.(saveId) === true) {
      return Promise.reject(new Error('Game storage refused the deletion.'));
    }
    this.saves.delete(saveId);
    return Promise.resolve();
  }

  /** Test hook: replaces the body of a stored Campaign save, e.g. to corrupt it. */
  overwriteBody(saveId: string, body: string): void {
    const save = this.saves.get(saveId);
    if (save) {
      this.saves.set(saveId, { header: save.header, body });
    }
  }

  /** Test hook: replaces the header of a stored Campaign save. */
  overwriteHeader(saveId: string, header: SaveHeader): void {
    const save = this.saves.get(saveId);
    if (save) {
      this.saves.set(saveId, { header, body: save.body });
    }
  }
}
