import type { ICacheStorage } from '@translayer/core';

type StoreEntry = { key: string; value: string };

function requireIndexedDB(): IDBFactory {
  const idb = (globalThis as any).indexedDB as IDBFactory | undefined;
  if (!idb) throw new Error('IndexedDBCacheStorage: indexedDB is not available.');
  return idb;
}

function openDb(): Promise<IDBDatabase> {
  const idb = requireIndexedDB();
  return new Promise((resolve, reject) => {
    const request = idb.open('translayer-cache', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBCacheStorage implements ICacheStorage {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openDb();
  }

  async getMany(keys: string[]): Promise<Array<string | undefined>> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');

      const results: Array<string | undefined> = new Array(keys.length);
      let pending = keys.length;

      const onDone = () => {
        pending -= 1;
        if (pending === 0) resolve(results);
      };

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const req = store.get(key);
        req.onsuccess = () => {
          const entry = req.result as StoreEntry | undefined;
          results[i] = entry?.value;
          onDone();
        };
        req.onerror = () => reject(req.error);
      }
    });
  }

  async setMany(entries: Array<{ key: string; value: string }>): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      for (const e of entries) {
        store.put({ key: e.key, value: e.value } satisfies StoreEntry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

