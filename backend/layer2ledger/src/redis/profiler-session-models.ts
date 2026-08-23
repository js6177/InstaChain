/**
 * Structured profiler-session models.
 *
 * Writers construct these classes; Redis/file readers call `parse` /
 * `fromJsonText` so field access stays on typed properties (not string-key maps).
 */

import { RedisStressDiagnostics } from "@openl2/stress-results";

function parseJsonAs<T>(text: string): T {
	return JSON.parse(text) as T;
}

function isStructuredObject(value: object | null): value is object {
	return value !== null && typeof value === "object";
}

/** Well-known API names that can be listed in a profiler session. */
export const ProfilerApiName = {
	PushTransaction: "pushTransaction",
	GetBalance: "getBalance",
	Dbwriter: "dbwriter",
} as const;

export type ProfilerApiName =
	(typeof ProfilerApiName)[keyof typeof ProfilerApiName];

/**
 * Redis payload written when a profiler session starts. The dbwriter watches
 * for this object (via the active-session key) and records write / queue-idle
 * events into the same session.
 */
export class StartProfilerSession {
	readonly session_id: string;
	readonly title: string;
	readonly description: string;
	readonly apis: string[];
	readonly started_at_unix_ms: number;

	constructor(init: StartProfilerSession) {
		this.session_id = init.session_id;
		this.title = init.title;
		this.description = init.description;
		this.apis = init.apis;
		this.started_at_unix_ms = init.started_at_unix_ms;
	}

	static parse(
		data: StartProfilerSession | null,
	): StartProfilerSession | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as StartProfilerSession;
		if (!Array.isArray(typed.apis)) {
			return null;
		}
		if (typeof typed.title !== "string" || typed.title.trim().length === 0) {
			return null;
		}
		if (typeof typed.description !== "string") {
			return null;
		}
		return new StartProfilerSession({
			session_id: typed.session_id,
			title: typed.title.trim(),
			description: typed.description,
			apis: typed.apis,
			started_at_unix_ms: typed.started_at_unix_ms,
		});
	}

	static fromJsonText(text: string): StartProfilerSession | null {
		try {
			return StartProfilerSession.parse(parseJsonAs<StartProfilerSession>(text));
		} catch {
			return null;
		}
	}
}

/** One timed API invocation recorded in a session. */
export class ProfilerSessionSpan {
	readonly api: string;
	readonly started_at_unix_ms: number;
	readonly ended_at_unix_ms: number;
	readonly elapsed_ms: number;
	/** Apihandler replica that handled the request (container hostname). */
	readonly replica_id: string;

	constructor(init: ProfilerSessionSpan) {
		this.api = init.api;
		this.started_at_unix_ms = init.started_at_unix_ms;
		this.ended_at_unix_ms = init.ended_at_unix_ms;
		this.elapsed_ms = init.elapsed_ms;
		this.replica_id = init.replica_id;
	}

	static parse(
		data: ProfilerSessionSpan | null,
	): ProfilerSessionSpan | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerSessionSpan;
		return new ProfilerSessionSpan({
			api: typed.api,
			started_at_unix_ms: typed.started_at_unix_ms,
			ended_at_unix_ms: typed.ended_at_unix_ms,
			elapsed_ms: typed.elapsed_ms,
			replica_id: typed.replica_id ?? "unknown",
		});
	}

	static fromJsonText(text: string): ProfilerSessionSpan | null {
		try {
			return ProfilerSessionSpan.parse(parseJsonAs<ProfilerSessionSpan>(text));
		} catch {
			return null;
		}
	}
}

/** One dbwriter batch flush recorded during a session. */
export class ProfilerDbwriterBatchEvent {
	readonly t_unix_ms: number;
	/** Rows written in this batch (not cumulative). */
	readonly writes: number;

	constructor(init: ProfilerDbwriterBatchEvent) {
		this.t_unix_ms = init.t_unix_ms;
		this.writes = init.writes;
	}

	static parse(
		data: ProfilerDbwriterBatchEvent | null,
	): ProfilerDbwriterBatchEvent | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterBatchEvent;
		return new ProfilerDbwriterBatchEvent({
			t_unix_ms: typed.t_unix_ms,
			writes: typed.writes,
		});
	}

	static fromJsonText(text: string): ProfilerDbwriterBatchEvent | null {
		try {
			return ProfilerDbwriterBatchEvent.parse(
				parseJsonAs<ProfilerDbwriterBatchEvent>(text),
			);
		} catch {
			return null;
		}
	}
}

/** Pending Redis transaction queue depth sampled once per dbwriter loop. */
export class ProfilerDbwriterQueueDepthEvent {
	readonly t_unix_ms: number;
	readonly queue_depth: number;

