/**
 * Bun/Node preload entry for OpenTelemetry.
 *
 * Load before application code:
 *   bun run --preload @openl2/openl2-logger/instrumentation src/main.ts
 *
 * Starts NodeSDK (OTLP log export via env) when an endpoint is configured.
 * Pino → OTLP bridging is done in the logger via `@opentelemetry/api-logs`
 * (Bun cannot apply `@opentelemetry/instrumentation-pino` module hooks).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";

const endpoint =
	process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?.trim() ||
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();

const disabled =
	process.env.OTEL_SDK_DISABLED === "true" ||
	process.env.OTEL_SDK_DISABLED === "1";

if (endpoint && !disabled) {
	const sdk = new NodeSDK();
	sdk.start();

	const shutdown = (): void => {
		void sdk.shutdown().catch(() => {
			/* ignore shutdown races on Bun exit */
		});
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}
