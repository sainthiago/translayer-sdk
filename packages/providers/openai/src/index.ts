import type { ITranslationProvider, TranslateBatchInput, TranslateBatchOutput } from '@translayer/core';

export type OpenAIProviderOptions = {
  apiKey: string;
  /**
   * Base URL for the API. Defaults to OpenAI's standard `/v1` API root.
   */
  baseUrl?: string;
  /**
   * Chat model to use for translations.
   */
  model?: string;
};

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  // Handle fenced blocks like ```json [ ... ] ```
  const withoutFences = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(withoutFences);
}

export class OpenAIProvider implements ITranslationProvider {
  readonly id = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: OpenAIProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchOutput> {
    if (typeof (globalThis as any).fetch !== 'function') {
      throw new Error('OpenAIProvider: global fetch is not available.');
    }

    const sourceLang = input.sourceLang && input.sourceLang !== 'auto' ? input.sourceLang : undefined;
    const targetLang = input.targetLang;

    const userContent = [
      `Translate the provided texts into ${targetLang}.`,
      sourceLang ? `Source language: ${sourceLang}.` : `Source language: auto.`,
      'Return ONLY a JSON array of strings with the same length and order as the input.',
      `Input texts: ${JSON.stringify(input.texts)}`,
    ].join('\n');

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a precise translation engine.' },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => '');
      throw new Error(`OpenAIProvider: request failed (${res.status}). ${details}`.trim());
    }

    const json = (await res.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenAIProvider: unexpected response format (missing message content).');
    }

    const parsed = extractJsonArray(content);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      throw new Error('OpenAIProvider: expected a JSON array of strings.');
    }

    if (parsed.length !== input.texts.length) {
      throw new Error(
        `OpenAIProvider: translations length mismatch (expected ${input.texts.length}, got ${parsed.length}).`,
      );
    }

    return { translations: parsed as string[] };
  }
}


