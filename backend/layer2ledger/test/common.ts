import { Layer2Address } from "@openl2/pubkey-utils";

export {
	computeLatencyStats,
	emptyApiErrorCounts,
	emptyApiErrors,
	HealthStressResult,
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
