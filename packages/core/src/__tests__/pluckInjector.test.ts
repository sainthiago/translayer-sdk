import { describe, expect, it } from 'vitest';
import { pluckStrings } from '../transform/Plucker';
import { injectStrings } from '../transform/Injector';

describe('Plucker + Injector', () => {
  it('plucks and injects strings using dot globs with * wildcards', () => {
    const data: any = {
      products: [{ name: 'Book', description: 'Great' }],
      metadata: { category: 'Arts' },
    };

    const schema = { translate: ['products.*.name', 'products.*.description', 'metadata.category'] };
    const tokens = pluckStrings(data, schema);

    expect(tokens.map((t) => t.text)).toEqual(['Book', 'Great', 'Arts']);

    const targets = tokens.map((t) => ({
      path: t.path,
      value: `T:${t.text}`,
    }));

    injectStrings(data, targets);

    expect(data.products[0].name).toBe('T:Book');
    expect(data.products[0].description).toBe('T:Great');
    expect(data.metadata.category).toBe('T:Arts');
  });

  it('supports globstar ** for recursive matches', () => {
    const data: any = {
      items: [{ variants: [{ title: 'A' }, { title: 'B' }] }],
    };

    const schema = { translate: ['items.**.title'] };
    const tokens = pluckStrings(data, schema);

    expect(tokens.map((t) => t.text).sort()).toEqual(['A', 'B']);

    const targets = tokens.map((t) => ({ path: t.path, value: `X:${t.text}` }));
    injectStrings(data, targets);

    expect(data.items[0].variants[0].title).toBe('X:A');
    expect(data.items[0].variants[1].title).toBe('X:B');
  });
});

