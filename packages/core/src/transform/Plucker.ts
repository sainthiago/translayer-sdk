import type { PathSegment, PluckToken, TranslationSchema } from '../types';

type DotSeg =
  | { kind: 'literal'; value: string }
  | { kind: 'star' }
  | { kind: 'globstar' };

function compileDotPattern(pattern: string): DotSeg[] {
  // Dot-notation patterns like `products.*.description` or `items.**.title`
  const raw = pattern.split('.').filter((p) => p.length > 0);
  return raw.map((seg) => {
    if (seg === '*') return { kind: 'star' as const };
    if (seg === '**') return { kind: 'globstar' as const };
    return { kind: 'literal' as const, value: seg };
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clonePathAppend(path: PathSegment[], seg: PathSegment): PathSegment[] {
  // Path is typically short; cloning is cheap and keeps recursion safe.
  return [...path, seg];
}

export function pluckStrings(data: unknown, schema: TranslationSchema): PluckToken[] {
  const tokens: PluckToken[] = [];

  for (const schemaPath of schema.translate) {
    const compiled = compileDotPattern(schemaPath);

    const visit = (node: unknown, i: number, path: PathSegment[]) => {
      if (i >= compiled.length) {
        if (typeof node === 'string') {
          tokens.push({
            path,
            text: node,
            schemaPath,
            // Will be namespaced with provider + targetLang later in TransLayer.
            cacheKey: node,
          });
        }
        return;
      }

      const seg = compiled[i]!;

      if (seg.kind === 'globstar') {
        // Option 1: match zero segments.
        visit(node, i + 1, path);

        // Option 2: match one+ segments by descending and keeping globstar active.
        if (Array.isArray(node)) {
          for (let idx = 0; idx < node.length; idx++) {
            visit(node[idx], i, clonePathAppend(path, { kind: 'index', value: idx }));
          }
        } else if (isPlainObject(node)) {
          for (const key of Object.keys(node)) {
            visit(node[key], i, clonePathAppend(path, { kind: 'key', value: key }));
          }
        }
        return;
      }

      if (seg.kind === 'star') {
        // Match exactly one segment: iterate array indices or object keys.
        if (Array.isArray(node)) {
          for (let idx = 0; idx < node.length; idx++) {
            visit(node[idx], i + 1, clonePathAppend(path, { kind: 'index', value: idx }));
          }
        } else if (isPlainObject(node)) {
          for (const key of Object.keys(node)) {
            visit(node[key], i + 1, clonePathAppend(path, { kind: 'key', value: key }));
          }
        }
        return;
      }

      // literal key
      if (isPlainObject(node) && Object.prototype.hasOwnProperty.call(node, seg.value)) {
        visit((node as any)[seg.value], i + 1, clonePathAppend(path, { kind: 'key', value: seg.value }));
      }
    };

    visit(data, 0, []);
  }

  return tokens;
}

