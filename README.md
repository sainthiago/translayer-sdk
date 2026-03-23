# TransLayer (TypeScript Localization SDK)

TransLayer intercepts JSON API responses, plucks fields selected by a schema (dot-notation + glob patterns), batches strings to your translation provider (to reduce API costs), and injects translated values back into the original JSON.

## Packages

- `@translayer/core`: framework-agnostic engine + fetch/axios wrappers
- `@translayer/providers-openai`: OpenAI translation provider
- `@translayer/providers-deepl`: DeepL translation provider
- `@translayer/cache`: cache storage adapters (`Memory`, `localStorage`, `IndexedDB`)

## Schema glob semantics

- `*` matches exactly one path segment.
- `**` (globstar) matches zero or more path segments (recursive).
- Dot-notation paths address object keys and array indices as encountered during traversal.

## Quickstart (awaitable mode)

```ts
import { TransLayer } from '@translayer/core';
import { OpenAIProvider } from '@translayer/providers';

const translator = new TransLayer({
  provider: new OpenAIProvider({ apiKey: '...' }),
  targetLang: 'es',
  cache: true,
  mode: 'awaitable',
  batching: { bufferMs: 75, dedupe: true, failOpen: true },
});

translator.registerSchema('https://api.example.com/products', {
  translate: [
    'products.*.name',
    'products.*.description',
    'metadata.category',
  ],
});

const response = await translator.fetch('https://api.example.com/products');
const data = await response.json();

console.log(data.products[0].name);
```

## Reactive mode (stale-while-revalidate style)

In `reactive` mode, `response.json()` resolves immediately and TransLayer injects translated strings later in-place.

```ts
const translator = new TransLayer({ provider, targetLang: 'es', cache: true, mode: 'reactive' });
translator.registerSchema('https://api.example.com/products', { translate: ['products.*.name'] });

const response = await translator.fetch('https://api.example.com/products');
const data = await response.json();

const requestId = translator.getRequestId(data);
const unsubscribe = translator.subscribe(requestId!, () => {
  // trigger your UI re-render (e.g., setState) when translations land
});
```

## Interceptors

- `translator.fetch(...)`: wraps `Response.json()` only (does not interfere with streaming/body handling).
- `translator.wrapAxios(axiosInstance)`: intercepts `response.data` for object/array payloads.

