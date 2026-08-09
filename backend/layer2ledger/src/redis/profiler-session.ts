import type Redis from "ioredis";
import {
	averageReplicaConcurrentPoints,
	PUSH_TRANSACTION_SECTION_KEYS,
	ProfilerApiName,
	ProfilerApiStats,
	ProfilerDbwriterBatchEvent,
	ProfilerDbwriterQueueDepthEvent,
	ProfilerDbwriterRedisHash,
	ProfilerDbwriterStats,
	ProfilerDbwriterRedisActiveEvent,
	ProfilerDbwriterSleepActiveEvent,
	ProfilerDbwriterWriteActiveEvent,
	ProfilerPushTransactionSectionAvgTimeseries,
	ProfilerPushTransactionSectionSample,
	ProfilerReplicaConcurrentSeries,
	ProfilerSessionReport,
	ProfilerSessionSpan,
	ProfilerSessionTimeseries,
	ProfilerTimeseriesPoint,
	PushTransactionSection,
	StartProfilerSession,
	type PushTransactionSectionAveragesMs,
} from "./profiler-session-models";

export {
	averageReplicaConcurrentPoints,
	PUSH_TRANSACTION_SECTION_KEYS,
	ProfilerApiName,
	ProfilerApiStats,
	ProfilerDbwriterBatchEvent,
	ProfilerDbwriterQueueDepthEvent,
	ProfilerDbwriterRedisHash,
	ProfilerDbwriterStats,
	ProfilerDbwriterRedisActiveEvent,
	ProfilerDbwriterSleepActiveEvent,
	ProfilerDbwriterWriteActiveEvent,
	ProfilerPushTransactionSectionAvgTimeseries,
	ProfilerPushTransactionSectionSample,
	ProfilerReplicaConcurrentSeries,
	ProfilerSessionReport,
	ProfilerSessionSpan,
	ProfilerSessionTimeseries,
	ProfilerTimeseriesPoint,
	PushTransactionSection,
	StartProfilerSession,
} from "./profiler-session-models";

export type {
	PushTransactionSectionAveragesMs,
	PushTransactionSectionKey,
} from "./profiler-session-models";

export const PROFILER_SESSION_ACTIVE_KEY = "Layer2ProfilerSession:active";

/** Kept after stop so GetProfilerSession works across apihandler replicas. */
export const PROFILER_SESSION_REPORT_TTL_SEC = 7 * 24 * 60 * 60;

export function profilerSessionMetaKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:meta`;
}

export function profilerSessionSpansKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:spans`;
}

export function profilerSessionDbwriterKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter`;
}

export function profilerSessionDbwriterEventsKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter_events`;
}

export function profilerSessionDbwriterQueueDepthKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter_queue_depth`;
}

export function profilerSessionDbwriterWriteActiveKey(
	sessionId: string,
): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter_write_active`;
}

export function profilerSessionDbwriterSleepActiveKey(
	sessionId: string,
): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter_sleep_active`;
}

export function profilerSessionDbwriterRedisActiveKey(
	sessionId: string,
): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter_redis_active`;
}

export function profilerSessionPushTransactionSectionAvgKey(
	sessionId: string,
): string {
	return `Layer2ProfilerSession:${sessionId}:push_tx_section_avg`;
}