	constructor(init: ProfilerDbwriterQueueDepthEvent) {
		this.t_unix_ms = init.t_unix_ms;
		this.queue_depth = init.queue_depth;
	}

	static parse(
		data: ProfilerDbwriterQueueDepthEvent | null,
	): ProfilerDbwriterQueueDepthEvent | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterQueueDepthEvent;
		return new ProfilerDbwriterQueueDepthEvent({
			t_unix_ms: typed.t_unix_ms,
			queue_depth: typed.queue_depth,
		});
	}

	static fromJsonText(text: string): ProfilerDbwriterQueueDepthEvent | null {
		try {
			return ProfilerDbwriterQueueDepthEvent.parse(
				parseJsonAs<ProfilerDbwriterQueueDepthEvent>(text),
			);
		} catch {
			return null;
		}
	}
}

/**
 * Dbwriter Postgres transaction busy flag (1 = inside `db.transaction`, else 0).
 * Enter/exit pairs form a square wave on the session chart.
 */
export class ProfilerDbwriterWriteActiveEvent {
	readonly t_unix_ms: number;
	/** 1 while writing the batch transaction; 0 on exit. */
	readonly writing: 0 | 1;

	constructor(init: ProfilerDbwriterWriteActiveEvent) {
		this.t_unix_ms = init.t_unix_ms;
		this.writing = init.writing;
	}

	static parse(
		data: ProfilerDbwriterWriteActiveEvent | null,
	): ProfilerDbwriterWriteActiveEvent | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterWriteActiveEvent;
		return new ProfilerDbwriterWriteActiveEvent({
			t_unix_ms: typed.t_unix_ms,
			writing: typed.writing,
		});
	}

	static fromJsonText(text: string): ProfilerDbwriterWriteActiveEvent | null {
		try {
			return ProfilerDbwriterWriteActiveEvent.parse(
				parseJsonAs<ProfilerDbwriterWriteActiveEvent>(text),
			);
		} catch {
			return null;
		}
	}
}

/**
 * Dbwriter idle/sleep flag (1 = inside `Bun.sleep` / inactive wait, else 0).
 * Enter/exit pairs form a square wave on the session chart.
 */
export class ProfilerDbwriterSleepActiveEvent {
	readonly t_unix_ms: number;
	/** 1 while sleeping/inactive; 0 on wake. */
	readonly sleeping: 0 | 1;

	constructor(init: ProfilerDbwriterSleepActiveEvent) {
		this.t_unix_ms = init.t_unix_ms;
		this.sleeping = init.sleeping;
	}

	static parse(
		data: ProfilerDbwriterSleepActiveEvent | null,
	): ProfilerDbwriterSleepActiveEvent | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterSleepActiveEvent;
		return new ProfilerDbwriterSleepActiveEvent({
			t_unix_ms: typed.t_unix_ms,
			sleeping: typed.sleeping,
		});
	}

	static fromJsonText(text: string): ProfilerDbwriterSleepActiveEvent | null {
		try {
			return ProfilerDbwriterSleepActiveEvent.parse(
				parseJsonAs<ProfilerDbwriterSleepActiveEvent>(text),
			);
		} catch {
			return null;
		}
	}
}

/**
 * Dbwriter Redis housekeeping flag (1 while trimming queues, bloom, cache, unlocks).
 * Enter/exit pairs form a square wave on the session chart.
 */
export class ProfilerDbwriterRedisActiveEvent {
	readonly t_unix_ms: number;
	/** 1 while updating Redis post-Postgres write; 0 on exit. */
	readonly redis_active: 0 | 1;

	constructor(init: ProfilerDbwriterRedisActiveEvent) {
		this.t_unix_ms = init.t_unix_ms;
		this.redis_active = init.redis_active;
	}

	static parse(
		data: ProfilerDbwriterRedisActiveEvent | null,
	): ProfilerDbwriterRedisActiveEvent | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterRedisActiveEvent;
		return new ProfilerDbwriterRedisActiveEvent({
			t_unix_ms: typed.t_unix_ms,
			redis_active: typed.redis_active,
		});
	}

	static fromJsonText(text: string): ProfilerDbwriterRedisActiveEvent | null {
		try {
			return ProfilerDbwriterRedisActiveEvent.parse(
				parseJsonAs<ProfilerDbwriterRedisActiveEvent>(text),
			);
		} catch {
			return null;
		}
	}
}

/** Known pushTransaction section names used in section-avg samples / charts. */
export enum PushTransactionSection {
	Validate = "validate",
	VerifySignature = "verify_signature",
	AcquireLock = "acquire_lock",
	DuplicateCheck = "duplicate_check",
	GetBalance = "get_balance",
	Enqueue = "enqueue",
}

export const PUSH_TRANSACTION_SECTION_KEYS = Object.values(
	PushTransactionSection,
);

export type PushTransactionSectionKey = PushTransactionSection;

