import { treaty } from '@elysiajs/eden';
import type { Layer2TestHelperApp } from './app';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createLayer2TestHelperClient(baseUrl: string) {
  return treaty<Layer2TestHelperApp>(normalizeBaseUrl(baseUrl));
}

export type Layer2TestHelperClient = ReturnType<typeof createLayer2TestHelperClient>;

type TreatyResult<T> = {
  data: T | null;
  error: unknown;
  status: number;
};

/** Unwrap a successful Eden treaty response body, or throw on transport/parse failure. */
export function unwrapLayer2TestHelperResponse<T>(result: TreatyResult<T>): T {
  if (result.data !== null) {
    return result.data;
  }

  const detail =
    result.error instanceof Error
      ? result.error.message
      : typeof result.error === 'string'
        ? result.error
        : JSON.stringify(result.error);

  throw new Error(`Layer2 testhelper request failed (status ${result.status}): ${detail}`);
}
