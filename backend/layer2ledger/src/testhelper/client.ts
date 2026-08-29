import { treaty } from "@elysiajs/eden";
import { REQUEST_ID_HEADER } from "@openl2/openl2-logger/constants";
import type { Layer2TestHelperApp } from "./app";

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function createLayer2TestHelperClient(baseUrl: string) {
	return treaty<Layer2TestHelperApp>(normalizeBaseUrl(baseUrl), {
		headers: () => ({
			[REQUEST_ID_HEADER]: crypto.randomUUID(),
		}),
	});
}

export type Layer2TestHelperClient = ReturnType<
	typeof createLayer2TestHelperClient
>;

type TreatyResult = {
	data: unknown;
	error: unknown;
	status: number;
};

/** Unwrap a successful Eden treaty response body, or throw on transport/parse failure. */
export function unwrapLayer2TestHelperResponse<T>(result: TreatyResult): T {
	if (result.data !== null && result.data !== undefined) {
		return result.data as T;
	}

	const detail =
		result.error instanceof Error
			? result.error.message
			: typeof result.error === "string"
				? result.error
				: JSON.stringify(result.error);

	throw new Error(
		`Layer2 testhelper request failed (status ${result.status}): ${detail}`,
	);
}