export function profilerSessionReportKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:report`;
}

export function parseStartProfilerSession(
	raw: string | null,
): StartProfilerSession | null {
	if (!raw) {
		return null;
	}
	return StartProfilerSession.fromJsonText(raw);
}

export async function getActiveProfilerSession(
	redis: Redis,
): Promise<StartProfilerSession | null> {
	const sessionId = await redis.get(PROFILER_SESSION_ACTIVE_KEY);
	if (!sessionId) {
		return null;
	}
	return parseStartProfilerSession(
		await redis.get(profilerSessionMetaKey(sessionId)),
	);
}

export async function startProfilerSessionInRedis(
	redis: Redis,
	session: StartProfilerSession,
): Promise<void> {
	const pipeline = redis.pipeline();
	pipeline.set(PROFILER_SESSION_ACTIVE_KEY, session.session_id);
	pipeline.set(
		profilerSessionMetaKey(session.session_id),
		JSON.stringify(session),
	);
	pipeline.del(profilerSessionSpansKey(session.session_id));
	pipeline.del(profilerSessionDbwriterKey(session.session_id));
	pipeline.del(profilerSessionDbwriterEventsKey(session.session_id));
	pipeline.del(profilerSessionDbwriterQueueDepthKey(session.session_id));
	pipeline.del(profilerSessionDbwriterWriteActiveKey(session.session_id));
	pipeline.del(profilerSessionDbwriterSleepActiveKey(session.session_id));
	pipeline.del(profilerSessionDbwriterRedisActiveKey(session.session_id));
	pipeline.del(
		profilerSessionPushTransactionSectionAvgKey(session.session_id),
	);
	pipeline.del(profilerSessionReportKey(session.session_id));
	pipeline.hset(profilerSessionDbwriterKey(session.session_id), {
		writes_total: "0",
		batches: "0",
	});
	await pipeline.exec();
}

export async function recordPushTransactionProfilerSpan(
	redis: Redis,
	sessionId: string,
	span: ProfilerSessionSpan,
): Promise<void> {
	await redis.rpush(profilerSessionSpansKey(sessionId), JSON.stringify(span));
}

export async function recordPushTransactionProfilerDbwriterBatch(
	redis: Redis,
	sessionId: string,
	writes: number,
	batchEndedAtUnixMs: number = Date.now(),
): Promise<void> {
	if (writes <= 0) {
		return;
	}
	const key = profilerSessionDbwriterKey(sessionId);
	const event = new ProfilerDbwriterBatchEvent({
		t_unix_ms: batchEndedAtUnixMs,
		writes,
	});
	const pipeline = redis.pipeline();
	pipeline.hincrby(key, "writes_total", writes);
	pipeline.hincrby(key, "batches", 1);
	pipeline.hsetnx(key, "first_write_unix_ms", String(batchEndedAtUnixMs));
	pipeline.hset(key, "last_write_unix_ms", String(batchEndedAtUnixMs));
	pipeline.rpush(
		profilerSessionDbwriterEventsKey(sessionId),
		JSON.stringify(event),
	);
	await pipeline.exec();
}

export async function recordPushTransactionProfilerDbwriterQueueEmpty(
	redis: Redis,
	sessionId: string,
	atUnixMs: number = Date.now(),
): Promise<void> {
	// Overwrite so repeated drain-to-empty cycles keep the latest empty time.
	await redis.hset(
		profilerSessionDbwriterKey(sessionId),
		"queue_empty_at_unix_ms",
		String(atUnixMs),
	);
}

/** First monitored API span start (earliest incoming apihandler call). */
export function firstApiStartUnixMs(
	spans: readonly ProfilerSessionSpan[],
	apiName: string = ProfilerApiName.PushTransaction,
): number | null {
	let first: number | null = null;
	for (const span of spans) {
		if (span.api !== apiName) {
			continue;
		}
		if (first === null || span.started_at_unix_ms < first) {
			first = span.started_at_unix_ms;
		}
	}
	return first;
}

/**
 * Last time the Redis pending queue transitioned from >0 to 0
 * (from dbwriter loop queue-depth samples).
 */
export function lastQueueEmptyAtUnixMs(
	events: readonly ProfilerDbwriterQueueDepthEvent[],
): number | null {
	const sorted = [...events].sort((a, b) => a.t_unix_ms - b.t_unix_ms);
	let lastEmpty: number | null = null;
	let previousDepth: number | null = null;
	for (const event of sorted) {
		if (
			event.queue_depth === 0 &&
			previousDepth !== null &&
			previousDepth > 0
		) {
			lastEmpty = event.t_unix_ms;
		}
		previousDepth = event.queue_depth;
	}
	return lastEmpty;
}

export async function recordPushTransactionProfilerDbwriterQueueDepth(
	redis: Redis,
	sessionId: string,
	queueDepth: number,
	atUnixMs: number = Date.now(),
): Promise<void> {
	const event = new ProfilerDbwriterQueueDepthEvent({
		t_unix_ms: atUnixMs,
		queue_depth: queueDepth,
	});
	await redis.rpush(
		profilerSessionDbwriterQueueDepthKey(sessionId),
		JSON.stringify(event),
	);
}

/** Mark enter (1) / exit (0) of the dbwriter Postgres batch transaction. */
export async function recordPushTransactionProfilerDbwriterWriteActive(
	redis: Redis,
	sessionId: string,
	writing: boolean,
	atUnixMs: number = Date.now(),
): Promise<void> {
	const event = new ProfilerDbwriterWriteActiveEvent({
		t_unix_ms: atUnixMs,
		writing: writing ? 1 : 0,
	});
	await redis.rpush(
		profilerSessionDbwriterWriteActiveKey(sessionId),
		JSON.stringify(event),
	);
}

/** Mark enter (1) / exit (0) of dbwriter idle sleep / inactive wait. */
export async function recordPushTransactionProfilerDbwriterSleepActive(
	redis: Redis,
	sessionId: string,
	sleeping: boolean,
	atUnixMs: number = Date.now(),
): Promise<void> {
	const event = new ProfilerDbwriterSleepActiveEvent({
		t_unix_ms: atUnixMs,
		sleeping: sleeping ? 1 : 0,
	});
	await redis.rpush(
		profilerSessionDbwriterSleepActiveKey(sessionId),
		JSON.stringify(event),
	);
}

/** Mark enter (1) / exit (0) of dbwriter Redis housekeeping after Postgres write. */
export async function recordPushTransactionProfilerDbwriterRedisActive(
	redis: Redis,
	sessionId: string,
	redisActive: boolean,
	atUnixMs: number = Date.now(),
): Promise<void> {
	const event = new ProfilerDbwriterRedisActiveEvent({
		t_unix_ms: atUnixMs,
		redis_active: redisActive ? 1 : 0,
	});
	await redis.rpush(
		profilerSessionDbwriterRedisActiveKey(sessionId),
		JSON.stringify(event),
	);
}

/** Append a rolling-average sample of pushTransaction section timings. */
export async function recordPushTransactionProfilerSectionSample(
	redis: Redis,
	sessionId: string,
	averagesMs: PushTransactionSectionAveragesMs,
	atUnixMs: number = Date.now(),
	replicaId: string = "unknown",
): Promise<void> {
	const event = new ProfilerPushTransactionSectionSample({
		t_unix_ms: atUnixMs,
		replica_id: replicaId,
		averages_ms: averagesMs,
	});
	await redis.rpush(
		profilerSessionPushTransactionSectionAvgKey(sessionId),
		JSON.stringify(event),
	);
}

export function computeApiStats(
	api: string,
	spans: readonly ProfilerSessionSpan[],
): ProfilerApiStats {
	const forApi = spans.filter((span) => span.api === api);
	if (forApi.length === 0) {
		return new ProfilerApiStats({
			api,
			count: 0,
			throughput_per_sec: 0,
			peak_concurrent: 0,
			avg_latency_ms: 0,
			mean_latency_ms: 0,
			min_latency_ms: 0,
			max_latency_ms: 0,
			first_start_unix_ms: null,
			last_end_unix_ms: null,
		});
	}

	const elapsed = forApi.map((span) => span.elapsed_ms);
	const sumElapsed = elapsed.reduce((a, b) => a + b, 0);
	const avg = sumElapsed / elapsed.length;
	const firstStart = Math.min(...forApi.map((s) => s.started_at_unix_ms));
	const lastEnd = Math.max(...forApi.map((s) => s.ended_at_unix_ms));
	const windowMs = Math.max(lastEnd - firstStart, 1);
	const throughput = (forApi.length / windowMs) * 1000;

	const events: Array<{ t: number; delta: number }> = [];
	for (const span of forApi) {
		events.push({ t: span.started_at_unix_ms, delta: 1 });
		events.push({ t: span.ended_at_unix_ms, delta: -1 });
	}
	events.sort((a, b) => a.t - b.t || b.delta - a.delta);
	let concurrent = 0;
	let peak = 0;
	for (const event of events) {
		concurrent += event.delta;
		if (concurrent > peak) {
			peak = concurrent;
		}
	}

	return new ProfilerApiStats({
		api,
		count: forApi.length,
		throughput_per_sec: Number(throughput.toFixed(2)),
		peak_concurrent: peak,
		avg_latency_ms: Number(avg.toFixed(2)),
		mean_latency_ms: Number(avg.toFixed(2)),
		min_latency_ms: Math.min(...elapsed),
		max_latency_ms: Math.max(...elapsed),
		first_start_unix_ms: firstStart,
		last_end_unix_ms: lastEnd,
	});
}

async function loadSessionSpans(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerSessionSpan[]> {
	const raw = await redis.lrange(profilerSessionSpansKey(sessionId), 0, -1);
	const spans: ProfilerSessionSpan[] = [];
	for (const line of raw) {
		const parsed = ProfilerSessionSpan.fromJsonText(line);
		if (parsed) {
			spans.push(parsed);
		}
	}
	return spans;
}

async function loadDbwriterBatchEvents(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerDbwriterBatchEvent[]> {
	const raw = await redis.lrange(
		profilerSessionDbwriterEventsKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerDbwriterBatchEvent[] = [];
	for (const line of raw) {
		const parsed = ProfilerDbwriterBatchEvent.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

async function loadDbwriterQueueDepthEvents(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerDbwriterQueueDepthEvent[]> {
	const raw = await redis.lrange(
		profilerSessionDbwriterQueueDepthKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerDbwriterQueueDepthEvent[] = [];
	for (const line of raw) {
		const parsed = ProfilerDbwriterQueueDepthEvent.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

async function loadDbwriterWriteActiveEvents(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerDbwriterWriteActiveEvent[]> {
	const raw = await redis.lrange(
		profilerSessionDbwriterWriteActiveKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerDbwriterWriteActiveEvent[] = [];
	for (const line of raw) {
		const parsed = ProfilerDbwriterWriteActiveEvent.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

async function loadDbwriterSleepActiveEvents(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerDbwriterSleepActiveEvent[]> {
	const raw = await redis.lrange(
		profilerSessionDbwriterSleepActiveKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerDbwriterSleepActiveEvent[] = [];
	for (const line of raw) {
		const parsed = ProfilerDbwriterSleepActiveEvent.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

async function loadDbwriterRedisActiveEvents(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerDbwriterRedisActiveEvent[]> {
	const raw = await redis.lrange(
		profilerSessionDbwriterRedisActiveKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerDbwriterRedisActiveEvent[] = [];
	for (const line of raw) {
		const parsed = ProfilerDbwriterRedisActiveEvent.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

async function loadPushTransactionSectionSamples(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerPushTransactionSectionSample[]> {
	const raw = await redis.lrange(
		profilerSessionPushTransactionSectionAvgKey(sessionId),
		0,
		-1,
	);
	const events: ProfilerPushTransactionSectionSample[] = [];
	for (const line of raw) {
		const parsed = ProfilerPushTransactionSectionSample.fromJsonText(line);
		if (parsed) {
			events.push(parsed);
		}
	}
	return events;
}

/**
 * Average section rolling averages across replicas at each sample change point.
 */
export function buildPushTransactionSectionAvgTimeseries(
	startedAtUnixMs: number,
	samples: readonly ProfilerPushTransactionSectionSample[],
): ProfilerPushTransactionSectionAvgTimeseries {
	const sorted = [...samples].sort((a, b) => a.t_unix_ms - b.t_unix_ms);
	const lastByReplica = new Map<string, PushTransactionSectionAveragesMs>();
	const pointsBySection = new Map<
		PushTransactionSection,
		ProfilerTimeseriesPoint[]
	>();
	for (const section of PUSH_TRANSACTION_SECTION_KEYS) {
		pointsBySection.set(section, [
			new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
		]);
	}

	for (const sample of sorted) {
		const previous = lastByReplica.get(sample.replica_id) ?? {};
		lastByReplica.set(sample.replica_id, {
			...previous,
			...sample.averages_ms,
		});
		const tMs = Math.max(sample.t_unix_ms - startedAtUnixMs, 0);
		for (const section of PUSH_TRANSACTION_SECTION_KEYS) {
			const values: number[] = [];
			for (const averages of lastByReplica.values()) {
				const value = averages[section];
				if (value === undefined) {
					continue;
				}
				values.push(value);
			}
			if (values.length === 0) {
				continue;
			}
			const avg =
				values.reduce((sum, value) => sum + value, 0) / values.length;
			pointsBySection.get(section)?.push(
				new ProfilerTimeseriesPoint({
					t_ms: tMs,
					value: Number(avg.toFixed(3)),
				}),
			);
		}
	}

	return new ProfilerPushTransactionSectionAvgTimeseries({
		validate: pointsBySection.get(PushTransactionSection.Validate) ?? [],
		verify_signature:
			pointsBySection.get(PushTransactionSection.VerifySignature) ?? [],
		acquire_lock:
			pointsBySection.get(PushTransactionSection.AcquireLock) ?? [],
		duplicate_check:
			pointsBySection.get(PushTransactionSection.DuplicateCheck) ?? [],
		get_balance: pointsBySection.get(PushTransactionSection.GetBalance) ?? [],
		enqueue: pointsBySection.get(PushTransactionSection.Enqueue) ?? [],
	});
}

function buildCumulativeSpanEvents(
	startedAtUnixMs: number,
	spans: readonly ProfilerSessionSpan[],
	timestampOf: (span: ProfilerSessionSpan) => number,
): ProfilerTimeseriesPoint[] {
	const sorted = [...spans].sort(
		(a, b) => timestampOf(a) - timestampOf(b),
	);
	const points: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	let cumulative = 0;
	for (const span of sorted) {
		cumulative += 1;
		points.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(timestampOf(span) - startedAtUnixMs, 0),
				value: cumulative,
			}),
		);
	}
	return points;
}

/**
 * Build session-relative timeseries from recorded spans and dbwriter samples.
 */
export function buildProfilerSessionTimeseries(
	startedAtUnixMs: number,
	spans: readonly ProfilerSessionSpan[],
	dbwriterBatches: readonly ProfilerDbwriterBatchEvent[],
	queueDepthEvents: readonly ProfilerDbwriterQueueDepthEvent[] = [],
	writeActiveEvents: readonly ProfilerDbwriterWriteActiveEvent[] = [],
	sleepActiveEvents: readonly ProfilerDbwriterSleepActiveEvent[] = [],
	redisActiveEvents: readonly ProfilerDbwriterRedisActiveEvent[] = [],
	sectionAvgSamples: readonly ProfilerPushTransactionSectionSample[] = [],
	apiName: string = ProfilerApiName.PushTransaction,
): ProfilerSessionTimeseries {
	const apiSpans = spans.filter((span) => span.api === apiName);
	const byReplica = new Map<string, ProfilerSessionSpan[]>();
	for (const span of apiSpans) {
		const list = byReplica.get(span.replica_id) ?? [];
		list.push(span);
		byReplica.set(span.replica_id, list);
	}

	const replicaConcurrent: ProfilerReplicaConcurrentSeries[] = [];
	for (const [replicaId, replicaSpans] of [...byReplica.entries()].sort(
		([a], [b]) => a.localeCompare(b),
	)) {
		const events: Array<{ t: number; delta: number }> = [];
		for (const span of replicaSpans) {
			events.push({ t: span.started_at_unix_ms, delta: 1 });
			events.push({ t: span.ended_at_unix_ms, delta: -1 });
		}
		events.sort((a, b) => a.t - b.t || b.delta - a.delta);

		const points: ProfilerTimeseriesPoint[] = [
			new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
		];
		let concurrent = 0;
		for (const event of events) {
			concurrent += event.delta;
			points.push(
				new ProfilerTimeseriesPoint({
					t_ms: Math.max(event.t - startedAtUnixMs, 0),
					value: Math.max(concurrent, 0),
				}),
			);
		}
		replicaConcurrent.push(
			new ProfilerReplicaConcurrentSeries({
				replica_id: replicaId,
				points,
			}),
		);
	}

	const sortedBatches = [...dbwriterBatches].sort(
		(a, b) => a.t_unix_ms - b.t_unix_ms,
	);
	const dbwriterWritesCumulative: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	let cumulativeWrites = 0;
	for (const batch of sortedBatches) {
		cumulativeWrites += batch.writes;
		dbwriterWritesCumulative.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(batch.t_unix_ms - startedAtUnixMs, 0),
				value: cumulativeWrites,
			}),
		);
	}

	const sortedQueue = [...queueDepthEvents].sort(
		(a, b) => a.t_unix_ms - b.t_unix_ms,
	);
	const dbwriterQueueDepth: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	for (const sample of sortedQueue) {
		dbwriterQueueDepth.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(sample.t_unix_ms - startedAtUnixMs, 0),
				value: sample.queue_depth,
			}),
		);
	}

	const sortedWriteActive = [...writeActiveEvents].sort(
		(a, b) => a.t_unix_ms - b.t_unix_ms,
	);
	const dbwriterWriteActive: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	for (const sample of sortedWriteActive) {
		dbwriterWriteActive.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(sample.t_unix_ms - startedAtUnixMs, 0),
				value: sample.writing,
			}),
		);
	}

	const sortedSleepActive = [...sleepActiveEvents].sort(
		(a, b) => a.t_unix_ms - b.t_unix_ms,
	);
	const dbwriterSleepActive: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	for (const sample of sortedSleepActive) {
		dbwriterSleepActive.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(sample.t_unix_ms - startedAtUnixMs, 0),
				value: sample.sleeping,
			}),
		);
	}

	const sortedRedisActive = [...redisActiveEvents].sort(
		(a, b) => a.t_unix_ms - b.t_unix_ms,
	);
	const dbwriterRedisActive: ProfilerTimeseriesPoint[] = [
		new ProfilerTimeseriesPoint({ t_ms: 0, value: 0 }),
	];
	for (const sample of sortedRedisActive) {
		dbwriterRedisActive.push(
			new ProfilerTimeseriesPoint({
				t_ms: Math.max(sample.t_unix_ms - startedAtUnixMs, 0),
				value: sample.redis_active,
			}),
		);
	}

	return new ProfilerSessionTimeseries({
		avg_replica_concurrent: averageReplicaConcurrentPoints(replicaConcurrent),
		push_transaction_entries_cumulative: buildCumulativeSpanEvents(
			startedAtUnixMs,
			apiSpans,
			(span) => span.started_at_unix_ms,
		),
		push_transaction_exits_cumulative: buildCumulativeSpanEvents(
			startedAtUnixMs,
			apiSpans,
			(span) => span.ended_at_unix_ms,
		),
		dbwriter_writes_cumulative: dbwriterWritesCumulative,
		dbwriter_queue_depth: dbwriterQueueDepth,
		dbwriter_write_active: dbwriterWriteActive,
		dbwriter_sleep_active: dbwriterSleepActive,
		dbwriter_redis_active: dbwriterRedisActive,
		push_transaction_section_avg_ms: buildPushTransactionSectionAvgTimeseries(
			startedAtUnixMs,
			sectionAvgSamples,
		),
	});
}

function loadDbwriterStats(
	redisHash: ProfilerDbwriterRedisHash,
	spans: readonly ProfilerSessionSpan[],
	queueDepthEvents: readonly ProfilerDbwriterQueueDepthEvent[],
	sessionIncludesDbwriter: boolean,
	sessionStartedAtUnixMs: number,
): ProfilerDbwriterStats | null {
	if (!sessionIncludesDbwriter) {
		return null;
	}
	return redisHash.toStats(
		firstApiStartUnixMs(spans),
		lastQueueEmptyAtUnixMs(queueDepthEvents),
		sessionStartedAtUnixMs,
	);
}

export async function buildProfilerSessionReport(
	redis: Redis,
	sessionId: string,
	endedAtUnixMs: number = Date.now(),
): Promise<ProfilerSessionReport | null> {
	const session = parseStartProfilerSession(
		await redis.get(profilerSessionMetaKey(sessionId)),
	);
	if (!session) {
		return null;
	}
	const spans = await loadSessionSpans(redis, sessionId);
	const dbwriterBatches = await loadDbwriterBatchEvents(redis, sessionId);
	const queueDepthEvents = await loadDbwriterQueueDepthEvents(
		redis,
		sessionId,
	);
	const writeActiveEvents = await loadDbwriterWriteActiveEvents(
		redis,
		sessionId,
	);
	const sleepActiveEvents = await loadDbwriterSleepActiveEvents(
		redis,
		sessionId,
	);
	const redisActiveEvents = await loadDbwriterRedisActiveEvents(
		redis,
		sessionId,
	);
	const sectionAvgSamples = await loadPushTransactionSectionSamples(
		redis,
		sessionId,
	);
	const monitoredApis = session.apis.filter(
		(api) => api !== ProfilerApiName.Dbwriter,
	);
	const apiStats = monitoredApis.map((api) => computeApiStats(api, spans));
	// Also include any APIs that produced spans but were not listed (defensive).
	const seen = new Set(monitoredApis);
	for (const span of spans) {
		if (!seen.has(span.api)) {
			seen.add(span.api);
			apiStats.push(computeApiStats(span.api, spans));
		}
	}
	const dbwriterHash = ProfilerDbwriterRedisHash.fromHgetall(
		await redis.hgetall(profilerSessionDbwriterKey(session.session_id)),
	);
	return new ProfilerSessionReport({
		session_id: session.session_id,
		title: session.title,
		apis: session.apis,
		started_at_unix_ms: session.started_at_unix_ms,
		ended_at_unix_ms: endedAtUnixMs,
		api_stats: apiStats,
		dbwriter: loadDbwriterStats(
			dbwriterHash,
			spans,
			queueDepthEvents,
			session.apis.includes(ProfilerApiName.Dbwriter),
			session.started_at_unix_ms,
		),
		timeseries: buildProfilerSessionTimeseries(
			session.started_at_unix_ms,
			spans,
			dbwriterBatches,
			queueDepthEvents,
			writeActiveEvents,
			sleepActiveEvents,
			redisActiveEvents,
			sectionAvgSamples,
		),
		output_file: null,
	});
}

export async function saveProfilerSessionReport(
	redis: Redis,
	report: ProfilerSessionReport,
): Promise<void> {
	await redis.set(
		profilerSessionReportKey(report.session_id),
		JSON.stringify(report),
		"EX",
		PROFILER_SESSION_REPORT_TTL_SEC,
	);
}

export function parseProfilerSessionReport(
	raw: string | null,
): ProfilerSessionReport | null {
	if (!raw) {
		return null;
	}
	return ProfilerSessionReport.fromJsonText(raw);
}

/**
 * Load a session report: Redis live build → saved Redis report → output file.
 */
export async function loadProfilerSessionReport(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerSessionReport | null> {
	const live = await buildProfilerSessionReport(redis, sessionId);
	if (live) {
		return live;
	}

	const fromRedis = parseProfilerSessionReport(
		await redis.get(profilerSessionReportKey(sessionId)),
	);
	if (fromRedis) {
		return fromRedis;
	}

	const filePath = profilerSessionOutputPath(sessionId);
	try {
		const file = Bun.file(filePath);
		if (await file.exists()) {
			return parseProfilerSessionReport(await file.text());
		}
	} catch {
		// fall through
	}
	return null;
}

export async function clearProfilerSession(
	redis: Redis,
	sessionId: string,
): Promise<void> {
	const active = await redis.get(PROFILER_SESSION_ACTIVE_KEY);
	const pipeline = redis.pipeline();
	if (active === sessionId) {
		pipeline.del(PROFILER_SESSION_ACTIVE_KEY);
	}
	pipeline.del(profilerSessionMetaKey(sessionId));
	pipeline.del(profilerSessionSpansKey(sessionId));
	pipeline.del(profilerSessionDbwriterKey(sessionId));
	pipeline.del(profilerSessionDbwriterEventsKey(sessionId));
	pipeline.del(profilerSessionDbwriterQueueDepthKey(sessionId));
	pipeline.del(profilerSessionDbwriterWriteActiveKey(sessionId));
	pipeline.del(profilerSessionDbwriterSleepActiveKey(sessionId));
	pipeline.del(profilerSessionDbwriterRedisActiveKey(sessionId));
	pipeline.del(profilerSessionPushTransactionSectionAvgKey(sessionId));
	// Keep :report so GetProfilerSession works after stop.
	await pipeline.exec();
}

export function profilerSessionOutputPath(
	sessionId: string,
	outputDir?: string,
): string {
	const dir =
		outputDir ?? process.env.PROFILER_SESSION_OUTPUT_DIR ?? "/tmp";
	return `${dir.replace(/\/$/, "")}/profiler-session-${sessionId}.json`;
}