/** Section name → rolling average ms (only sections observed so far). */
export type PushTransactionSectionAveragesMs = Partial<
	Record<PushTransactionSection, number>
>;

/**
 * Periodic sample of per-process rolling-average section timings for
 * pushTransaction (fire-and-forget from apihandlers).
 */
export class ProfilerPushTransactionSectionSample {
	readonly t_unix_ms: number;
	readonly replica_id: string;
	/** Section name → rolling average ms (only sections observed so far). */
	readonly averages_ms: PushTransactionSectionAveragesMs;

	constructor(init: ProfilerPushTransactionSectionSample) {
		this.t_unix_ms = init.t_unix_ms;
		this.replica_id = init.replica_id;
		this.averages_ms = init.averages_ms;
	}

	static parse(
		data: ProfilerPushTransactionSectionSample | null,
	): ProfilerPushTransactionSectionSample | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerPushTransactionSectionSample;
		const averages =
			(typed.averages_ms as PushTransactionSectionAveragesMs | null) ?? {};
		const parsedAverages: PushTransactionSectionAveragesMs = {};
		for (const section of PUSH_TRANSACTION_SECTION_KEYS) {
			const value = averages[section];
			if (value !== undefined) {
				parsedAverages[section] = value;
			}
		}
		return new ProfilerPushTransactionSectionSample({
			t_unix_ms: typed.t_unix_ms,
			replica_id: typed.replica_id,
			averages_ms: parsedAverages,
		});
	}

	static fromJsonText(
		text: string,
	): ProfilerPushTransactionSectionSample | null {
		try {
			return ProfilerPushTransactionSectionSample.parse(
				parseJsonAs<ProfilerPushTransactionSectionSample>(text),
			);
		} catch {
			return null;
		}
	}
}

/** Point on a session-relative timeseries (x = ms since session start). */
export class ProfilerTimeseriesPoint {
	readonly t_ms: number;
	readonly value: number;

	constructor(init: ProfilerTimeseriesPoint) {
		this.t_ms = init.t_ms;
		this.value = init.value;
	}

	static parse(
		data: ProfilerTimeseriesPoint | null,
	): ProfilerTimeseriesPoint | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerTimeseriesPoint;
		return new ProfilerTimeseriesPoint({
			t_ms: typed.t_ms,
			value: typed.value,
		});
	}
}

/** Per-replica in-flight concurrency step series. */
export class ProfilerReplicaConcurrentSeries {
	readonly replica_id: string;
	readonly points: ProfilerTimeseriesPoint[];

	constructor(init: ProfilerReplicaConcurrentSeries) {
		this.replica_id = init.replica_id;
		this.points = init.points;
	}

	static parse(
		data: ProfilerReplicaConcurrentSeries | null,
	): ProfilerReplicaConcurrentSeries | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerReplicaConcurrentSeries;
		if (!Array.isArray(typed.points)) {
			return null;
		}
		const parsedPoints: ProfilerTimeseriesPoint[] = [];
		for (const point of typed.points) {
			const parsed = ProfilerTimeseriesPoint.parse(point ?? null);
			if (!parsed) {
				return null;
			}
			parsedPoints.push(parsed);
		}
		return new ProfilerReplicaConcurrentSeries({
			replica_id: typed.replica_id,
			points: parsedPoints,
		});
	}
}

function parseTimeseriesPoints(
	value: ProfilerTimeseriesPoint[] | null,
): ProfilerTimeseriesPoint[] | null {
	if (value === null) {
		return [];
	}
	if (!Array.isArray(value)) {
		return null;
	}
	const points: ProfilerTimeseriesPoint[] = [];
	for (const point of value) {
		const parsed = ProfilerTimeseriesPoint.parse(point ?? null);
		if (!parsed) {
			return null;
		}
		points.push(parsed);
	}
	return points;
}

/** Rolling-average section timings as session-relative timeseries. */
export class ProfilerPushTransactionSectionAvgTimeseries {
	readonly validate: ProfilerTimeseriesPoint[];
	readonly verify_signature: ProfilerTimeseriesPoint[];
	readonly acquire_lock: ProfilerTimeseriesPoint[];
	readonly duplicate_check: ProfilerTimeseriesPoint[];
	readonly get_balance: ProfilerTimeseriesPoint[];
	readonly enqueue: ProfilerTimeseriesPoint[];

	constructor(init: ProfilerPushTransactionSectionAvgTimeseries) {
		this.validate = init.validate;
		this.verify_signature = init.verify_signature;
		this.acquire_lock = init.acquire_lock;
		this.duplicate_check = init.duplicate_check;
		this.get_balance = init.get_balance;
		this.enqueue = init.enqueue;
	}

