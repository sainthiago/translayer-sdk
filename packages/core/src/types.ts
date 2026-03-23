export type TranslationMode = 'awaitable' | 'reactive';

export type SourceLang = string | 'auto';

export type TranslationSchema = {
  /**
   * Dot-notation globs describing JSON paths whose string values should be translated.
   *
   * Examples:
   * - `products.*.description` (arrays)
   * - `metadata.category` (nested objects)
   * - `items.**.title` (globstar recursion)
   */
  translate: string[];
};

export interface TranslateBatchInput {
  providerId: string;
  targetLang: string;
  sourceLang?: string;
  texts: string[];
  contexts?: string[];
}

export interface TranslateBatchOutput {
  /**
   * Must align 1:1 with `TranslateBatchInput.texts` order.
   */
  translations: string[];
}

export interface ITranslationProvider {
  /**
   * Used to namespace batching/queue and caching.
   */
  id: string;
  translateBatch(input: TranslateBatchInput): Promise<TranslateBatchOutput>;
}

export interface BaseProvider extends ITranslationProvider {}

export interface ICacheStorage {
  getMany(keys: string[]): Promise<Array<string | undefined>>;
  setMany(entries: Array<{ key: string; value: string }>): Promise<void>;
}

export type BatchingConfig = {
  bufferMs: number; // 50-100ms
  dedupe: boolean;
  failOpen: boolean;
  maxBatchSize?: number;
};

export interface ITransLayerConfig {
  provider: ITranslationProvider;
  targetLang: string;
  sourceLang?: SourceLang;
  /**
   * When `true`, uses the default in-memory cache.
   * When `false`/undefined, caching is disabled.
   */
  cache?: boolean | ICacheStorage;
  batching?: Partial<BatchingConfig>;
  mode?: TranslationMode;
}

// -----------------------
// Internal types (plucker / injector / queue)
// -----------------------

export type PathSegment =
  | { kind: 'key'; value: string }
  | { kind: 'index'; value: number };

export type Path = PathSegment[];

export type SchemaPath = string; // original dot-notation glob

export type PluckToken = {
  path: Path;
  text: string;
  schemaPath: SchemaPath;
  cacheKey: string;
};

export type InjectTarget = {
  path: Path;
  value: string;
};

export type TranslationTask = {
  url: string;
  schemaPath: string;
  tokens: PluckToken[];
};

