import type { ITranslationProvider, TranslateBatchInput, TranslateBatchOutput } from '@translayer/core';

export type DeepLOptions = {
  apiKey: string;
  /**
   * DeepL API base URL. Free tier default shown here; use your account tier as needed.
   */
  baseUrl?: string;
};

export class DeepLProvider implements ITranslationProvider {
  readonly id = 'deepl';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: DeepLOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api-free.deepl.com/v2').replace(/\/+$/, '');
  }

  async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchOutput> {
    if (typeof (globalThis as any).fetch !== 'function') {
      throw new Error('DeepLProvider: global fetch is not available.');
    }

    const params = new URLSearchParams();
    params.set('auth_key', this.apiKey);
    params.set('target_lang', input.targetLang);

    if (input.sourceLang && input.sourceLang !== 'auto') {
      params.set('source_lang', input.sourceLang);
    }

    // DeepL supports multiple `text` fields.
    for (const text of input.texts) params.append('text', text);

    const res = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => '');
      throw new Error(`DeepLProvider: request failed (${res.status}). ${details}`.trim());
    }

    const json = (await res.json()) as any;
    const translations = json?.translations?.map((t: any) => t?.text).filter((x: any) => typeof x === 'string');

    if (!Array.isArray(json?.translations) || !translations.every((x: any) => typeof x === 'string')) {
      throw new Error('DeepLProvider: unexpected response format.');
    }

    if (translations.length !== input.texts.length) {
      throw new Error(
        `DeepLProvider: translations length mismatch (expected ${input.texts.length}, got ${translations.length}).`,
      );
    }

    return { translations };
  }
}