	static empty(): ProfilerPushTransactionSectionAvgTimeseries {
		const zero = [new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 })];
		return new ProfilerPushTransactionSectionAvgTimeseries({
			validate: zero,
			verify_signature: [...zero],
			acquire_lock: [...zero],
			duplicate_check: [...zero],
			get_balance: [...zero],
			enqueue: [...zero],
		});
	}

	static parse(
		data: ProfilerPushTransactionSectionAvgTimeseries | null,
	): ProfilerPushTransactionSectionAvgTimeseries | null {
		if (data === null) {
			return ProfilerPushTransactionSectionAvgTimeseries.empty();
		}
		if (!isStructuredObject(data)) {
			return null;
		}
		const validate = parseTimeseriesPoints(data.validate ?? null);
		const verify_signature = parseTimeseriesPoints(
			data.verify_signature ?? null,
		);
		const acquire_lock = parseTimeseriesPoints(data.acquire_lock ?? null);
		const duplicate_check = parseTimeseriesPoints(
			data.duplicate_check ?? null,
		);
		const get_balance = parseTimeseriesPoints(data.get_balance ?? null);
		const enqueue = parseTimeseriesPoints(data.enqueue ?? null);
		if (
			!validate ||
			!verify_signature ||
			!acquire_lock ||
			!duplicate_check ||
			!get_balance ||
			!enqueue
		) {
			return null;
		}
		return new ProfilerPushTransactionSectionAvgTimeseries({
			validate,
			verify_signature,
			acquire_lock,
			duplicate_check,
			get_balance,
			enqueue,
		});
	}
}

/**
 * getBalance span-derived timeseries (x = ms since profiler start).
 * Built from handler entry/exit timestamps recorded as {@link ProfilerSessionSpan}.
 */
export class GetBalanceProfilerTimeseries {
	readonly avg_latency_ms: ProfilerTimeseriesPoint[];
	readonly throughput_per_sec: ProfilerTimeseriesPoint[];

	constructor(init: GetBalanceProfilerTimeseries) {
		this.avg_latency_ms = init.avg_latency_ms;
		this.throughput_per_sec = init.throughput_per_sec;
	}

	static empty(): GetBalanceProfilerTimeseries {
		const zero = [new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 })];
		return new GetBalanceProfilerTimeseries({
			avg_latency_ms: zero,
			throughput_per_sec: [...zero],
		});
	}

	static parse(
		data: GetBalanceProfilerTimeseries | null,
	): GetBalanceProfilerTimeseries | null {
		if (data === null || data === undefined) {
			return GetBalanceProfilerTimeseries.empty();
		}
		if (!isStructuredObject(data)) {
			return null;
		}
		const avg = parseTimeseriesPoints(data.avg_latency_ms ?? null);
		const throughput = parseTimeseriesPoints(data.throughput_per_sec ?? null);
		if (!avg || !throughput) {
			return null;
		}
		return new GetBalanceProfilerTimeseries({
			avg_latency_ms: avg,
			throughput_per_sec: throughput,
		});
	}

	/**
	 * Running average latency and cumulative throughput from getBalance spans.
	 */
	static fromSpans(
		sessionStartedAtUnixMs: number,
		spans: readonly ProfilerSessionSpan[],
	): GetBalanceProfilerTimeseries {
		const apiSpans = spans
			.filter((span) => span.api === ProfilerApiName.GetBalance)
			.sort((a, b) => a.ended_at_unix_ms - b.ended_at_unix_ms);

		if (apiSpans.length === 0) {
			return GetBalanceProfilerTimeseries.empty();
		}

		const avgLatency: ProfilerTimeseriesPoint[] = [
			new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
		];
		const throughput: ProfilerTimeseriesPoint[] = [
			new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
		];

		let latencySum = 0;
		let completed = 0;
		const firstStartUnixMs = Math.min(
			...apiSpans.map((span) => span.started_at_unix_ms),
		);

		for (const span of apiSpans) {
			completed += 1;
			latencySum += span.elapsed_ms;
			const tMs = Math.max(span.ended_at_unix_ms - sessionStartedAtUnixMs, 0);
			avgLatency.push(
				new ProfilerTimeseriesPoint({
					t_ms: tMs,
					value: Number((latencySum / completed).toFixed(3)),
				}),
			);
			const elapsedSec = Math.max(
				(span.ended_at_unix_ms - firstStartUnixMs) / 1000,
				0.001,
			);
			throughput.push(
				new ProfilerTimeseriesPoint({
					t_ms: tMs,
					value: Number((completed / elapsedSec).toFixed(2)),
				}),
			);
		}

		return new GetBalanceProfilerTimeseries({
			avg_latency_ms: avgLatency,
			throughput_per_sec: throughput,
		});
	}
}

