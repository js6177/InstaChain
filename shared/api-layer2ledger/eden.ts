import { treaty } from '@elysiajs/eden';
import { ErrorCodes, type Layer2LedgerApp } from '@openl2/layer2ledger/http-server-models';

export { ErrorCodes };
export type { Layer2LedgerApp };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createLayer2LedgerClient(baseUrl: string) {
  return treaty<Layer2LedgerApp>(normalizeBaseUrl(baseUrl));
}

export type Layer2LedgerClient = ReturnType<typeof createLayer2LedgerClient>;

type TreatyResult<T> = {
  data: T | null;
  error: unknown;
  status: number;
};

/** Unwrap a successful Eden treaty response body, or throw on transport/parse failure. */
export function unwrapLayer2LedgerResponse<T>(result: TreatyResult<T>): T {
  if (result.data !== null) {
    return result.data;
  }

  const detail =
    result.error instanceof Error
      ? result.error.message
      : typeof result.error === 'string'
        ? result.error
        : JSON.stringify(result.error);

  throw new Error(`Layer2 ledger request failed (status ${result.status}): ${detail}`);
}
