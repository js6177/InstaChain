import { Layer2Address } from "@openl2/pubkey-utils";

export interface LatencyStatsMs {
	average: number;
	shortest: number;
	longest: number;
	bottomQuartile: number;
	upperQuartile: number;
}

export interface StressPhaseTimingsMs {
	/** Address generation + transfer message build (excludes signing). */
	prepareMs: number;
	/** Wall-clock to sign all transfer messages. */
	signMs: number;
	seedMs: number;
	/** Wall-clock for the concurrent push wave only. */
	pushMs: number;
	settleMs: number;
	totalMs: number;
}

/** Counts of API failures keyed by a stable reason string. */
export interface StressApiErrorCounts {
	total: number;
	byReason: Record<string, number>;
}

export interface StressApiErrors {
	push: StressApiErrorCounts;
	settle: StressApiErrorCounts;
	seed: StressApiErrorCounts;
}

export interface StressCacheStats {
	hits: number;
	misses: number;
}

export interface StressRunResult {
	processedToPostgres: number;
	/** Successful push_transaction responses. */
	acceptedPushes: number;
	/**
	 * Client-side round-trip time for each push_transaction HTTP call.
	 * Includes Docker network, HTTP/Elysia overhead, and any time the request
	 * waits to be scheduled on the server — not the same as handler-only
	 * performance timings in apihandler logs.
	 */
	pushClientRttMs: LatencyStatsMs;
	phaseTimingsMs: StressPhaseTimingsMs;
	apiErrors: StressApiErrors;
	cache: StressCacheStats;
}

export interface StressRoundThroughputResult {
	round: 1 | 2;
	transactionCount: number;
	processedToPostgres: number;
	acceptedPushes: number;
	/** Wall-clock for the concurrent push wave only (excludes prepare/seed/settle). */
	elapsedMs: number;
	/** accepted_pushes / push_wave_seconds */
	txsPerSecond: number;
	/** @see StressRunResult.pushClientRttMs */
	pushClientRttMs: LatencyStatsMs;
	phaseTimingsMs: StressPhaseTimingsMs;
	apiErrors: StressApiErrors;
	cache: StressCacheStats;
	/** Round 2: how many source addresses were reused from round 1. */
	reusedSourceCount: number;
}

export interface StressThroughputResult {
	transactionCount: number;
	addressOverlapPercent: number;
	rounds: [StressRoundThroughputResult, StressRoundThroughputResult];
}

export function emptyApiErrorCounts(): StressApiErrorCounts {
	return { total: 0, byReason: {} };
}

export function emptyApiErrors(): StressApiErrors {
	return {
		push: emptyApiErrorCounts(),
		settle: emptyApiErrorCounts(),
		seed: emptyApiErrorCounts(),
	};
}

export function recordApiError(
	bucket: StressApiErrorCounts,
	reason: string,
): void {
	bucket.total += 1;
	bucket.byReason[reason] = (bucket.byReason[reason] ?? 0) + 1;
}

export function newLayer2Address(): Layer2Address {
	const address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	address.generateNewAddress();
	return address;
}

export async function sleep(ms: number): Promise<void> {
	await Bun.sleep(ms);
}

/** Run async work over items with a fixed concurrency limit. */
export async function mapPool<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) {
				return;
			}
			results[index] = await fn(items[index] as T, index);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

function roundMs(value: number): number {
	return Number(value.toFixed(2));
}

function percentile(sortedAscending: readonly number[], p: number): number {
	if (sortedAscending.length === 0) {
		return 0;
	}
	if (sortedAscending.length === 1) {
		return sortedAscending[0] ?? 0;
	}
	const index = (sortedAscending.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const lowerValue = sortedAscending[lower] ?? 0;
	const upperValue = sortedAscending[upper] ?? lowerValue;
	if (lower === upper) {
		return lowerValue;
	}
	const weight = index - lower;
	return lowerValue * (1 - weight) + upperValue * weight;
}

export function computeLatencyStats(
	latenciesMs: readonly number[],
): LatencyStatsMs {
	if (latenciesMs.length === 0) {
		return {
			average: 0,
			shortest: 0,
			longest: 0,
			bottomQuartile: 0,
			upperQuartile: 0,
		};
	}

	const sorted = [...latenciesMs].sort((a, b) => a - b);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		average: roundMs(sum / sorted.length),
		shortest: roundMs(sorted[0] ?? 0),
		longest: roundMs(sorted[sorted.length - 1] ?? 0),
		bottomQuartile: roundMs(percentile(sorted, 0.25)),
		upperQuartile: roundMs(percentile(sorted, 0.75)),
	};
}