/**
 * Session timeseries for charting: x = ms since profiler start.
 * - average in-flight concurrency across apihandler replicas
 * - cumulative pushTransaction entries / exits
 * - cumulative dbwriter writes
 * - Redis pending-tx queue depth (one sample per dbwriter loop)
 * - dbwriter Postgres transaction busy (0/1 square wave)
 * - dbwriter sleep/inactive wait (0/1 square wave)
 * - dbwriter Redis housekeeping (0/1 square wave)
 * - pushTransaction section rolling-average latency (ms)
 * - getBalance average latency + throughput (from entry/exit spans)
 */
export class ProfilerSessionTimeseries {
	readonly avg_replica_concurrent: ProfilerTimeseriesPoint[];
	readonly push_transaction_entries_cumulative: ProfilerTimeseriesPoint[];
	readonly push_transaction_exits_cumulative: ProfilerTimeseriesPoint[];
	readonly dbwriter_writes_cumulative: ProfilerTimeseriesPoint[];
	readonly dbwriter_queue_depth: ProfilerTimeseriesPoint[];
	readonly dbwriter_write_active: ProfilerTimeseriesPoint[];
	readonly dbwriter_sleep_active: ProfilerTimeseriesPoint[];
	readonly dbwriter_redis_active: ProfilerTimeseriesPoint[];
	readonly push_transaction_section_avg_ms: ProfilerPushTransactionSectionAvgTimeseries;
	readonly get_balance: GetBalanceProfilerTimeseries;

	constructor(init: ProfilerSessionTimeseries) {
		this.avg_replica_concurrent = init.avg_replica_concurrent;
		this.push_transaction_entries_cumulative =
			init.push_transaction_entries_cumulative;
		this.push_transaction_exits_cumulative =
			init.push_transaction_exits_cumulative;
		this.dbwriter_writes_cumulative = init.dbwriter_writes_cumulative;
		this.dbwriter_queue_depth = init.dbwriter_queue_depth;
		this.dbwriter_write_active = init.dbwriter_write_active;
		this.dbwriter_sleep_active = init.dbwriter_sleep_active;
		this.dbwriter_redis_active = init.dbwriter_redis_active;
		this.push_transaction_section_avg_ms =
			init.push_transaction_section_avg_ms;
		this.get_balance = init.get_balance;
	}

	static parse(
		data: ProfilerSessionTimeseries | null,
	): ProfilerSessionTimeseries | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const parsedWrites = parseTimeseriesPoints(
			data.dbwriter_writes_cumulative ?? null,
		);
		if (!parsedWrites) {
			return null;
		}

		let parsedAvg = parseTimeseriesPoints(data.avg_replica_concurrent ?? null);
		if (parsedAvg === null) {
			return null;
		}
		const legacyReplicaConcurrent = (
			data as { replica_concurrent?: ProfilerReplicaConcurrentSeries[] | null }
		).replica_concurrent;
		if (
			parsedAvg.length === 0 &&
			Array.isArray(legacyReplicaConcurrent) &&
			legacyReplicaConcurrent.length > 0
		) {
			const legacy: ProfilerReplicaConcurrentSeries[] = [];
			for (const series of legacyReplicaConcurrent) {
				const parsed = ProfilerReplicaConcurrentSeries.parse(series ?? null);
				if (!parsed) {
					return null;
				}
				legacy.push(parsed);
			}
			parsedAvg = averageReplicaConcurrentPoints(legacy);
		}

		const parsedEntries = parseTimeseriesPoints(
			data.push_transaction_entries_cumulative ?? null,
		);
		const parsedExits = parseTimeseriesPoints(
			data.push_transaction_exits_cumulative ?? null,
		);
		const parsedQueue = parseTimeseriesPoints(
			data.dbwriter_queue_depth ?? null,
		);
		// Older reports omit activity series; treat missing as empty.
		const parsedWriteActive = parseTimeseriesPoints(
			data.dbwriter_write_active ?? null,
		);
		const parsedSleepActive = parseTimeseriesPoints(
			data.dbwriter_sleep_active ?? null,
		);
		const parsedRedisActive = parseTimeseriesPoints(
			data.dbwriter_redis_active ?? null,
		);
		const parsedSectionAvg = ProfilerPushTransactionSectionAvgTimeseries.parse(
			data.push_transaction_section_avg_ms ?? null,
		);
		const parsedGetBalance = GetBalanceProfilerTimeseries.parse(
			data.get_balance ?? null,
		);
		if (
			!parsedEntries ||
			!parsedExits ||
			!parsedQueue ||
			parsedWriteActive === null ||
			parsedSleepActive === null ||
			parsedRedisActive === null ||
			!parsedSectionAvg ||
			!parsedGetBalance
		) {
			return null;
		}

