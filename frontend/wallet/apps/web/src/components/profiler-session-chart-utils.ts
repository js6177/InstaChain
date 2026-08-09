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
	if (throughputStartMs !== null) {
		xs.add(throughputStartMs);
	}
	if (throughputEndMs !== null) {
		xs.add(throughputEndMs);
	}
	return [...xs].sort((a, b) => a - b);
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
