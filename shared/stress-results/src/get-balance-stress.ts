import { StressApiErrorCounts } from "./api-errors";
import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";

/** Default matrix used when env overrides are not set. */
export const DEFAULT_GET_BALANCE_CALL_COUNTS = [1000, 2000] as const;
export const DEFAULT_GET_BALANCE_ADDRESS_COUNTS = [1, 10, 100] as const;
export const DEFAULT_GET_BALANCE_CACHE_PCTS = [10, 50, 100] as const;
export const DEFAULT_GET_BALANCE_NONZERO_PCTS = [50, 25] as const;

/** Tunable inputs for a getBalance HTTP stress run. */
export class GetBalanceStressVariables {
	readonly callCount: number;
	readonly addressCount: number;
	readonly cachePct: number;
	readonly nonzeroPct: number;

	constructor(init: GetBalanceStressVariables) {
		this.callCount = init.callCount;
		this.addressCount = init.addressCount;
		this.cachePct = init.cachePct;
		this.nonzeroPct = init.nonzeroPct;
	}

	static parse(
		data: GetBalanceStressVariables | null,
	): GetBalanceStressVariables | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressVariables;
		return new GetBalanceStressVariables({
			callCount: typed.callCount,
			addressCount: typed.addressCount,
			cachePct: typed.cachePct,
			nonzeroPct: typed.nonzeroPct,
		});
	}

	/** key=value lines for profiler session description / Explorer table. */
	toDescriptionLines(): string[] {
		return [
			`get_balance_call_count=${this.callCount}`,
			`get_balance_address_count=${this.addressCount}`,
			`get_balance_cache_pct=${this.cachePct}`,
			`get_balance_nonzero_pct=${this.nonzeroPct}`,
		];
	}
}

/** Optional on-disk getBalance HTTP stress result for one matrix cell. */
export class GetBalanceStressResult {
	readonly variables: GetBalanceStressVariables;
	readonly concurrency: number;
	readonly accepted: number;
	/** Percentage of attempted calls that returned SUCCESS (0–100). */
	readonly successRatePct: number;
	readonly elapsedMs: number;
	readonly requestsPerSecond: number;
	readonly clientRttMs: LatencyStatsMs;
	readonly apiErrors: StressApiErrorCounts;
	readonly profilerSessionId: string;
	readonly profilerOutputFile: string;

	constructor(init: GetBalanceStressResult) {
		this.variables = init.variables;
		this.concurrency = init.concurrency;
		this.accepted = init.accepted;
		this.successRatePct = init.successRatePct;
		this.elapsedMs = init.elapsedMs;
		this.requestsPerSecond = init.requestsPerSecond;
		this.clientRttMs = init.clientRttMs;
		this.apiErrors = init.apiErrors;
		this.profilerSessionId = init.profilerSessionId;
		this.profilerOutputFile = init.profilerOutputFile;
	}

	static parse(
		data: GetBalanceStressResult | null,
	): GetBalanceStressResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressResult;
		const variables = GetBalanceStressVariables.parse(typed.variables ?? null);
		const clientRttMs = LatencyStatsMs.parse(typed.clientRttMs ?? null);
		const apiErrors = StressApiErrorCounts.parse(typed.apiErrors ?? null);
		if (!variables || !clientRttMs || !apiErrors) {
			return null;
		}
		const successRatePct =
			typeof typed.successRatePct === "number"
				? typed.successRatePct
				: variables.callCount > 0
					? Number(
							((typed.accepted / variables.callCount) * 100).toFixed(2),
						)
					: 0;
		return new GetBalanceStressResult({
			variables,
			concurrency: typed.concurrency,
			accepted: typed.accepted,
			successRatePct,
			elapsedMs: typed.elapsedMs,
			requestsPerSecond: typed.requestsPerSecond,
			clientRttMs,
			apiErrors,
			profilerSessionId: typed.profilerSessionId,
			profilerOutputFile: typed.profilerOutputFile,
		});
	}

	static fromJsonText(text: string): GetBalanceStressResult | null {
		return GetBalanceStressResult.parse(parseJsonAs<GetBalanceStressResult>(text));
	}
}

/** Full getBalance stress matrix output. */
export class GetBalanceStressBatchResult {
	readonly batchId: string;
	readonly runs: GetBalanceStressResult[];

	constructor(init: GetBalanceStressBatchResult) {
		this.batchId = init.batchId;
		this.runs = init.runs;
	}

