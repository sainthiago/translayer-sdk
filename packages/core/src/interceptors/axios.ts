import type { TransLayer } from '../translayer/TransLayer';

type AxiosLike = {
  interceptors: {
    response: {
      use: (onFulfilled: (value: any) => any, onRejected: (err: any) => any) => number;
    };
  };
};

function buildAxiosUrl(config: any): string | undefined {
  const url = config?.url;
  if (!url) return undefined;
  const baseURL = config?.baseURL;
  if (!baseURL) return String(url);
  try {
    // Works for absolute baseURL + relative url.
    return new URL(String(url), String(baseURL)).toString();
  } catch {
    // Fallback string join.
    const trimmedBase = String(baseURL).replace(/\/+$/, '');
    const trimmedUrl = String(url).replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedUrl}`;
  }
}

export function wrapAxios(translator: Pick<TransLayer, 'translateJson'>, axiosInstance: AxiosLike): AxiosLike {
  axiosInstance.interceptors.response.use(
    async (response: any) => {
      const data = response?.data;
      if (!data || typeof data !== 'object') return response;

      const url = buildAxiosUrl(response?.config) ?? '';
      if (!url) return response;

      response.data = await translator.translateJson(url, data);
      return response;
    },
    (err: any) => Promise.reject(err),
  );

  return axiosInstance;
}

