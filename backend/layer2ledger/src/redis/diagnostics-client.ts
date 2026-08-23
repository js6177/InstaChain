import type { Layer2LedgerCommonConfig } from "@openl2/config-loader";
import Redis from "ioredis";

/**
 * Client for profiler sessions and related diagnostic keys.
 * Uses `redis_diagnostics` when configured (test/dev); otherwise falls back to
 * `redis_transactions` so prod keeps working without a separate instance.
 */
export function createRedisDiagnosticsClient(
	commonConfig: Layer2LedgerCommonConfig,
	redisTransactionFallback: Redis,
): { redisDiagnostics: Redis; ownsConnection: boolean } {
	const settings = commonConfig.redis_diagnostics;
	if (settings === null) {
		return {
			redisDiagnostics: redisTransactionFallback,
			ownsConnection: false,
		};
	}
	return {
		redisDiagnostics: new Redis({
			host: settings.host,
			port: settings.port,
			maxRetriesPerRequest: null,
		}),
		ownsConnection: true,
	};
}
