import { StressApiErrors } from "./api-errors";
import { StressCacheStats } from "./cache-stats";
import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";
import { StressPhaseTimingsMs } from "./phase-timings";
import { StressProfilerSessionSummary } from "./profiler-session-summary";

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

/** One round in the on-disk two-round stress throughput file. */
export class StressRoundThroughputResult {
	readonly round: 1 | 2;
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
	/** Server profiler session id used for this round. */
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
	/** Round 2: how many source addresses were reused from round 1. */
	readonly reusedSourceCount: number;

	constructor(init: StressRoundThroughputResult) {
		this.round = init.round;
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
		this.reusedSourceCount = init.reusedSourceCount;
	}

	static parse(
		data: StressRoundThroughputResult | null | undefined,
	): StressRoundThroughputResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const {
			round,
			transactionCount,
			processedToPostgres,
			acceptedPushes,
			elapsedMs,
			pushTxsPerSecond,
			settledTxsPerSecond,
			profilerSessionId,
			txsPerSecond,
			pushClientRttMs,
			phaseTimingsMs,
			apiErrors,
			cache,
			reusedSourceCount,
		} = data;
		if (
			(round !== 1 && round !== 2) ||
			typeof transactionCount !== "number" ||
			typeof processedToPostgres !== "number" ||
			typeof acceptedPushes !== "number" ||
			typeof elapsedMs !== "number" ||
			typeof pushTxsPerSecond !== "number" ||
			typeof settledTxsPerSecond !== "number" ||
			typeof profilerSessionId !== "string" ||
			typeof txsPerSecond !== "number" ||
			typeof reusedSourceCount !== "number"
		) {
			return null;
		}
		const parsedRtt = LatencyStatsMs.parse(pushClientRttMs);
		const parsedPhases = StressPhaseTimingsMs.parse(phaseTimingsMs);
		const parsedErrors = StressApiErrors.parse(apiErrors);
		const parsedCache = StressCacheStats.parse(cache);
		if (!parsedRtt || !parsedPhases || !parsedErrors || !parsedCache) {
			return null;
		}
		return new StressRoundThroughputResult({
			round,
			transactionCount,
			processedToPostgres,
			acceptedPushes,
			elapsedMs,
			pushTxsPerSecond,
			settledTxsPerSecond,
			profilerSessionId,
			txsPerSecond,
			pushClientRttMs: parsedRtt,
			phaseTimingsMs: parsedPhases,
			apiErrors: parsedErrors,
			cache: parsedCache,
			reusedSourceCount,
		});
	}
}

/**
 * On-disk stress throughput file written by `stress.test.ts`
 * (`STRESS_RESULT_FILE` / `test-layer2ledger-stress.throughput.json`).
 */
export class StressThroughputResult {
	readonly transactionCount: number;
	readonly addressOverlapPercent: number;
	readonly rounds: readonly [
		StressRoundThroughputResult,
		StressRoundThroughputResult,
	];

	constructor(init: {
		transactionCount: number;
		addressOverlapPercent: number;
		rounds: readonly [
			StressRoundThroughputResult,
			StressRoundThroughputResult,
		];
	}) {
		this.transactionCount = init.transactionCount;
		this.addressOverlapPercent = init.addressOverlapPercent;
		this.rounds = init.rounds;
	}

	static parse(
		data: StressThroughputResult | null | undefined,
	): StressThroughputResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const { transactionCount, addressOverlapPercent, rounds } = data;
		if (
			typeof transactionCount !== "number" ||
			typeof addressOverlapPercent !== "number" ||
			!Array.isArray(rounds) ||
			rounds.length < 2
		) {
			return null;
		}
		const round1 = StressRoundThroughputResult.parse(rounds[0]);
		const round2 = StressRoundThroughputResult.parse(rounds[1]);
		if (!round1 || !round2) {
			return null;
		}
		return new StressThroughputResult({
			transactionCount,
			addressOverlapPercent,
			rounds: [round1, round2],
		});
	}

	static fromJsonText(text: string): StressThroughputResult | null {
		return StressThroughputResult.parse(parseJsonAs<StressThroughputResult>(text));
	}
}