	static parse(
		data: GetBalanceStressBatchResult | null,
	): GetBalanceStressBatchResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressBatchResult;
		if (typeof typed.batchId !== "string" || !Array.isArray(typed.runs)) {
			return null;
		}
		const runs: GetBalanceStressResult[] = [];
		for (const run of typed.runs) {
			const parsed = GetBalanceStressResult.parse(run ?? null);
			if (!parsed) {
				return null;
			}
			runs.push(parsed);
		}
		return new GetBalanceStressBatchResult({
			batchId: typed.batchId,
			runs,
		});
	}

	static fromJsonText(text: string): GetBalanceStressBatchResult | null {
		return GetBalanceStressBatchResult.parse(
			parseJsonAs<GetBalanceStressBatchResult>(text),
		);
	}

	sessionIds(): string[] {
		return this.runs.map((run) => run.profilerSessionId);
	}
}

/** Cartesian product of the four getBalance stress dimensions. */
export function buildGetBalanceStressMatrix(options: {
	callCounts: readonly number[];
	addressCounts: readonly number[];
	cachePcts: readonly number[];
	nonzeroPcts: readonly number[];
}): GetBalanceStressVariables[] {
	const matrix: GetBalanceStressVariables[] = [];
	for (const callCount of options.callCounts) {
		for (const addressCount of options.addressCounts) {
			for (const cachePct of options.cachePcts) {
				for (const nonzeroPct of options.nonzeroPcts) {
					matrix.push(
						new GetBalanceStressVariables({
							callCount,
							addressCount,
							cachePct,
							nonzeroPct,
						}),
					);
				}
			}
		}
	}
	return matrix;
}

/** Success-rate warning threshold for stress runs (percent). */
export const STRESS_SUCCESS_RATE_WARNING_PCT = 95;

/** Max getBalance batches retained in the on-disk history file. */
export const GET_BALANCE_STRESS_HISTORY_LIMIT = 50;

export function computeSuccessRatePct(
	accepted: number,
	attempted: number,
): number {
	if (attempted <= 0) {
		return 0;
	}
	return Number(((accepted / attempted) * 100).toFixed(2));
}

/** One completed getBalance stress matrix, for history display. */
export class GetBalanceStressHistoryEntry {
	readonly completedAtUnixMs: number;
	readonly batchId: string;
	readonly concurrency: number;
	readonly runCount: number;
	readonly minSuccessRatePct: number;
	readonly avgRequestsPerSecond: number;
	readonly profilerSessionId: string;
	readonly visualizationUrl: string;
	readonly batch: GetBalanceStressBatchResult;

	constructor(init: GetBalanceStressHistoryEntry) {
		this.completedAtUnixMs = init.completedAtUnixMs;
		this.batchId = init.batchId;
		this.concurrency = init.concurrency;
		this.runCount = init.runCount;
		this.minSuccessRatePct = init.minSuccessRatePct;
		this.avgRequestsPerSecond = init.avgRequestsPerSecond;
		this.profilerSessionId = init.profilerSessionId;
		this.visualizationUrl = init.visualizationUrl;
		this.batch = init.batch;
	}

	static fromBatch(options: {
		batch: GetBalanceStressBatchResult;
		completedAtUnixMs: number;
		visualizationUrl: string;
	}): GetBalanceStressHistoryEntry {
		const { batch, completedAtUnixMs, visualizationUrl } = options;
		const successRates = batch.runs.map((run) => run.successRatePct);
		const rpsValues = batch.runs.map((run) => run.requestsPerSecond);
		const concurrency = batch.runs[0]?.concurrency ?? 0;
		const minSuccessRatePct =
			successRates.length > 0 ? Math.min(...successRates) : 0;
		const avgRequestsPerSecond =
			rpsValues.length > 0
				? Number(
						(
							rpsValues.reduce((sum, value) => sum + value, 0) /
							rpsValues.length
						).toFixed(2),
					)
				: 0;
		const profilerSessionId = batch.sessionIds()[0] ?? batch.batchId;
		return new GetBalanceStressHistoryEntry({
			completedAtUnixMs,
			batchId: batch.batchId,
			concurrency,
			runCount: batch.runs.length,
			minSuccessRatePct,
			avgRequestsPerSecond,
			profilerSessionId,
			visualizationUrl,
			batch,
		});
	}

	/** Compact payload for Redis / Explorer API (no nested batch). */
	toSummary(): GetBalanceStressHistorySummary {
		return new GetBalanceStressHistorySummary({
			completedAtUnixMs: this.completedAtUnixMs,
			batchId: this.batchId,
			concurrency: this.concurrency,
			runCount: this.runCount,
			minSuccessRatePct: this.minSuccessRatePct,
			avgRequestsPerSecond: this.avgRequestsPerSecond,
			profilerSessionId: this.profilerSessionId,
		});
	}

