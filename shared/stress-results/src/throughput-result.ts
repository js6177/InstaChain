import { StressApiErrors } from "./api-errors";
import { StressCacheStats } from "./cache-stats";
import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";
import { StressPhaseTimingsMs } from "./phase-timings";
import { StressProfilerSessionSummary } from "./profiler-session-summary";
import { RedisStressDiagnostics } from "./redis-diagnostics";

/** In-memory result of one stress push wave (not the on-disk throughput file). */
export class StressRunResult {
	readonly processedToPostgres: number;
	/** Successful push_transaction responses. */
	readonly acceptedPushes: number;
	/**
	 * Client-side round-trip time for each push_transaction HTTP call.
	 * Includes Docker network, HTTP/Elysia overhead, and any time the request
	 * waits to be scheduled on the server — not the same as handler-only
	 * performance timings in apihandler logs.
	 */
	readonly pushClientRttMs: LatencyStatsMs;
	readonly phaseTimingsMs: StressPhaseTimingsMs;
	readonly apiErrors: StressApiErrors;
	readonly cache: StressCacheStats;
	/** Aggregated from the server-side profiler session (not client timers). */
	readonly profilerSession: StressProfilerSessionSummary;

	constructor(init: StressRunResult) {
		this.processedToPostgres = init.processedToPostgres;
		this.acceptedPushes = init.acceptedPushes;
		this.pushClientRttMs = init.pushClientRttMs;
		this.phaseTimingsMs = init.phaseTimingsMs;
		this.apiErrors = init.apiErrors;
		this.cache = init.cache;
		this.profilerSession = init.profilerSession;
	}
}

/**
 * On-disk stress throughput file written by finalize
 * (`STRESS_RESULT_FILE` / `test-layer2ledger-stress.throughput.json`).
 */
export class StressThroughputResult {
	readonly transactionCount: number;
	readonly processedToPostgres: number;
	readonly acceptedPushes: number;
	/** Wall-clock for the concurrent push wave only (excludes prepare/seed/settle). */
	readonly elapsedMs: number;
	/**
	 * Throughput until every pushTransaction HTTP call has returned
	 * (from server profiler session spans).
	 */
	readonly pushTxsPerSecond: number;
	/**
	 * Throughput until dbwriter drained the pending queue
	 * (from server profiler session dbwriter stats).
	 */
	readonly settledTxsPerSecond: number;
	/** Server profiler session id used for this run. */
	readonly profilerSessionId: string;
	/**
	 * @deprecated Prefer {@link pushTxsPerSecond}; kept equal to push rate for
	 * older consumers.
	 */
	readonly txsPerSecond: number;
	/** @see StressRunResult.pushClientRttMs */
	readonly pushClientRttMs: LatencyStatsMs;
	readonly phaseTimingsMs: StressPhaseTimingsMs;
	readonly apiErrors: StressApiErrors;
	readonly cache: StressCacheStats;
	/**
	 * Redis diagnostics for this wave (baseline / 1Hz during / after).
	 * Null when diagnostics were skipped or unavailable.
	 */
	readonly redis: RedisStressDiagnostics | null;

	constructor(init: StressThroughputResult) {
		this.transactionCount = init.transactionCount;
		this.processedToPostgres = init.processedToPostgres;
		this.acceptedPushes = init.acceptedPushes;
		this.elapsedMs = init.elapsedMs;
		this.pushTxsPerSecond = init.pushTxsPerSecond;
		this.settledTxsPerSecond = init.settledTxsPerSecond;
		this.profilerSessionId = init.profilerSessionId;
		this.txsPerSecond = init.txsPerSecond;
		this.pushClientRttMs = init.pushClientRttMs;
		this.phaseTimingsMs = init.phaseTimingsMs;
		this.apiErrors = init.apiErrors;
		this.cache = init.cache;
		this.redis = init.redis;
	}

	static parse(
		data: StressThroughputResult | null,
	): StressThroughputResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as StressThroughputResult;
		const parsedRtt = LatencyStatsMs.parse(typed.pushClientRttMs ?? null);
		const parsedPhases = StressPhaseTimingsMs.parse(
			typed.phaseTimingsMs ?? null,
		);
		const parsedErrors = StressApiErrors.parse(typed.apiErrors ?? null);
		const parsedCache = StressCacheStats.parse(typed.cache ?? null);
		if (!parsedRtt || !parsedPhases || !parsedErrors || !parsedCache) {
			return null;
		}
		const redis =
			typed.redis === null || typed.redis === undefined
				? null
				: RedisStressDiagnostics.parse(typed.redis);
		return new StressThroughputResult({
			transactionCount: typed.transactionCount,
			processedToPostgres: typed.processedToPostgres,
			acceptedPushes: typed.acceptedPushes,
			elapsedMs: typed.elapsedMs,
			pushTxsPerSecond: typed.pushTxsPerSecond,
			settledTxsPerSecond: typed.settledTxsPerSecond,
			profilerSessionId: typed.profilerSessionId,
			txsPerSecond: typed.txsPerSecond,
			pushClientRttMs: parsedRtt,
			phaseTimingsMs: parsedPhases,
			apiErrors: parsedErrors,
			cache: parsedCache,
			redis,
		});
	}

	static fromJsonText(text: string): StressThroughputResult | null {
		return StressThroughputResult.parse(
			parseJsonAs<StressThroughputResult>(text),
		);
	}
}
