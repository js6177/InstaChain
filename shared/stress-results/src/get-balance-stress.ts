import { StressApiErrorCounts } from "./api-errors";
import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";

/** Default matrix used when env overrides are not set. */
export const DEFAULT_GET_BALANCE_CALL_COUNTS = [1000, 2000] as const;
export const DEFAULT_GET_BALANCE_ADDRESS_COUNTS = [10, 100] as const;
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

export function computeSuccessRatePct(
	accepted: number,
	attempted: number,
): number {
	if (attempted <= 0) {
		return 0;
	}
	return Number(((accepted / attempted) * 100).toFixed(2));
}
