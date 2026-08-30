import { treaty } from "@elysiajs/eden";
import {
	ErrorCodes,
	type ErrorResponse,
	type Layer2OAuthApp,
} from "@openl2/layer2oauthmanager/http-server-models";
import { REQUEST_ID_HEADER } from "@openl2/openl2-logger/constants";

export type { Layer2OAuthApp };
export { ErrorCodes };

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function requestIdHeaders(): Record<string, string> {
	return {
		[REQUEST_ID_HEADER]: crypto.randomUUID(),
	};
}

// Treaty's return type is too large/fragile to write explicitly; Layer2OAuthClient
// is derived from this helper via ReturnType.
// biome-ignore lint/nursery/useExplicitReturnType: inferred from treaty<Layer2OAuthApp>
function buildLayer2OAuthClient(baseUrl: string) {
	return treaty<Layer2OAuthApp>(normalizeBaseUrl(baseUrl), {
		headers: requestIdHeaders,
	});
}

export type Layer2OAuthClient = ReturnType<typeof buildLayer2OAuthClient>;

export function createLayer2OAuthClient(baseUrl: string): Layer2OAuthClient {
	return buildLayer2OAuthClient(baseUrl);
}

/** Eden treaty result shape (data is often `unknown` when elysia copies diverge). */
export type TreatyResult = {
	data: unknown;
	error: unknown;
	status?: number;
};

function readErrorValue(error: unknown): unknown {
	if (error && typeof error === "object" && "value" in error) {
		return (error as { value?: unknown }).value ?? null;
	}
	return null;
}

/**
 * Unwrap an Eden treaty OAuth response.
 * OAuth routes return typed bodies on both success and error statuses, and encode
 * business outcomes in `error_response`.
 */
export function unwrapLayer2OAuthResponse<T>(result: TreatyResult): T {
	const response = (result.data ?? readErrorValue(result.error)) as
		| (T & { error_response?: ErrorResponse })
		| null
		| undefined;

	if (response == null) {
		const detail =
			result.error instanceof Error
				? result.error.message
				: typeof result.error === "string"
					? result.error
					: JSON.stringify(result.error);
		throw new Error(
			`Layer2 OAuth request failed${result.status != null ? ` (status ${result.status})` : ""}: ${detail}`,
		);
	}

	if (
		response.error_response &&
		response.error_response.error_code !== ErrorCodes.Success
	) {
		throw new Error(response.error_response.error_message);
	}

	return response;
}
