import type { ITranslationProvider } from '../types';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type BatchQueueConfig = {
  bufferMs: number; // 50-100ms
  dedupe: boolean;
  failOpen: boolean;
  maxBatchSize?: number;
};

type PendingItem = {
  key: string;
  text: string;
  deferred: Deferred<string>;
};

/**
 * Provider-call queue with a short batching buffer.
 *
 * The queue instance is expected to be scoped to a single `{providerId,targetLang,sourceLang}`
 * per `TransLayer` instance.
 */
export class BatchQueue {
  private readonly provider: ITranslationProvider;
  private readonly targetLang: string;
  private readonly sourceLang: string | undefined;
  private readonly config: BatchQueueConfig;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: PendingItem[] = [];
  private pendingByKey = new Map<string, Deferred<string>>();

  constructor(opts: {
    provider: ITranslationProvider;
    targetLang: string;
    sourceLang?: string;
    config: BatchQueueConfig;
  }) {
    this.provider = opts.provider;
    this.targetLang = opts.targetLang;
    this.sourceLang = opts.sourceLang;
    this.config = opts.config;
  }

  translateTexts(texts: string[]): Promise<string[]> {
    if (texts.length === 0) return Promise.resolve([]);

    const promises = texts.map((text) => this.enqueueOne(text));
    return Promise.all(promises);
  }

  private enqueueOne(text: string): Promise<string> {
    const normalized = text;

    if (this.config.dedupe) {
      const existing = this.pendingByKey.get(normalized);
      if (existing) return existing.promise;

      const deferred = createDeferred<string>();
      this.pendingByKey.set(normalized, deferred);
      this.pending.push({ key: normalized, text: normalized, deferred });
      this.ensureTimer();
      this.ensureMaxBatchFlush();
      return deferred.promise;
    }

    // No queue dedupe: send duplicates as occurrences.
    const key = `${normalized}@@${this.pending.length}`;
    const deferred = createDeferred<string>();
    this.pending.push({ key, text: normalized, deferred });
    this.ensureTimer();
    this.ensureMaxBatchFlush();
    return deferred.promise;
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      // Timer callback should not throw; failures resolve/reject pending items.
      void this.flush().finally(() => {
        this.timer = undefined;
      });
    }, this.config.bufferMs);
  }

  private ensureMaxBatchFlush() {
    const max = this.config.maxBatchSize;
    if (!max) return;
    if (this.pending.length >= max) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      void this.flush().finally(() => {
        // flush resets pending + pendingByKey
      });
    }
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;

    // Snapshot pending items to avoid interfering with new enqueues.
    const items = this.pending;
    const toFlush = items.length;

    this.pending = [];
    this.pendingByKey.clear();

    const texts = items.map((i) => i.text);

    try {
      const output = await this.provider.translateBatch({
        providerId: this.provider.id,
        targetLang: this.targetLang,
        sourceLang: this.sourceLang,
        texts,
      });

      if (!output.translations || output.translations.length !== toFlush) {
        throw new Error(
          `Provider returned ${output.translations?.length ?? 'unknown'} translations for ${toFlush} input texts`,
        );
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        item.deferred.resolve(output.translations[i] ?? item.text);
      }
    } catch (err) {
      if (this.config.failOpen) {
        for (const it of items) it.deferred.resolve(it.text);
        return;
      }
      for (const it of items) it.deferred.reject(err);
    }
  }
}

