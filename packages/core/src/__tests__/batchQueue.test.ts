import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchQueue } from '../queue/BatchQueue';

describe('BatchQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches multiple translateTexts calls into a single provider call within buffer window', async () => {
    vi.useFakeTimers();

    const provider = {
      id: 'p',
      translateBatch: vi.fn(async ({ texts }: any) => ({
        translations: texts.map((t: string) => t.toUpperCase()),
      })),
    };

    const queue = new BatchQueue({
      provider,
      targetLang: 'es',
      sourceLang: 'en',
      config: { bufferMs: 50, dedupe: true, failOpen: true },
    });

    const p1 = queue.translateTexts(['a']);
    vi.advanceTimersByTime(10);
    const p2 = queue.translateTexts(['b']);
    vi.advanceTimersByTime(60);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(['A']);
    expect(r2).toEqual(['B']);

    expect(provider.translateBatch).toHaveBeenCalledTimes(1);
    const callArg = (provider.translateBatch as any).mock.calls[0][0];
    expect(callArg.texts).toEqual(['a', 'b']);
  });

  it('dedupes identical strings within the buffer window', async () => {
    vi.useFakeTimers();

    const provider = {
      id: 'p',
      translateBatch: vi.fn(async ({ texts }: any) => ({
        translations: texts.map((t: string) => `T:${t}`),
      })),
    };

    const queue = new BatchQueue({
      provider,
      targetLang: 'es',
      sourceLang: undefined,
      config: { bufferMs: 50, dedupe: true, failOpen: true },
    });

    const p = queue.translateTexts(['x', 'y', 'x']);
    vi.advanceTimersByTime(60);

    await expect(p).resolves.toEqual(['T:x', 'T:y', 'T:x']);
    expect(provider.translateBatch).toHaveBeenCalledTimes(1);
    const callArg = (provider.translateBatch as any).mock.calls[0][0];
    expect(callArg.texts).toEqual(['x', 'y']);
  });

  it('rejects pending translations when failOpen=false and provider throws', async () => {
    vi.useFakeTimers();

    const provider = {
      id: 'p',
      translateBatch: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const queue = new BatchQueue({
      provider,
      targetLang: 'es',
      sourceLang: undefined,
      config: { bufferMs: 50, dedupe: true, failOpen: false },
    });

    const p = queue.translateTexts(['x']);
    vi.advanceTimersByTime(60);

    await expect(p).rejects.toThrow('boom');
  });
});

