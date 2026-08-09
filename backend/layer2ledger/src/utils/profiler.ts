import type { OpenL2Logger } from "@openl2/openl2-logger";
import { setProfilerSessionId } from "@openl2/openl2-logger";
import type Redis from "ioredis";
import { log as defaultLog } from "../logger";
import {
	getActiveProfilerSession,
	recordProfilerSessionSpan,
} from "../redis/profiler-session";

/** Redis key for cross-replica in-flight count for a profiled method. */
export function profilerInFlightKey(methodName: string): string {
	return `Layer2Profiler:${methodName}:in_flight`;
}

export interface ProfilerSpan {
	/** Wall-clock unix ms when {@link Profiler.begin} ran. */
	readonly startedAtUnixMs: number;
	/** Marks the end of the profiled region and emits the end event. */
	end(): Promise<void>;
}

/**
 * Lightweight concurrency profiler for hot request paths.
 *
 * {@link begin} / {@link ProfilerSpan.end} record timestamps and maintain a
 * Redis in-flight counter (works across apihandler replicas). When an active
 * profiler session monitors {@link methodName}, each completed span is also
 * appended to that session for throughput / latency reporting.
 */
export class Profiler {
	constructor(
		private readonly methodName: string,
		private readonly redis: Redis,
		private readonly logger: OpenL2Logger = defaultLog,
	) {}

	async begin(): Promise<ProfilerSpan> {
		const startedAtPerf = performance.now();
		const startedAtUnixMs = Date.now();
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
						await recordProfilerSessionSpan(this.redis, session.session_id, {
							api: this.methodName,
							started_at_unix_ms: startedAtUnixMs,
							ended_at_unix_ms: endedAtUnixMs,
							elapsed_ms: elapsedMs,
						});
					}
				} catch {
					// Session recording is best-effort; never fail the request path.
				}
			},
		};
	}
}