		return new ProfilerSessionTimeseries({
			avg_replica_concurrent: parsedAvg,
			push_transaction_entries_cumulative: parsedEntries,
			push_transaction_exits_cumulative: parsedExits,
			dbwriter_writes_cumulative: parsedWrites,
			dbwriter_queue_depth: parsedQueue,
			dbwriter_write_active: parsedWriteActive,
			dbwriter_sleep_active: parsedSleepActive,
			dbwriter_redis_active: parsedRedisActive,
			push_transaction_section_avg_ms: parsedSectionAvg,
			get_balance: parsedGetBalance,
		});
	}
}

/** Average concurrent step series across replicas at every change point. */
export function averageReplicaConcurrentPoints(
	series: readonly ProfilerReplicaConcurrentSeries[],
): ProfilerTimeseriesPoint[] {
	if (series.length === 0) {
		return [new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 })];
	}
	const times = new Set<number>([0]);
	for (const replica of series) {
		for (const point of replica.points) {
			times.add(point.t_ms);
		}
	}
	const sortedTimes = [...times].sort((a, b) => a - b);
	const points: ProfilerTimeseriesPoint[] = [];
	for (const tMs of sortedTimes) {
		let sum = 0;
		for (const replica of series) {
			sum += stepValueAt(replica.points, tMs);
		}
		points.push(
			new ProfilerTimeseriesPoint({
				t_ms: tMs,
				value: Number((sum / series.length).toFixed(2)),
			}),
		);
	}
	return points;
}

function stepValueAt(
	points: readonly ProfilerTimeseriesPoint[],
	tMs: number,
): number {
	let value = 0;
	for (const point of points) {
		if (point.t_ms <= tMs) {
			value = point.value;
		} else {
			break;
		}
	}
	return value;
}

export class ProfilerApiStats {
	readonly api: string;
	readonly count: number;
	/** Completions / (last_end - first_start) seconds. */
	readonly throughput_per_sec: number;
	readonly peak_concurrent: number;
	readonly avg_latency_ms: number;
	readonly mean_latency_ms: number;
	readonly min_latency_ms: number;
	readonly max_latency_ms: number;
	readonly first_start_unix_ms: number | null;
	readonly last_end_unix_ms: number | null;

	constructor(init: ProfilerApiStats) {
		this.api = init.api;
		this.count = init.count;
		this.throughput_per_sec = init.throughput_per_sec;
		this.peak_concurrent = init.peak_concurrent;
		this.avg_latency_ms = init.avg_latency_ms;
		this.mean_latency_ms = init.mean_latency_ms;
		this.min_latency_ms = init.min_latency_ms;
		this.max_latency_ms = init.max_latency_ms;
		this.first_start_unix_ms = init.first_start_unix_ms;
		this.last_end_unix_ms = init.last_end_unix_ms;
	}

	static parse(
		data: ProfilerApiStats | null,
	): ProfilerApiStats | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerApiStats;
		return new ProfilerApiStats({
			api: typed.api,
			count: typed.count,
			throughput_per_sec: typed.throughput_per_sec,
			peak_concurrent: typed.peak_concurrent,
			avg_latency_ms: typed.avg_latency_ms,
			mean_latency_ms: typed.mean_latency_ms,
			min_latency_ms: typed.min_latency_ms,
			max_latency_ms: typed.max_latency_ms,
			first_start_unix_ms: typed.first_start_unix_ms ?? null,
			last_end_unix_ms: typed.last_end_unix_ms ?? null,
		});
	}
}

export class ProfilerDbwriterStats {
	readonly writes_total: number;
	readonly batches: number;
	readonly queue_empty_at_unix_ms: number | null;
	/**
	 * Ms since profiler session start when the total txs/s window begins
	 * (first incoming pushTransaction API call).
	 */
	readonly throughput_start_ms: number | null;
	/**
	 * Ms since profiler session start when the total txs/s window ends
	 * (pending Redis queue reaches 0 for the last time).
	 */
	readonly throughput_end_ms: number | null;
	/**
	 * writes_total / (throughput_end_ms - throughput_start_ms) seconds.
	 * Window starts at the first monitored API span and ends when the Redis
	 * pending queue reaches 0 for the last time.
	 */
	readonly throughput_per_sec: number | null;

	constructor(init: ProfilerDbwriterStats) {
		this.writes_total = init.writes_total;
		this.batches = init.batches;
		this.queue_empty_at_unix_ms = init.queue_empty_at_unix_ms;
		this.throughput_start_ms = init.throughput_start_ms;
		this.throughput_end_ms = init.throughput_end_ms;
		this.throughput_per_sec = init.throughput_per_sec;
	}

