import type { ICacheStorage } from '@translayer/core';

/**
 * Browser cache adapter backed by `localStorage`.
 */
export class LocalStorageCacheStorage implements ICacheStorage {
  private readonly storage: Storage;

  constructor(storage: Storage | undefined = undefined) {
    const resolved = storage ?? (typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : undefined);
    if (!resolved) throw new Error('LocalStorageCacheStorage: localStorage is not available.');
    this.storage = resolved;
  }

  async getMany(keys: string[]): Promise<Array<string | undefined>> {
    return keys.map((k) => {
      const v = this.storage.getItem(k);
      return v === null ? undefined : v;
    });
  }

  async setMany(entries: Array<{ key: string; value: string }>): Promise<void> {
    for (const e of entries) this.storage.setItem(e.key, e.value);
  }
}

