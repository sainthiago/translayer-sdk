import { describe, expect, it, vi } from 'vitest';
import { TransLayer } from '../translayer/TransLayer';

describe('TransLayer caching', () => {
  it('avoids duplicate provider calls for cached strings', async () => {
    const provider = {
      id: 'fake',
      translateBatch: vi.fn(async ({ texts, targetLang }: any) => ({
        translations: texts.map((t: string) => `${t}-${targetLang}`),
      })),
    };

    const translator = new TransLayer({
      provider,
      targetLang: 'es',
      sourceLang: 'auto',
      cache: true,
      mode: 'awaitable',
      batching: { bufferMs: 1, dedupe: true, failOpen: true },
    });

    translator.registerSchema('https://api.example.com/products', {
      translate: ['products.*.name'],
    });

    const data1: any = { products: [{ name: 'Book' }] };
    await translator.translateJson('https://api.example.com/products', data1);
    expect(data1.products[0].name).toBe('Book-es');
    expect(provider.translateBatch).toHaveBeenCalledTimes(1);

    const data2: any = { products: [{ name: 'Book' }] };
    await translator.translateJson('https://api.example.com/products', data2);
    expect(data2.products[0].name).toBe('Book-es');
    expect(provider.translateBatch).toHaveBeenCalledTimes(1);
  });
});

