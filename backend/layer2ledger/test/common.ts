import { Layer2Address } from "@openl2/pubkey-utils";

export {
	computeLatencyStats,
	emptyApiErrorCounts,
	emptyApiErrors,
	buildGetBalanceStressMatrix,
	computeSuccessRatePct,
	DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	DEFAULT_GET_BALANCE_CACHE_PCTS,
	DEFAULT_GET_BALANCE_CALL_COUNTS,
	DEFAULT_GET_BALANCE_NONZERO_PCTS,
	GetBalanceStressBatchResult,
	GetBalanceStressResult,
	GetBalanceStressVariables,
	HealthStressResult,
	STRESS_SUCCESS_RATE_WARNING_PCT,
	LatencyStatsMs,
	recordApiError,
	StressApiErrorCounts,
	StressApiErrors,
	StressCacheStats,
	StressPhaseTimingsMs,
	StressProfilerSessionSummary,
	StressRunResult,
	StressThroughputResult,
	VerifyTimingResult,
} from "@openl2/stress-results";

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

/**
 * Keep up to `maxInFlight` calls running, starting another as soon as any
 * finishes. Unlike a fixed worker pool that only starts `concurrency` tasks
 * up front, the initial pump fills every free slot before yielding, and each
 * completion immediately refills — so the client stays saturated.
 */
export async function greedyPool<T>(
	items: readonly T[],
	maxInFlight: number,
	fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
	if (items.length === 0) {
		return;
	}
	const limit = Math.max(1, Math.min(maxInFlight, items.length));
	let nextIndex = 0;
	let active = 0;
	let settled = 0;

	await new Promise<void>((resolve, reject) => {
		let failed = false;

		const pump = (): void => {
			while (active < limit && nextIndex < items.length && !failed) {
				const index = nextIndex;
				nextIndex += 1;
				active += 1;
				fn(items[index] as T, index).then(
					() => {
						active -= 1;
						settled += 1;
						if (settled === items.length) {
							resolve();
							return;
						}
						pump();
					},
					(error) => {
						if (!failed) {
							failed = true;
							reject(error);
						}
					},
				);
			}
		};

		pump();
	});
}