	static parse(
		data: ProfilerDbwriterStats | null,
		sessionStartedAtUnixMs: number | null = null,
	): ProfilerDbwriterStats | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerDbwriterStats & {
			/** @deprecated Absolute unix ms; converted when session start is known. */
			throughput_start_unix_ms?: number | null;
			throughput_end_unix_ms?: number | null;
		};
		return new ProfilerDbwriterStats({
			writes_total: typed.writes_total,
			batches: typed.batches,
			queue_empty_at_unix_ms: typed.queue_empty_at_unix_ms ?? null,
			throughput_start_ms: normalizeThroughputBoundMs(
				typed.throughput_start_ms ?? typed.throughput_start_unix_ms ?? null,
				sessionStartedAtUnixMs,
			),
			throughput_end_ms: normalizeThroughputBoundMs(
				typed.throughput_end_ms ??
					typed.throughput_end_unix_ms ??
					typed.queue_empty_at_unix_ms ??
					null,
				sessionStartedAtUnixMs,
			),
			throughput_per_sec: typed.throughput_per_sec ?? null,
		});
	}
}

/** Convert absolute unix ms to session-relative when needed. */
function normalizeThroughputBoundMs(
	value: number | null,
	sessionStartedAtUnixMs: number | null,
): number | null {
	if (value === null) {
		return null;
	}
	if (sessionStartedAtUnixMs !== null && value >= sessionStartedAtUnixMs) {
		return Math.max(value - sessionStartedAtUnixMs, 0);
	}
	return value;
}

/**
 * Redis HASH fields for `Layer2ProfilerSession:{id}:dbwriter`.
 * Values are strings because Redis hashes are stringly typed.
 * Use {@link fromHgetall} at the Redis boundary; callers then use typed fields.
 */
export class ProfilerDbwriterRedisHash {
	readonly writes_total: string;
	readonly batches: string;
	readonly first_write_unix_ms: string | null;
	readonly last_write_unix_ms: string | null;
	readonly queue_empty_at_unix_ms: string | null;

	constructor(init: ProfilerDbwriterRedisHash) {
		this.writes_total = init.writes_total;
		this.batches = init.batches;
		this.first_write_unix_ms = init.first_write_unix_ms;
		this.last_write_unix_ms = init.last_write_unix_ms;
		this.queue_empty_at_unix_ms = init.queue_empty_at_unix_ms;
	}

	/** Map ioredis `hgetall` string map into a typed hash (only place string keys are read). */
	static fromHgetall(fields: Record<string, string>): ProfilerDbwriterRedisHash {
		return ProfilerDbwriterRedisHash.parse({
			writes_total: fields.writes_total ?? "0",
			batches: fields.batches ?? "0",
			first_write_unix_ms: fields.first_write_unix_ms ?? null,
			last_write_unix_ms: fields.last_write_unix_ms ?? null,
			queue_empty_at_unix_ms: fields.queue_empty_at_unix_ms ?? null,
		});
	}

	static parse(
		data: ProfilerDbwriterRedisHash | null,
	): ProfilerDbwriterRedisHash {
		if (!isStructuredObject(data)) {
			return new ProfilerDbwriterRedisHash({
				writes_total: "0",
				batches: "0",
				first_write_unix_ms: null,
				last_write_unix_ms: null,
				queue_empty_at_unix_ms: null,
			});
		}
		const typed = data as ProfilerDbwriterRedisHash;
		return new ProfilerDbwriterRedisHash({
			writes_total: typed.writes_total ?? "0",
			batches: typed.batches ?? "0",
			first_write_unix_ms: typed.first_write_unix_ms ?? null,
			last_write_unix_ms: typed.last_write_unix_ms ?? null,
			queue_empty_at_unix_ms: typed.queue_empty_at_unix_ms ?? null,
		});
	}

	toStats(
		windowStartUnixMs: number | null,
		queueEmptyAtOverrideUnixMs: number | null,
		sessionStartedAtUnixMs: number,
	): ProfilerDbwriterStats {
		const writesTotal = Number(this.writes_total) || 0;
		const batches = Number(this.batches) || 0;
		const hashQueueEmptyAt =
			this.queue_empty_at_unix_ms !== null
				? Number(this.queue_empty_at_unix_ms)
				: null;
		const queueEmptyAt =
			queueEmptyAtOverrideUnixMs !== null &&
			Number.isFinite(queueEmptyAtOverrideUnixMs)
				? queueEmptyAtOverrideUnixMs
				: hashQueueEmptyAt !== null && Number.isFinite(hashQueueEmptyAt)
					? hashQueueEmptyAt
					: null;
		const throughputStartUnix =
			windowStartUnixMs !== null && Number.isFinite(windowStartUnixMs)
				? windowStartUnixMs
				: null;
		const throughputEndUnix = queueEmptyAt;
		let throughput: number | null = null;
		if (throughputStartUnix !== null && throughputEndUnix !== null) {
			const windowMs = Math.max(throughputEndUnix - throughputStartUnix, 1);
			throughput = Number(((writesTotal / windowMs) * 1000).toFixed(2));
		}
		return new ProfilerDbwriterStats({
			writes_total: writesTotal,
			batches,
			queue_empty_at_unix_ms: queueEmptyAt,
			throughput_start_ms: normalizeThroughputBoundMs(
				throughputStartUnix,
				sessionStartedAtUnixMs,
			),
			throughput_end_ms: normalizeThroughputBoundMs(
				throughputEndUnix,
				sessionStartedAtUnixMs,
			),
			throughput_per_sec: throughput,
		});
	}
}

