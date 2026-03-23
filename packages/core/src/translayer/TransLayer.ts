import type { ICacheStorage, ITransLayerConfig, InjectTarget, PluckToken, TranslationSchema } from '../types';
import { BatchQueue, type BatchQueueConfig } from '../queue/BatchQueue';
import { SchemaRegistry } from '../schema/SchemaRegistry';
import { injectStrings } from '../transform/Injector';
import { pluckStrings } from '../transform/Plucker';
import { MemoryCacheStorage } from '../cache/MemoryCacheStorage';
import { fetchWithTranslator, wrapFetch } from '../interceptors/fetch';
import { wrapAxios } from '../interceptors/axios';

const REQUEST_ID_PROP = '__translayerRequestId';

type TranslationListener = (translated: unknown) => void;

export class TransLayer {
  private readonly provider: ITransLayerConfig['provider'];
  private readonly targetLang: string;
  private readonly sourceLang: string | undefined;
  private readonly mode: NonNullable<ITransLayerConfig['mode']>;

  private readonly schemaRegistry = new SchemaRegistry();
  private readonly queue: BatchQueue;

  private readonly cacheStorage: ICacheStorage | undefined;

  private requestSeq = 0;
  private readonly listenersByRequestId = new Map<string, Set<TranslationListener>>();

  constructor(config: ITransLayerConfig) {
    this.provider = config.provider;
    this.targetLang = config.targetLang;
    this.sourceLang = config.sourceLang === 'auto' ? undefined : config.sourceLang;

    this.mode = config.mode ?? 'awaitable';

    const batching: BatchQueueConfig = {
      bufferMs: config.batching?.bufferMs ?? 75,
      dedupe: config.batching?.dedupe ?? true,
      failOpen: config.batching?.failOpen ?? true,
      maxBatchSize: config.batching?.maxBatchSize,
    };

    this.queue = new BatchQueue({
      provider: this.provider,
      targetLang: this.targetLang,
      sourceLang: this.sourceLang,
      config: batching,
    });

    if (config.cache === true) this.cacheStorage = new MemoryCacheStorage();
    else if (typeof config.cache === 'object') this.cacheStorage = config.cache;
    else this.cacheStorage = undefined;
  }

  registerSchema(urlPattern: string, schema: TranslationSchema) {
    this.schemaRegistry.register(urlPattern, schema);
  }

  /**
   * Translate an already-parsed JSON value based on the schema registered for `url`.
   *
   * - In `awaitable` mode, this resolves after injection is complete.
   * - In `reactive` mode, this resolves quickly with the original JSON object, while
   *   background translation injects strings in-place and emits completion events.
   */
  async translateJson(url: string, data: unknown): Promise<unknown> {
    const schemaMatch = this.schemaRegistry.match(url);
    if (!schemaMatch) return data;

    const tokens = pluckStrings(data, schemaMatch.schema);
    if (tokens.length === 0) return data;

    const requestId = this.createRequestId();
    const mode = this.mode;

    if (mode === 'reactive') {
      this.attachRequestId(data, requestId);
      void this.translateAndInject({ url, data, tokens, requestId }).catch(() => {
        // failOpen is handled by the queue; swallow anything else to avoid unhandled rejections.
      });
      return this.createReactiveProxy(data, requestId);
    }

    await this.translateAndInject({ url, data, tokens, requestId });
    return data;
  }

  subscribe(requestId: string, cb: TranslationListener): () => void {
    const set = this.listenersByRequestId.get(requestId) ?? new Set<TranslationListener>();
    set.add(cb);
    this.listenersByRequestId.set(requestId, set);
    return () => {
      const current = this.listenersByRequestId.get(requestId);
      current?.delete(cb);
      if (current && current.size === 0) this.listenersByRequestId.delete(requestId);
    };
  }

  /**
   * Wrap a custom fetch implementation so `response.json()` is translated automatically.
   */
  wrapFetch(nativeFetch: typeof fetch): typeof fetch {
    return wrapFetch(this as any, nativeFetch as any) as any;
  }

  /**
   * Convenience helper that uses global `fetch` and translates only `response.json()`.
   */
  fetch(url: string, init?: RequestInit) {
    return fetchWithTranslator(this as any, url, init);
  }

