import { getReplicaId } from "@openl2/openl2-logger";
import type Redis from "ioredis";
import {
	PUSH_TRANSACTION_SECTION_KEYS,
	PushTransactionSection,
	recordPushTransactionProfilerSectionSample,
	type PushTransactionSectionAveragesMs,
} from "../redis/profiler-session";

export { PushTransactionSection };

interface SectionAccumulator {
	sumMs: number;
	count: number;
}

/** Per-process rolling totals (shared across concurrent pushTransaction calls). */
const accumulators = new Map<PushTransactionSection, SectionAccumulator>();

let boundSessionId: string | null = null;
let completionsSinceFlush = 0;
let lastFlushAtUnixMs = 0;
let flushInFlight = false;

/** Flush a chart sample every N completed requests (per replica). */
const FLUSH_EVERY_COMPLETIONS = 25;
/** Also flush if this much wall time passed since the last sample. */
const FLUSH_EVERY_MS = 100;

function resetAccumulators(): void {
	accumulators.clear();
	for (const section of PUSH_TRANSACTION_SECTION_KEYS) {
		accumulators.set(section, { sumMs: 0, count: 0 });
	}
	completionsSinceFlush = 0;
	lastFlushAtUnixMs = 0;
}

resetAccumulators();

function bindSession(sessionId: string | null): void {
	if (!sessionId) {
		if (boundSessionId !== null) {
			boundSessionId = null;
			resetAccumulators();
		}
		return;
	}
	if (boundSessionId !== sessionId) {
		boundSessionId = sessionId;
		resetAccumulators();
	}
}

/** Record elapsed ms for one section on the hot path (no I/O). */
export function recordPushTransactionSectionMs(
	section: PushTransactionSection,
	elapsedMs: number,
): void {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
		return;
	}
	const acc = accumulators.get(section);
	if (!acc) {
		accumulators.set(section, { sumMs: elapsedMs, count: 1 });
		return;
	}
	acc.sumMs += elapsedMs;
	acc.count += 1;
}

export async function timePushTransactionSection<T>(
	section: PushTransactionSection,
	fn: () => Promise<T>,
): Promise<T> {
	const startedAt = performance.now();
	try {
		return await fn();
	} finally {
		recordPushTransactionSectionMs(section, performance.now() - startedAt);
	}
}

export function timePushTransactionSectionSync<T>(
	section: PushTransactionSection,
	fn: () => T,
): T {
	const startedAt = performance.now();
	try {
		return fn();
	} finally {
		recordPushTransactionSectionMs(section, performance.now() - startedAt);
	}
}

function currentAveragesMs(): PushTransactionSectionAveragesMs {
	const averages: PushTransactionSectionAveragesMs = {};
	for (const section of PUSH_TRANSACTION_SECTION_KEYS) {
		const acc = accumulators.get(section);
		if (!acc || acc.count === 0) {
			continue;
		}
		averages[section] = Number((acc.sumMs / acc.count).toFixed(3));
	}
	return averages;
}

/**
 * After a pushTransaction attempt, optionally publish a rolling-average sample.
 * Redis write is fire-and-forget so it does not slow the request path.
 */
export function notePushTransactionSectionSample(
	redis: Redis,
	sessionId: string | null,
): void {
	bindSession(sessionId);
	if (!sessionId) {
		return;
	}

	completionsSinceFlush += 1;
	const now = Date.now();
	const dueByCount = completionsSinceFlush >= FLUSH_EVERY_COMPLETIONS;
	const dueByTime =
		lastFlushAtUnixMs === 0 || now - lastFlushAtUnixMs >= FLUSH_EVERY_MS;
	if ((!dueByCount && !dueByTime) || flushInFlight) {
		return;
	}

	const averagesMs = currentAveragesMs();
	if (Object.keys(averagesMs).length === 0) {
		return;
	}

	completionsSinceFlush = 0;
	lastFlushAtUnixMs = now;
	flushInFlight = true;

	void recordPushTransactionProfilerSectionSample(
		redis,
		sessionId,
		averagesMs,
		now,
		getReplicaId() ?? "unknown",
	)
		.catch(() => {
			// Best-effort; never fail the request path.
		})
		.finally(() => {
			flushInFlight = false;
		});
}

/** Test helper: reset process-local state. */
export function resetPushTransactionSectionProfilerForTests(): void {
	boundSessionId = null;
	flushInFlight = false;
	resetAccumulators();
}

/** Test helper: current rolling averages (sections with samples only). */
export function getPushTransactionSectionAveragesForTests(): PushTransactionSectionAveragesMs {
	return currentAveragesMs();
}
