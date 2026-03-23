import { describe, expect, it, vi } from 'vitest';
import { TransLayer } from '../translayer/TransLayer';

describe('Interceptors', () => {
  it('wrapFetch translates response.json() output for matched endpoints', async () => {
    const provider = {
      id: 'fake',
      translateBatch: vi.fn(async ({ texts, targetLang }: any) => ({
        translations: texts.map((t: string) => `${t}-${targetLang}`),
      })),
    };

    const translator = new TransLayer({
      provider,
      targetLang: 'es',
      cache: false,
      mode: 'awaitable',
      batching: { bufferMs: 1, dedupe: true, failOpen: true },
    });

    translator.registerSchema('https://api.example.com/products', {
      translate: ['products.*.name'],
    });

    const mockFetch = vi.fn(async () => {
      return {
        json: async () => ({ products: [{ name: 'Book' }] }),
      };
    });

    const wrapped = translator.wrapFetch(mockFetch as any);
    const res = await wrapped('https://api.example.com/products');
    const data = await res.json();

    expect(data.products[0].name).toBe('Book-es');
  });

  it('wrapAxios translates response.data for matched endpoints', async () => {
    const provider = {
      id: 'fake',
      translateBatch: vi.fn(async ({ texts, targetLang }: any) => ({
        translations: texts.map((t: string) => `${t}-${targetLang}`),
      })),
    };

    const translator = new TransLayer({
      provider,
      targetLang: 'es',
      cache: false,
      mode: 'awaitable',
      batching: { bufferMs: 1, dedupe: true, failOpen: true },
    });

    translator.registerSchema('https://api.example.com/products', {
      translate: ['products.*.name'],
    });

    let onFulfilled: ((value: any) => any) | undefined;
    const axiosInstance: any = {
      interceptors: {
        response: {
          use: (fn: any) => {
            onFulfilled = fn;
            return 0;
          },
        },
      },
    };

    translator.wrapAxios(axiosInstance);

    const response: any = {
      data: { products: [{ name: 'Book' }] },
      config: { url: 'https://api.example.com/products' },
    };

    await onFulfilled?.(response);
    expect(response.data.products[0].name).toBe('Book-es');
  });
});