  /**
   * Wrap an axios instance so `response.data` is translated automatically.
   *
   * Note: `@translayer/core` does not depend on axios; the instance only needs
   * to expose the standard `interceptors.response.use()` API.
   */
  wrapAxios(axiosInstance: any) {
    return wrapAxios(this as any, axiosInstance);
  }

  /**
   * Helper for reactive mode: read the request id attached to the returned JSON object.
   */
  getRequestId(result: unknown): string | undefined {
    if (!result || (typeof result !== 'object' && typeof result !== 'function')) return undefined;
    return (result as any)[REQUEST_ID_PROP];
  }

  private emitTranslated(requestId: string, translated: unknown) {
    const set = this.listenersByRequestId.get(requestId);
    if (!set) return;
    for (const cb of set) cb(translated);
  }

  private createRequestId(): string {
    this.requestSeq += 1;
    return `t${this.requestSeq}`;
  }

  private attachRequestId(data: unknown, requestId: string) {
    if (!data || (typeof data !== 'object' && typeof data !== 'function')) return;
    try {
      Object.defineProperty(data, REQUEST_ID_PROP, {
        value: requestId,
        enumerable: false,
        writable: false,
      });
    } catch {
      // ignore
    }
  }

  private createReactiveProxy<T>(data: T, requestId: string): T {
    if (!data || (typeof data !== 'object' && typeof data !== 'function')) return data;
    // Proxy mainly provides stable access to `requestId` and future extensibility hooks.
    return new Proxy(data as any, {
      get: (target, prop, receiver) => {
        if (prop === REQUEST_ID_PROP) return requestId;
        return Reflect.get(target, prop, receiver);
      },
    }) as T;
  }

  private makeCacheKey(text: string): string {
    const source = this.sourceLang ?? 'auto';
    return `${this.provider.id}:${source}:${this.targetLang}:${text}`;
  }

  private async translateAndInject(opts: {
    url: string;
    data: unknown;
    tokens: PluckToken[];
    requestId: string;
  }): Promise<void> {
    const { data, tokens, requestId } = opts;

    const cache = this.cacheStorage;
    const cacheKeyByToken = new Map<PluckToken, string>();
    const uniqueCacheKeys = new Set<string>();

    for (const t of tokens) {
      const cacheKey = this.makeCacheKey(t.text);
      cacheKeyByToken.set(t, cacheKey);
      uniqueCacheKeys.add(cacheKey);
      // Keep token.cacheKey in sync for any later debug/introspection.
      t.cacheKey = cacheKey;
    }

    const cached = new Map<string, string>();
    if (cache) {
      const keys = Array.from(uniqueCacheKeys);
      const values = await cache.getMany(keys);
      for (let i = 0; i < keys.length; i++) {
        const v = values[i];
        if (typeof v === 'string') cached.set(keys[i]!, v);
      }
    }

    // Resolve translations by source `text` so identical strings get applied to every occurrence.
    const translationByText = new Map<string, string>();
    const uncachedTextsSet = new Set<string>();

    for (const t of tokens) {
      const cacheKey = cacheKeyByToken.get(t)!;
      const cachedValue = cached.get(cacheKey);
      if (typeof cachedValue === 'string') translationByText.set(t.text, cachedValue);
      else uncachedTextsSet.add(t.text);
    }

    const uncachedTexts = Array.from(uncachedTextsSet);
    if (uncachedTexts.length > 0) {
      const uncachedTranslations = await this.queue.translateTexts(uncachedTexts);

      // Write back to cache for future calls.
      if (cache) {
        const entries = uncachedTexts.map((text, i) => ({
          key: this.makeCacheKey(text),
          value: uncachedTranslations[i] ?? text,
        }));
        await cache.setMany(entries);
      }

      for (let i = 0; i < uncachedTexts.length; i++) {
        translationByText.set(uncachedTexts[i]!, uncachedTranslations[i] ?? uncachedTexts[i]!);
      }
    }

    const targets: InjectTarget[] = tokens.map((t) => ({
      path: t.path,
      value: translationByText.get(t.text) ?? t.text,
    }));

    injectStrings(data, targets);

    // Reactive consumers need an explicit signal once injection is done.
    if (this.mode === 'reactive') this.emitTranslated(requestId, data);
  }
}

