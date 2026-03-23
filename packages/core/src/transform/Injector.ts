import type { InjectTarget, PathSegment } from '../types';

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function setAtPath(root: unknown, path: PathSegment[], value: string): boolean {
  if (!isObjectLike(root)) return false;
  if (path.length === 0) return false;

  // Walk to parent container.
  let cur: any = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    if (seg.kind === 'key') {
      if (!cur || !Object.prototype.hasOwnProperty.call(cur, seg.value)) return false;
      cur = cur[seg.value];
    } else {
      if (!Array.isArray(cur)) return false;
      cur = cur[seg.value];
    }
  }

  const last = path[path.length - 1]!;

  if (last.kind === 'key') {
    if (!isObjectLike(cur)) return false;
    cur[last.value] = value;
    return true;
  }

  if (!Array.isArray(cur)) return false;
  cur[last.value] = value;
  return true;
}

export function injectStrings(root: unknown, targets: InjectTarget[]): unknown {
  for (const t of targets) {
    setAtPath(root, t.path, t.value);
  }
  return root;
}

