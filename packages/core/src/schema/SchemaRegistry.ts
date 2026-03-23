import type { TranslationSchema } from '../types';

export type CompiledSchemaMatch = {
  pattern: string;
  schema: TranslationSchema;
  score: number;
};

type CompiledPattern =
  | { kind: 'prefix'; pattern: string; score: number }
  | { kind: 'glob'; pattern: string; score: number; segments: string[] };

function normalizeUrl(url: string): string {
  // Strip query + fragment for consistent schema matching.
  const beforeHash = url.split('#')[0] ?? '';
  return beforeHash.split('?')[0] ?? '';
}

function matchGlobSegments(patternSegments: string[], urlSegments: string[]): boolean {
  const memo = new Map<string, boolean>();

  const key = (pi: number, ui: number) => `${pi}:${ui}`;

  const rec = (pi: number, ui: number): boolean => {
    const k = key(pi, ui);
    const cached = memo.get(k);
    if (cached !== undefined) return cached;

    if (pi === patternSegments.length) {
      const ok = ui === urlSegments.length;
      memo.set(k, ok);
      return ok;
    }

    const seg = patternSegments[pi];

    if (seg === '**') {
      // Zero segments.
      if (rec(pi + 1, ui)) {
        memo.set(k, true);
        return true;
      }
      // One or more segments.
      const ok = ui < urlSegments.length && rec(pi, ui + 1);
      memo.set(k, ok);
      return ok;
    }

    if (ui >= urlSegments.length) {
      memo.set(k, false);
      return false;
    }

    if (seg === '*') {
      const ok = rec(pi + 1, ui + 1);
      memo.set(k, ok);
      return ok;
    }

    const ok = seg === urlSegments[ui] && rec(pi + 1, ui + 1);
    memo.set(k, ok);
    return ok;
  };

  return rec(0, 0);
}

function specificityScore(pattern: string): number {
  // "Longest string match" approximation: prefer longer fixed portions.
  // (Wildcards reduce score; this ensures more specific patterns win when multiple match.)
  const fixed = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
  return fixed.length;
}

export class SchemaRegistry {
  private readonly entries: Array<{ pattern: string; schema: TranslationSchema; compiled: CompiledPattern }> =
    [];

  register(urlPattern: string, schema: TranslationSchema) {
    const normalized = normalizeUrl(urlPattern);
    const hasWildcard = normalized.includes('*');

    const compiled: CompiledPattern = hasWildcard
      ? { kind: 'glob', pattern: normalized, score: specificityScore(normalized), segments: normalized.split('/') }
      : { kind: 'prefix', pattern: normalized, score: normalized.length };

    this.entries.push({ pattern: normalized, schema, compiled });
  }

  /**
   * Match the most specific registered schema for a given request URL.
   * - Query params/fragment are ignored.
   * - If multiple schemas match, highest specificity score wins.
   */
  match(url: string): CompiledSchemaMatch | undefined {
    const normalizedUrl = normalizeUrl(url);
    const urlSegments = normalizedUrl.split('/');

    let best: CompiledSchemaMatch | undefined;
    for (const { pattern, schema, compiled } of this.entries) {
      const ok = compiled.kind === 'prefix' ? normalizedUrl.startsWith(compiled.pattern) : matchGlobSegments(compiled.segments, urlSegments);
      if (!ok) continue;

      const candidate: CompiledSchemaMatch = {
        pattern,
        schema,
        score: compiled.score,
      };

      if (!best || candidate.score > best.score) best = candidate;
    }

    return best;
  }
}

