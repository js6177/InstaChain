import type { OpenL2Logger } from "@openl2/openl2-logger";
import { getReplicaId, setProfilerSessionId } from "@openl2/openl2-logger";
import type Redis from "ioredis";
import { log as defaultLog } from "../logger";
import { noteProcessDiagnosticsHotPathSample } from "../redis/process-diagnostics-sampler";
import {
	getActiveProfilerSession,
	ProfilerSessionSpan,
	recordPushTransactionProfilerSpan,
} from "../redis/profiler-session";

/** Redis key for cross-replica in-flight count for a profiled method. */
export function profilerInFlightKey(methodName: string): string {
	return `Layer2Profiler:${methodName}:in_flight`;
}

export interface PushTransactionProfilerSpan {
	/** Wall-clock unix ms when {@link PushTransactionProfiler.begin} ran. */
	readonly startedAtUnixMs: number;
	/** Active profiler session id when begin ran, if any. */
	readonly sessionId: string | null;
	/** Marks the end of the profiled region and emits the end event. */
	end(): Promise<void>;
}

/**
 * Lightweight concurrency profiler for hot request paths.
 *
 * {@link begin} / {@link PushTransactionProfilerSpan.end} record timestamps and
 * maintain a Redis in-flight counter (works across apihandler replicas). When an
 * active profiler session monitors {@link methodName}, each completed span is
 * also appended to that session for throughput / latency reporting.
 */
export class PushTransactionProfiler {
	constructor(
		private readonly methodName: string,
		private readonly redis: Redis,
		private readonly logger: OpenL2Logger = defaultLog,
	) {}

	async begin(): Promise<PushTransactionProfilerSpan> {
		const startedAtPerf = performance.now();
		const startedAtUnixMs = Date.now();
		// Observe ioredis queue depth while requests are still entering the event loop.
		noteProcessDiagnosticsHotPathSample();
		const activeSession = await getActiveProfilerSession(this.redis).catch(
			() => null,
		);
		if (activeSession) {
			setProfilerSessionId(activeSession.session_id);
		}
		const concurrent = await this.redis.incr(
			profilerInFlightKey(this.methodName),
		);
		this.logger.performance(`${this.methodName} profile start`, {
			method: this.methodName,
			event: "start",
			concurrent,
			t_unix_ms: startedAtUnixMs,
			profiler_session_id: activeSession?.session_id,
		});

		let ended = false;
		return {
			startedAtUnixMs,
			sessionId: activeSession?.session_id ?? null,
			end: async () => {
				if (ended) {
					return;
				}
				ended = true;
				const endedAtUnixMs = Date.now();
				const elapsedMs = Math.round(performance.now() - startedAtPerf);
				let concurrentAfter = await this.redis.decr(
					profilerInFlightKey(this.methodName),
				);
				if (concurrentAfter < 0) {
					await this.redis.set(profilerInFlightKey(this.methodName), "0");
					concurrentAfter = 0;
				}
				this.logger.performance(`${this.methodName} profile end`, {
					method: this.methodName,
					event: "end",
					concurrent: concurrentAfter,
					elapsed_ms: elapsedMs,
					t_unix_ms: endedAtUnixMs,
					started_at_unix_ms: startedAtUnixMs,
					profiler_session_id: activeSession?.session_id,
				});

				try {
					const session =
						activeSession ?? (await getActiveProfilerSession(this.redis));
					if (session?.apis.includes(this.methodName)) {
						await recordPushTransactionProfilerSpan(
							this.redis,
							session.session_id,
							new ProfilerSessionSpan({
								api: this.methodName,
								started_at_unix_ms: startedAtUnixMs,
								ended_at_unix_ms: endedAtUnixMs,
								elapsed_ms: elapsedMs,
								replica_id: getReplicaId() ?? "unknown",
							}),
						);
					}
				} catch {
					// Session recording is best-effort; never fail the request path.
				}
			},
		};
	}
}
