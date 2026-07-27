import { Elysia, t } from "elysia";
import { REQUEST_ID_HEADER } from "./constants";
import { createRequestId } from "./ids";
import {
	createOpenL2Logger,
	type CreateOpenL2LoggerOptions,
	type OpenL2Logger,
} from "./logger";

/** TypeBox schema for the shared request-id header on all routes. */
export const RequestIdHeaders = t.Object({
	[REQUEST_ID_HEADER]: t.Optional(t.String({ minLength: 1 })),
});

export type RequestIdHeaders = typeof RequestIdHeaders.static;

export interface OpenL2LoggingPluginOptions extends CreateOpenL2LoggerOptions {
	/** Reuse an existing logger instead of creating one. */
	logger?: OpenL2Logger;
}

function resolveIncomingRequestId(request: Request): string {
	const headerId = request.headers.get(REQUEST_ID_HEADER)?.trim();
	return headerId && headerId.length > 0 ? headerId : createRequestId();
}

/**
 * Elysia plugin that:
 * - Declares `x-request-id` on all route headers
 * - Resolves/generates a request id for the request lifetime
 * - Echoes `x-request-id` on the response
 * - Decorates each request with `requestId` and a request-scoped `log`
 *
 * Use `log` from the route context so entries include `request_id`.
 * (`AsyncLocalStorage.enterWith` is avoided — it segfaults under Bun + Elysia.)
 */
export function openl2Logging(options: OpenL2LoggingPluginOptions) {
	const logger = options.logger ?? createOpenL2Logger(options);

	return new Elysia({ name: "openl2-logging" })
		.decorate("openl2Logger", logger)
		.guard({
			as: "global",
			headers: RequestIdHeaders,
		})
		.derive({ as: "global" }, ({ request, set }) => {
			const requestId = resolveIncomingRequestId(request);
			set.headers[REQUEST_ID_HEADER] = requestId;

			return {
				requestId,
				log: logger.child({ request_id: requestId }),
			};
		});
}

export type OpenL2LoggingPlugin = ReturnType<typeof openl2Logging>;
