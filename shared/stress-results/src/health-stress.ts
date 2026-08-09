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

	static parse(data: HealthStressResult | null): HealthStressResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as HealthStressResult;
		const parsedRtt = LatencyStatsMs.parse(typed.clientRttMs ?? null);
		const parsedErrors = StressApiErrorCounts.parse(typed.apiErrors ?? null);
		if (!parsedRtt || !parsedErrors) {
			return null;
		}
		return new HealthStressResult({
			path: typed.path,
			requestCount: typed.requestCount,
			concurrency: typed.concurrency,
			accepted: typed.accepted,
			elapsedMs: typed.elapsedMs,
			requestsPerSecond: typed.requestsPerSecond,
			clientRttMs: parsedRtt,
			apiErrors: parsedErrors,
		});
	}

	static fromJsonText(text: string): HealthStressResult | null {
		return HealthStressResult.parse(parseJsonAs<HealthStressResult>(text));
	}
}