export class ProfilerSessionReport {
	readonly session_id: string;
	readonly title: string;
	readonly description: string;
	readonly apis: string[];
	readonly started_at_unix_ms: number;
	readonly ended_at_unix_ms: number;
	readonly api_stats: ProfilerApiStats[];
	readonly dbwriter: ProfilerDbwriterStats | null;
	readonly timeseries: ProfilerSessionTimeseries;
	readonly output_file: string | null;
	/** Stress Redis diagnostics (attached after finalize); null on older reports. */
	readonly redis: RedisStressDiagnostics | null;

	constructor(init: ProfilerSessionReport) {
		this.session_id = init.session_id;
		this.title = init.title;
		this.description = init.description;
		this.apis = init.apis;
		this.started_at_unix_ms = init.started_at_unix_ms;
		this.ended_at_unix_ms = init.ended_at_unix_ms;
		this.api_stats = init.api_stats;
		this.dbwriter = init.dbwriter;
		this.timeseries = init.timeseries;
		this.output_file = init.output_file;
		this.redis = init.redis;
	}

	static parse(
		data: ProfilerSessionReport | object | null,
	): ProfilerSessionReport | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProfilerSessionReport;
		if (!Array.isArray(typed.apis) || !Array.isArray(typed.api_stats)) {
			return null;
		}
		if (typeof typed.title !== "string" || typed.title.trim().length === 0) {
			return null;
		}
		// Older on-disk/Redis reports predate description; treat missing as "".
		const description =
			typeof typed.description === "string" ? typed.description : "";
		const parsedStats: ProfilerApiStats[] = [];
		for (const stats of typed.api_stats) {
			const parsed = ProfilerApiStats.parse(stats ?? null);
			if (!parsed) {
				return null;
			}
			parsedStats.push(parsed);
		}
		const parsedTimeseries = ProfilerSessionTimeseries.parse(
			typed.timeseries ?? null,
		);
		if (!parsedTimeseries) {
			return null;
		}
		const dbwriterInput = typed.dbwriter ?? null;
		const parsedDbwriter =
			dbwriterInput === null
				? null
				: ProfilerDbwriterStats.parse(
						dbwriterInput,
						typed.started_at_unix_ms,
					);
		if (dbwriterInput !== null && !parsedDbwriter) {
			return null;
		}
		const redisInput = typed.redis ?? null;
		const parsedRedis =
			redisInput === null
				? null
				: (RedisStressDiagnostics.parse(redisInput) ?? null);
		return new ProfilerSessionReport({
			session_id: typed.session_id,
			title: typed.title.trim(),
			description,
			apis: typed.apis,
			started_at_unix_ms: typed.started_at_unix_ms,
			ended_at_unix_ms: typed.ended_at_unix_ms,
			api_stats: parsedStats,
			dbwriter: parsedDbwriter,
			timeseries: parsedTimeseries,
			output_file: typed.output_file ?? null,
			redis: parsedRedis,
		});
	}

	static fromJsonText(text: string): ProfilerSessionReport | null {
		try {
			return ProfilerSessionReport.parse(
				parseJsonAs<ProfilerSessionReport>(text),
			);
		} catch {
			return null;
		}
	}

	withOutputFile(outputFile: string | null): ProfilerSessionReport {
		return new ProfilerSessionReport({
			session_id: this.session_id,
			title: this.title,
			description: this.description,
			apis: this.apis,
			started_at_unix_ms: this.started_at_unix_ms,
			ended_at_unix_ms: this.ended_at_unix_ms,
			api_stats: this.api_stats,
			dbwriter: this.dbwriter,
			timeseries: this.timeseries,
			output_file: outputFile,
			redis: this.redis,
		});
	}

	withRedis(redis: RedisStressDiagnostics | null): ProfilerSessionReport {
		return new ProfilerSessionReport({
			session_id: this.session_id,
			title: this.title,
			description: this.description,
			apis: this.apis,
			started_at_unix_ms: this.started_at_unix_ms,
			ended_at_unix_ms: this.ended_at_unix_ms,
			api_stats: this.api_stats,
			dbwriter: this.dbwriter,
			timeseries: this.timeseries,
			output_file: this.output_file,
			redis,
		});
	}
}
