/**
 * Game storage in the browser's IndexedDB. One database with three object stores: `configuration`
 * holds the Global configuration text, `headers` one small record for each Campaign save, and `bodies` its text.
 */
import type { GameStorage, SaveHeader } from '../engine/index.ts';

const STORES = ['configuration', 'headers', 'bodies'] as const;
type StoreName = (typeof STORES)[number];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

export class IndexedDbStorage implements GameStorage {
  private readonly factory: IDBFactory;
  private readonly name: string;
  private database: Promise<IDBDatabase> | null = null;

  constructor(factory: IDBFactory, name = 'game-v5-impl-web') {
    this.factory = factory;
    this.name = name;
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const req = this.factory.open(this.name, 1);
      req.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!req.result.objectStoreNames.contains(store)) {
            req.result.createObjectStore(store);
          }
        }
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        this.database = null;
        reject(req.error ?? new Error('IndexedDB cannot be opened'));
      };
      req.onblocked = () => {
        this.database = null;
        reject(new Error('IndexedDB is blocked by another tab'));
      };
    });
    return this.database;
  }

  private async get(store: StoreName, key: string): Promise<unknown> {
    const database = await this.open();
    return request(database.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async readGlobalConfiguration(): Promise<string | null> {
    const text = await this.get('configuration', 'global');
    return typeof text === 'string' ? text : null;
  }

  async writeGlobalConfiguration(text: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('configuration', 'readwrite');
    transaction.objectStore('configuration').put(text, 'global');
    await finished(transaction);
  }

  async listSaveHeaders(): Promise<SaveHeader[]> {
    const database = await this.open();
    const all: unknown = await request(
      database.transaction('headers', 'readonly').objectStore('headers').getAll(),
    );
    return all as SaveHeader[];
  }

  async readSave(saveId: string): Promise<string | null> {
    const text = await this.get('bodies', saveId);
    return typeof text === 'string' ? text : null;
  }

  /** Writes the header and the body in one transaction, so that a failed write leaves the earlier save whole. */
  async writeSave(header: SaveHeader, body: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(['headers', 'bodies'], 'readwrite');
    transaction.objectStore('bodies').put(body, header.saveId);
    transaction.objectStore('headers').put(header, header.saveId);
    await finished(transaction);
  }

  async deleteSave(saveId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(['headers', 'bodies'], 'readwrite');
    transaction.objectStore('bodies').delete(saveId);
    transaction.objectStore('headers').delete(saveId);
    await finished(transaction);
  }
}
