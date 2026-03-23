import type { ICacheStorage } from '../types';

/**
 * Default in-memory cache.
 *
 * Kept in `@translayer/core` to avoid circular deps with `@translayer/cache`.
 */
export class MemoryCacheStorage implements ICacheStorage {
  private readonly map = new Map<string, string>();

  async getMany(keys: string[]): Promise<Array<string | undefined>> {
    return keys.map((k) => this.map.get(k));
  }

  async setMany(entries: Array<{ key: string; value: string }>): Promise<void> {
    for (const e of entries) this.map.set(e.key, e.value);
  }
}

