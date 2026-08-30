export interface ProfilerTimeseriesPoint {
	t_ms: number;
	value: number;
}

export interface ProfilerPushTransactionSectionAvgView {
	validate: ProfilerTimeseriesPoint[];
	verify_signature: ProfilerTimeseriesPoint[];
	acquire_lock: ProfilerTimeseriesPoint[];
	duplicate_check: ProfilerTimeseriesPoint[];
	get_balance: ProfilerTimeseriesPoint[];
	enqueue: ProfilerTimeseriesPoint[];
}

export interface GetBalanceProfilerTimeseriesView {
	avg_latency_ms: ProfilerTimeseriesPoint[];
	throughput_per_sec: ProfilerTimeseriesPoint[];
}

/** Per-statement metrics on a batch-write profiler point (excludes batch_height). */
export interface BatchWriteMetrics {
	transactions_insert_ms: number;
	withdrawals_insert_ms: number;
	address_balances_upsert_ms: number;
	transactions_insert_rows: number;
	withdrawals_insert_rows: number;
	address_balances_upsert_rows: number;
}

export type BatchWriteMetricField = keyof BatchWriteMetrics;

export interface ProfilerDbwriterBatchWriteDurationPoint extends BatchWriteMetrics {
	batch_height: number;
}

export interface ProfilerSessionTimeseriesView {
	avg_replica_concurrent: ProfilerTimeseriesPoint[];
	push_transaction_entries_cumulative: ProfilerTimeseriesPoint[];
	push_transaction_exits_cumulative: ProfilerTimeseriesPoint[];
	dbwriter_writes_cumulative: ProfilerTimeseriesPoint[];
	dbwriter_queue_depth: ProfilerTimeseriesPoint[];
	dbwriter_write_active: ProfilerTimeseriesPoint[];
	dbwriter_sleep_active: ProfilerTimeseriesPoint[];
	dbwriter_redis_active: ProfilerTimeseriesPoint[];
	push_transaction_section_avg_ms?: ProfilerPushTransactionSectionAvgView;
	get_balance?: GetBalanceProfilerTimeseriesView;
	dbwriter_batch_write_duration_ms?: ProfilerDbwriterBatchWriteDurationPoint[];
}

const EMPTY_SECTION_AVG: ProfilerPushTransactionSectionAvgView = {
	validate: [{ t_ms: 0, value: 0 }],
	verify_signature: [{ t_ms: 0, value: 0 }],
	acquire_lock: [{ t_ms: 0, value: 0 }],
	duplicate_check: [{ t_ms: 0, value: 0 }],
	get_balance: [{ t_ms: 0, value: 0 }],
	enqueue: [{ t_ms: 0, value: 0 }],
};

export function getPushTransactionSectionAvg(
	timeseries: ProfilerSessionTimeseriesView,
): ProfilerPushTransactionSectionAvgView {
	return timeseries.push_transaction_section_avg_ms ?? EMPTY_SECTION_AVG;
}

export function collectProfilerXValues(
	timeseries: ProfilerSessionTimeseriesView,
	throughputStartMs: number | null,
	throughputEndMs: number | null,
): number[] {
	const xs = new Set<number>([0]);
	const add = (points: ReadonlyArray<ProfilerTimeseriesPoint>): void => {
		for (const point of points) {
			xs.add(point.t_ms);
		}
	};
	add(timeseries.avg_replica_concurrent);
	add(timeseries.push_transaction_entries_cumulative);
	add(timeseries.push_transaction_exits_cumulative);
	add(timeseries.dbwriter_writes_cumulative);
	add(timeseries.dbwriter_queue_depth);
	add(timeseries.dbwriter_write_active);
	add(timeseries.dbwriter_sleep_active);
	add(timeseries.dbwriter_redis_active);
	const sectionAvg = getPushTransactionSectionAvg(timeseries);
	add(sectionAvg.validate);
	add(sectionAvg.verify_signature);
	add(sectionAvg.acquire_lock);
	add(sectionAvg.duplicate_check);
	add(sectionAvg.get_balance);
	add(sectionAvg.enqueue);
	if (timeseries.get_balance) {
		add(timeseries.get_balance.avg_latency_ms);
		add(timeseries.get_balance.throughput_per_sec);
	}
	if (throughputStartMs !== null) {
		xs.add(throughputStartMs);
	}
	if (throughputEndMs !== null) {
		xs.add(throughputEndMs);
	}
	return [...xs].sort((a, b) => a - b);
}

