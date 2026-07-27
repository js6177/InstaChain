import { treaty } from "@elysiajs/eden";
import { REQUEST_ID_HEADER } from "@openl2/openl2-logger/constants";
import {
	ErrorCodes,
	type ErrorResponse,
	type Layer2OAuthApp,
} from "@openl2/layer2oauthmanager/http-server-models";

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

export function createLayer2OAuthClient(baseUrl: string) {
	return treaty<Layer2OAuthApp>(normalizeBaseUrl(baseUrl), {
		headers: requestIdHeaders,
	});
}

export type Layer2OAuthClient = ReturnType<typeof createLayer2OAuthClient>;

type TreatyResult<T> = {
	data: T | null;
	error: { value?: T } | unknown | null;
	status?: number;
};

function readErrorValue<T>(error: TreatyResult<T>["error"]): T | null {
	if (error && typeof error === "object" && "value" in error) {
		return (error as { value?: T }).value ?? null;
	}
	return null;
}

/**
 * Unwrap an Eden treaty OAuth response.
 * OAuth routes return typed bodies on both success and error statuses, and encode
 * business outcomes in `error_response`.
 */
export function unwrapLayer2OAuthResponse<T>(result: TreatyResult<T>): T {
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
