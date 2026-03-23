import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeepLProvider } from './index';

describe('DeepLProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (_url: string, _init: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          translations: [{ text: 'hola' }, { text: 'mundo' }],
        }),
      } as any;
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('translates a batch and preserves order', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const provider = new DeepLProvider({ apiKey: 'k', baseUrl: 'https://example.com/v2' });

    const out = await provider.translateBatch({
      providerId: 'deepl',
      targetLang: 'es',
      sourceLang: 'en',
      texts: ['hello', 'world'],
    });

    expect(out.translations).toEqual(['hola', 'mundo']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = (fetchMock as any).mock.calls[0] as [string, any];
    expect(url).toBe('https://example.com/v2/translate');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const body = init.body as string;
    expect(body).toContain('auth_key=k');
    expect(body).toContain('target_lang=es');
    expect(body).toContain('source_lang=en');
    expect(body).toContain('text=hello');
    expect(body).toContain('text=world');
  });
});