/** Parse getBalance stress knobs / batch metadata from session description. */
export function parseGetBalanceStressVariables(
	description: string,
): {
	callCount: string | null;
	addressCount: string | null;
	cachePct: string | null;
	nonzeroPct: string | null;
	addressMode: string | null;
	backgroundSeedCount: string | null;
	successRatePct: string | null;
	batchId: string | null;
	batchSessionIds: string[];
} {
	const values = new Map<string, string>();
	for (const line of description.split("\n")) {
		const separator = line.indexOf("=");
		if (separator <= 0) {
			continue;
		}
		values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
	}
	const batchSessionsRaw = values.get("get_balance_batch_sessions") ?? "";
	const batchSessionIds = batchSessionsRaw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	return {
		callCount: values.get("get_balance_call_count") ?? null,
		addressCount: values.get("get_balance_address_count") ?? null,
		cachePct: values.get("get_balance_cache_pct") ?? null,
		nonzeroPct: values.get("get_balance_nonzero_pct") ?? null,
		addressMode: values.get("get_balance_address_mode") ?? null,
		backgroundSeedCount:
			values.get("get_balance_background_seed_count") ?? null,
		successRatePct: values.get("success_rate_pct") ?? null,
		batchId: values.get("get_balance_batch_id") ?? null,
		batchSessionIds,
	};
}

export function recalculateTotalTxsPerSec(
	writesTotal: number,
	startMs: number | null,
	endMs: number | null,
): number | null {
	if (startMs === null || endMs === null || endMs <= startMs) {
		return null;
	}
	return Number(((writesTotal / (endMs - startMs)) * 1000).toFixed(2));
}

export function nearestX(x: number, candidates: readonly number[]): number {
	if (candidates.length === 0) {
		return Math.max(0, Math.round(x));
	}
	let best = candidates[0] ?? Math.round(x);
	let bestDist = Math.abs(best - x);
	for (const candidate of candidates) {
		const dist = Math.abs(candidate - x);
		if (dist < bestDist) {
			best = candidate;
			bestDist = dist;
		}
	}
	return best;
}

export function clampBound(args: {
	rawMs: number;
	isStart: boolean;
	otherBoundMs: number | null;
	dataMaxMs: number;
	snapXs: readonly number[];
}): number {
	let next = nearestX(args.rawMs, args.snapXs);
	next = Math.max(0, Math.min(next, args.dataMaxMs));
	if (args.isStart && args.otherBoundMs !== null) {
		next = Math.min(next, Math.max(0, args.otherBoundMs - 1));
	}
	if (!args.isStart && args.otherBoundMs !== null) {
		next = Math.max(next, Math.min(args.dataMaxMs, args.otherBoundMs + 1));
	}
	return next;
}

export function clampViewRange(args: {
	start: number;
	end: number;
	dataMaxMs: number;
	previousStartMs: number;
}): { startMs: number; endMs: number } {
	const max = Math.max(args.dataMaxMs, 1);
	const minWindowMs = Math.max(1, Math.round(max * 0.01));
	let nextStart = Math.max(0, Math.min(args.start, max));
	let nextEnd = Math.max(0, Math.min(args.end, max));
	if (nextEnd - nextStart < minWindowMs) {
		if (args.start !== args.previousStartMs) {
			nextStart = Math.max(0, nextEnd - minWindowMs);
		} else {
			nextEnd = Math.min(max, nextStart + minWindowMs);
		}
	}
	return {
		startMs: Math.round(nextStart),
		endMs: Math.round(nextEnd),
	};
}

/** Minimal docker-stats fields needed to aggregate host totals over a stress wave. */
export interface DockerStatsTotalSample {
	capturedAtUnixMs: number;
	cpuPercent: number;
	memoryUsageBytes: number;
}

export interface DockerStatsTotals {
	/** Max over ticks of (sum of all container CPU % at that tick). */
	peakTotalCpuPercent: number;
	/** Mean over ticks of (sum of all container CPU % at that tick). */
	avgTotalCpuPercent: number;
	/** Max over ticks of (sum of all container memory bytes at that tick). */
	peakTotalMemoryBytes: number;
	/** Mean over ticks of (sum of all container memory bytes at that tick). */
	avgTotalMemoryBytes: number;
	tickCount: number;
}

/**
 * Sum CPU % and memory across every sampled container at each capture time,
 * then report peak and average of those per-tick totals.
 */
export function computeDockerStatsTotals(
	samples: readonly DockerStatsTotalSample[],
): DockerStatsTotals | null {
	if (samples.length === 0) {
		return null;
	}
	const byTime = new Map<number, { cpuPercent: number; memoryBytes: number }>();
	for (const sample of samples) {
		const prev = byTime.get(sample.capturedAtUnixMs) ?? {
			cpuPercent: 0,
			memoryBytes: 0,
		};
		prev.cpuPercent += sample.cpuPercent;
		prev.memoryBytes += sample.memoryUsageBytes;
		byTime.set(sample.capturedAtUnixMs, prev);
	}
	let peakTotalCpuPercent = 0;
	let peakTotalMemoryBytes = 0;
	let sumCpu = 0;
	let sumMem = 0;
	for (const tick of byTime.values()) {
		peakTotalCpuPercent = Math.max(peakTotalCpuPercent, tick.cpuPercent);
		peakTotalMemoryBytes = Math.max(peakTotalMemoryBytes, tick.memoryBytes);
		sumCpu += tick.cpuPercent;
		sumMem += tick.memoryBytes;
	}
	const tickCount = byTime.size;
	return {
		peakTotalCpuPercent,
		avgTotalCpuPercent: sumCpu / tickCount,
		peakTotalMemoryBytes,
		avgTotalMemoryBytes: sumMem / tickCount,
		tickCount,
	};
}
