import type { ITransLayerConfig } from '../types';
import type { TransLayer } from '../translayer/TransLayer';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlFromInput(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  // Request
  return input.url;
}

export function wrapFetch(translator: Pick<TransLayer, 'translateJson'>, nativeFetch: FetchLike): FetchLike {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlFromInput(input);
    const response = await nativeFetch(input, init);

    // Override only Response.json(), leaving streaming/body access unchanged.
    const originalJson = response.json.bind(response);
    (response as any).json = async () => {
      const data = await originalJson();
      return translator.translateJson(url, data);
    };

    return response;
  };
}

/**
 * Convenience helper: translate against global `fetch`.
 */
export function fetchWithTranslator(translator: Pick<TransLayer, 'translateJson'>, url: string, init?: RequestInit) {
  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch !== 'function') {
    throw new Error('TransLayer: global fetch is not available in this environment.');
  }
  const wrapped = wrapFetch(translator, nativeFetch as any);
  return wrapped(url, init);
}

