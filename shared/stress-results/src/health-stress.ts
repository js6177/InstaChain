import { StressApiErrorCounts } from "./api-errors";
import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";

/** Optional on-disk health HTTP stress result. */
export class HealthStressResult {
	readonly path: string;
	readonly requestCount: number;
	readonly concurrency: number;
	readonly accepted: number;
	readonly elapsedMs: number;
	readonly requestsPerSecond: number;
	readonly clientRttMs: LatencyStatsMs;
	readonly apiErrors: StressApiErrorCounts;

	constructor(init: HealthStressResult) {
		this.path = init.path;
		this.requestCount = init.requestCount;
		this.concurrency = init.concurrency;
		this.accepted = init.accepted;
		this.elapsedMs = init.elapsedMs;
		this.requestsPerSecond = init.requestsPerSecond;
		this.clientRttMs = init.clientRttMs;
		this.apiErrors = init.apiErrors;
	}

	static parse(
		data: HealthStressResult | null | undefined,
	): HealthStressResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const {
			path,
			requestCount,
			concurrency,
			accepted,
			elapsedMs,
			requestsPerSecond,
			clientRttMs,
			apiErrors,
		} = data;
		if (
			typeof path !== "string" ||
			typeof requestCount !== "number" ||
			typeof concurrency !== "number" ||
			typeof accepted !== "number" ||
			typeof elapsedMs !== "number" ||
			typeof requestsPerSecond !== "number"
		) {
			return null;
		}
		const parsedRtt = LatencyStatsMs.parse(clientRttMs);
		const parsedErrors = StressApiErrorCounts.parse(apiErrors);
		if (!parsedRtt || !parsedErrors) {
			return null;
		}
		return new HealthStressResult({
			path,
			requestCount,
			concurrency,
			accepted,
			elapsedMs,
			requestsPerSecond,
			clientRttMs: parsedRtt,
			apiErrors: parsedErrors,
		});
	}

	static fromJsonText(text: string): HealthStressResult | null {
		return HealthStressResult.parse(parseJsonAs<HealthStressResult>(text));
	}
}
