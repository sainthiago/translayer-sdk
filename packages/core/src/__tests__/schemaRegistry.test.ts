import { describe, expect, it } from 'vitest';
import { SchemaRegistry } from '../schema/SchemaRegistry';

describe('SchemaRegistry', () => {
  it('ignores query params and prefers the most specific matching schema', () => {
    const registry = new SchemaRegistry();

    registry.register('https://api.example.com/products', { translate: ['A'] });
    registry.register('https://api.example.com/products/*', { translate: ['B'] });

    const match = registry.match('https://api.example.com/products/123?x=1#frag');
    expect(match?.schema.translate).toEqual(['B']);
  });

  it('prefers the longest prefix among non-wildcard patterns', () => {
    const registry = new SchemaRegistry();

    registry.register('https://api.example.com/products', { translate: ['A'] });
    registry.register('https://api.example.com/products/special', { translate: ['B'] });

    const match = registry.match('https://api.example.com/products/special/42');
    expect(match?.schema.translate).toEqual(['B']);
  });
});