	static parse(
		data: GetBalanceStressHistoryEntry | null,
	): GetBalanceStressHistoryEntry | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressHistoryEntry;
		const batch = GetBalanceStressBatchResult.parse(typed.batch ?? null);
		if (
			!batch ||
			typeof typed.completedAtUnixMs !== "number" ||
			typeof typed.batchId !== "string" ||
			typeof typed.visualizationUrl !== "string"
		) {
			return null;
		}
		const profilerSessionId =
			typeof typed.profilerSessionId === "string" &&
			typed.profilerSessionId.length > 0
				? typed.profilerSessionId
				: (batch.sessionIds()[0] ?? typed.batchId);
		return new GetBalanceStressHistoryEntry({
			completedAtUnixMs: typed.completedAtUnixMs,
			batchId: typed.batchId,
			concurrency: typed.concurrency,
			runCount: typed.runCount,
			minSuccessRatePct: typed.minSuccessRatePct,
			avgRequestsPerSecond: typed.avgRequestsPerSecond,
			profilerSessionId,
			visualizationUrl: typed.visualizationUrl,
			batch,
		});
	}
}

/** Compact getBalance stress history row for Redis and Explorer. */
export class GetBalanceStressHistorySummary {
	readonly completedAtUnixMs: number;
	readonly batchId: string;
	readonly concurrency: number;
	readonly runCount: number;
	readonly minSuccessRatePct: number;
	readonly avgRequestsPerSecond: number;
	readonly profilerSessionId: string;

	constructor(init: GetBalanceStressHistorySummary) {
		this.completedAtUnixMs = init.completedAtUnixMs;
		this.batchId = init.batchId;
		this.concurrency = init.concurrency;
		this.runCount = init.runCount;
		this.minSuccessRatePct = init.minSuccessRatePct;
		this.avgRequestsPerSecond = init.avgRequestsPerSecond;
		this.profilerSessionId = init.profilerSessionId;
	}

	static parse(
		data: GetBalanceStressHistorySummary | null,
	): GetBalanceStressHistorySummary | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressHistorySummary;
		if (
			typeof typed.completedAtUnixMs !== "number" ||
			typeof typed.batchId !== "string" ||
			typeof typed.profilerSessionId !== "string"
		) {
			return null;
		}
		return new GetBalanceStressHistorySummary({
			completedAtUnixMs: typed.completedAtUnixMs,
			batchId: typed.batchId,
			concurrency: typed.concurrency,
			runCount: typed.runCount,
			minSuccessRatePct: typed.minSuccessRatePct,
			avgRequestsPerSecond: typed.avgRequestsPerSecond,
			profilerSessionId: typed.profilerSessionId,
		});
	}
}

/** Newest-first history of getBalance stress batches. */
export class GetBalanceStressHistory {
	readonly entries: GetBalanceStressHistoryEntry[];

	constructor(init: GetBalanceStressHistory) {
		this.entries = init.entries;
	}

	static parse(
		data: GetBalanceStressHistory | null,
	): GetBalanceStressHistory | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as GetBalanceStressHistory;
		if (!Array.isArray(typed.entries)) {
			return null;
		}
		const entries: GetBalanceStressHistoryEntry[] = [];
		for (const entry of typed.entries) {
			const parsed = GetBalanceStressHistoryEntry.parse(entry ?? null);
			if (!parsed) {
				return null;
			}
			entries.push(parsed);
		}
		return new GetBalanceStressHistory({ entries });
	}

	static fromJsonText(text: string): GetBalanceStressHistory | null {
		return GetBalanceStressHistory.parse(
			parseJsonAs<GetBalanceStressHistory>(text),
		);
	}

	static empty(): GetBalanceStressHistory {
		return new GetBalanceStressHistory({ entries: [] });
	}

	/** Prepend a new entry and drop anything past the retention limit. */
	withEntry(
		entry: GetBalanceStressHistoryEntry,
		limit: number = GET_BALANCE_STRESS_HISTORY_LIMIT,
	): GetBalanceStressHistory {
		const withoutDuplicate = this.entries.filter(
			(existing) => existing.batchId !== entry.batchId,
		);
		return new GetBalanceStressHistory({
			entries: [entry, ...withoutDuplicate].slice(0, Math.max(limit, 1)),
		});
	}
}

/** Derive the history path from the primary result JSON path. */
export function getBalanceStressHistoryPath(resultFile: string): string {
	return resultFile.replace(/(\.json)?$/i, ".history.json");
}

