import type Redis from "ioredis";

/** Well-known API names that can be listed in a profiler session. */
export const ProfilerApiName = {
	PushTransaction: "pushTransaction",
	Dbwriter: "dbwriter",
} as const;

export type ProfilerApiName =
	(typeof ProfilerApiName)[keyof typeof ProfilerApiName];

/**
 * Redis payload written when a profiler session starts. The dbwriter watches
 * for this object (via the active-session key) and records write / queue-idle
 * events into the same session.
 */
export interface StartProfilerSession {
	session_id: string;
	apis: string[];
	started_at_unix_ms: number;
}

/** One timed API invocation recorded in a session. */
export interface ProfilerSessionSpan {
	api: string;
	started_at_unix_ms: number;
	ended_at_unix_ms: number;
	elapsed_ms: number;
}

export interface ProfilerApiStats {
	api: string;
	count: number;
	/** Completions / (last_end - first_start) seconds. */
	throughput_per_sec: number;
	peak_concurrent: number;
	avg_latency_ms: number;
	mean_latency_ms: number;
	min_latency_ms: number;
	max_latency_ms: number;
	first_start_unix_ms: number | null;
	last_end_unix_ms: number | null;
}

export interface ProfilerDbwriterStats {
	writes_total: number;
	batches: number;
	queue_empty_at_unix_ms: number | null;
	/** writes_total / (queue_empty - session_start) seconds when queue emptied. */
	throughput_per_sec: number | null;
}

export interface ProfilerSessionReport {
	session_id: string;
	apis: string[];
	started_at_unix_ms: number;
	ended_at_unix_ms: number;
	api_stats: ProfilerApiStats[];
	dbwriter: ProfilerDbwriterStats | null;
	output_file: string | null;
}

export const PROFILER_SESSION_ACTIVE_KEY = "Layer2ProfilerSession:active";

export function profilerSessionMetaKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:meta`;
}

export function profilerSessionSpansKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:spans`;
}

export function profilerSessionDbwriterKey(sessionId: string): string {
	return `Layer2ProfilerSession:${sessionId}:dbwriter`;
}

export function parseStartProfilerSession(
	raw: string | null,
): StartProfilerSession | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<StartProfilerSession>;
		if (
			typeof parsed.session_id !== "string" ||
			!Array.isArray(parsed.apis) ||
			typeof parsed.started_at_unix_ms !== "number"
		) {
			return null;
		}
		return {
			session_id: parsed.session_id,
			apis: parsed.apis.filter((api): api is string => typeof api === "string"),
			started_at_unix_ms: parsed.started_at_unix_ms,
		};
	} catch {
		return null;
	}
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
	pipeline.set(profilerSessionMetaKey(session.session_id), JSON.stringify(session));
	pipeline.del(profilerSessionSpansKey(session.session_id));
	pipeline.del(profilerSessionDbwriterKey(session.session_id));
	pipeline.hset(profilerSessionDbwriterKey(session.session_id), {
		writes_total: "0",
		batches: "0",
	});
	await pipeline.exec();
}

export async function recordProfilerSessionSpan(
	redis: Redis,
	sessionId: string,
	span: ProfilerSessionSpan,
): Promise<void> {
	await redis.rpush(profilerSessionSpansKey(sessionId), JSON.stringify(span));
}

export async function recordProfilerDbwriterBatch(
	redis: Redis,
	sessionId: string,
	writes: number,
	batchEndedAtUnixMs: number = Date.now(),
): Promise<void> {
	if (writes <= 0) {
		return;
	}
	const key = profilerSessionDbwriterKey(sessionId);
	const pipeline = redis.pipeline();
	pipeline.hincrby(key, "writes_total", writes);
	pipeline.hincrby(key, "batches", 1);
	pipeline.hsetnx(key, "first_write_unix_ms", String(batchEndedAtUnixMs));
	pipeline.hset(key, "last_write_unix_ms", String(batchEndedAtUnixMs));
	await pipeline.exec();
}

export async function recordProfilerDbwriterQueueEmpty(
	redis: Redis,
	sessionId: string,
	atUnixMs: number = Date.now(),
): Promise<void> {
	await redis.hsetnx(
		profilerSessionDbwriterKey(sessionId),
		"queue_empty_at_unix_ms",
		String(atUnixMs),
	);
}

export function computeApiStats(
	api: string,
	spans: readonly ProfilerSessionSpan[],
): ProfilerApiStats {
	const forApi = spans.filter((span) => span.api === api);
	if (forApi.length === 0) {
		return {
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
		};
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

	return {
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
	};
}

async function loadSessionSpans(
	redis: Redis,
	sessionId: string,
): Promise<ProfilerSessionSpan[]> {
	const raw = await redis.lrange(profilerSessionSpansKey(sessionId), 0, -1);
	const spans: ProfilerSessionSpan[] = [];
	for (const line of raw) {
		try {
			const parsed = JSON.parse(line) as Partial<ProfilerSessionSpan>;
			if (
				typeof parsed.api === "string" &&
				typeof parsed.started_at_unix_ms === "number" &&
				typeof parsed.ended_at_unix_ms === "number" &&
				typeof parsed.elapsed_ms === "number"
			) {
				spans.push({
					api: parsed.api,
					started_at_unix_ms: parsed.started_at_unix_ms,
					ended_at_unix_ms: parsed.ended_at_unix_ms,
					elapsed_ms: parsed.elapsed_ms,
				});
			}
		} catch {
			// skip malformed
		}
	}
	return spans;
}

async function loadDbwriterStats(
	redis: Redis,
	session: StartProfilerSession,
): Promise<ProfilerDbwriterStats | null> {
	if (!session.apis.includes(ProfilerApiName.Dbwriter)) {
		return null;
	}
	const raw = await redis.hgetall(profilerSessionDbwriterKey(session.session_id));
	const writesTotal = Number(raw.writes_total ?? 0);
	const batches = Number(raw.batches ?? 0);
	const queueEmptyAt =
		raw.queue_empty_at_unix_ms !== undefined
			? Number(raw.queue_empty_at_unix_ms)
			: null;
	let throughput: number | null = null;
	if (queueEmptyAt !== null && Number.isFinite(queueEmptyAt)) {
		const windowMs = Math.max(queueEmptyAt - session.started_at_unix_ms, 1);
		throughput = Number(((writesTotal / windowMs) * 1000).toFixed(2));
	}
	return {
		writes_total: writesTotal,
		batches,
		queue_empty_at_unix_ms: queueEmptyAt,
		throughput_per_sec: throughput,
	};
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
	return {
		session_id: session.session_id,
		apis: session.apis,
		started_at_unix_ms: session.started_at_unix_ms,
		ended_at_unix_ms: endedAtUnixMs,
		api_stats: apiStats,
		dbwriter: await loadDbwriterStats(redis, session),
		output_file: null,
	};
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
	await pipeline.exec();
}

export function profilerSessionOutputPath(
	sessionId: string,
	outputDir?: string,
): string {
	const dir =
		outputDir ??
		process.env.PROFILER_SESSION_OUTPUT_DIR ??
		"/tmp";
	return `${dir.replace(/\/$/, "")}/profiler-session-${sessionId}.json`;
}
