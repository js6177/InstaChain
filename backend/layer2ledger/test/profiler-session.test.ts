import { describe, expect, it } from "bun:test";
import {
	buildProfilerSessionTimeseries,
	computeApiStats,
	firstApiStartUnixMs,
	lastQueueEmptyAtUnixMs,
	ProfilerDbwriterBatchEvent,
	ProfilerDbwriterQueueDepthEvent,
	ProfilerDbwriterRedisHash,
	ProfilerDbwriterRedisActiveEvent,
	ProfilerDbwriterSleepActiveEvent,
	ProfilerDbwriterWriteActiveEvent,
	ProfilerPushTransactionSectionSample,
	ProfilerSessionSpan,
	profilerSessionOutputPath,
	PushTransactionSection,
} from "../src/redis/profiler-session";

describe("computeApiStats", () => {
	it("computes throughput, peak concurrent, and mean latency", () => {
		const spans = [
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1000,
				ended_at_unix_ms: 1100,
				elapsed_ms: 100,
				replica_id: "r1",
			}),
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1050,
				ended_at_unix_ms: 1200,
				elapsed_ms: 150,
				replica_id: "r1",
			}),
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1300,
				ended_at_unix_ms: 1400,
				elapsed_ms: 100,
				replica_id: "r2",
			}),
		];
		const stats = computeApiStats("pushTransaction", spans);
		expect(stats.count).toBe(3);
		expect(stats.peak_concurrent).toBe(2);
		expect(stats.mean_latency_ms).toBe(116.67);
		expect(stats.avg_latency_ms).toBe(116.67);
		expect(stats.min_latency_ms).toBe(100);
		expect(stats.max_latency_ms).toBe(150);
		// 3 completions over 400ms window → 7.5 /s
		expect(stats.throughput_per_sec).toBe(7.5);
	});

	it("returns zeros for an api with no spans", () => {
		const stats = computeApiStats("missing", []);
		expect(stats.count).toBe(0);
		expect(stats.peak_concurrent).toBe(0);
		expect(stats.throughput_per_sec).toBe(0);
	});
});

describe("buildProfilerSessionTimeseries", () => {
	it("builds avg concurrency, entry/exit, writes, queue depth, activity, and section avg series", () => {
		const startedAt = 1000;
		const spans = [
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1100,
				ended_at_unix_ms: 1300,
				elapsed_ms: 200,
				replica_id: "replica-a",
			}),
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1200,
				ended_at_unix_ms: 1400,
				elapsed_ms: 200,
				replica_id: "replica-a",
			}),
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 1150,
				ended_at_unix_ms: 1250,
				elapsed_ms: 100,
				replica_id: "replica-b",
			}),
		];
		const batches = [
			new ProfilerDbwriterBatchEvent({ t_unix_ms: 1350, writes: 10 }),
			new ProfilerDbwriterBatchEvent({ t_unix_ms: 1500, writes: 5 }),
		];
		const queueDepth = [
			new ProfilerDbwriterQueueDepthEvent({
				t_unix_ms: 1200,
				queue_depth: 40,
			}),
			new ProfilerDbwriterQueueDepthEvent({
				t_unix_ms: 1400,
				queue_depth: 5,
			}),
		];
		const writeActive = [
			new ProfilerDbwriterWriteActiveEvent({
				t_unix_ms: 1300,
				writing: 1,
			}),
			new ProfilerDbwriterWriteActiveEvent({
				t_unix_ms: 1340,
				writing: 0,
			}),
			new ProfilerDbwriterWriteActiveEvent({
				t_unix_ms: 1450,
				writing: 1,
			}),
			new ProfilerDbwriterWriteActiveEvent({
				t_unix_ms: 1490,
				writing: 0,
			}),
		];
		const sleepActive = [
			new ProfilerDbwriterSleepActiveEvent({
				t_unix_ms: 1500,
				sleeping: 1,
			}),
			new ProfilerDbwriterSleepActiveEvent({
				t_unix_ms: 1600,
				sleeping: 0,
			}),
		];
		const redisActive = [
			new ProfilerDbwriterRedisActiveEvent({
				t_unix_ms: 1340,
				redis_active: 1,
			}),
			new ProfilerDbwriterRedisActiveEvent({
				t_unix_ms: 1380,
				redis_active: 0,
			}),
		];
		const sectionSamples = [
			new ProfilerPushTransactionSectionSample({
				t_unix_ms: 1200,
				replica_id: "replica-a",
				averages_ms: {
					[PushTransactionSection.Validate]: 0.02,
					[PushTransactionSection.VerifySignature]: 2.0,
					[PushTransactionSection.AcquireLock]: 0.5,
					[PushTransactionSection.DuplicateCheck]: 0.2,
					[PushTransactionSection.GetBalance]: 0.3,
					[PushTransactionSection.Enqueue]: 0.4,
				},
			}),
			new ProfilerPushTransactionSectionSample({
				t_unix_ms: 1400,
				replica_id: "replica-b",
				averages_ms: {
					[PushTransactionSection.Validate]: 0.04,
					[PushTransactionSection.VerifySignature]: 3.0,
					[PushTransactionSection.AcquireLock]: 1.5,
					[PushTransactionSection.DuplicateCheck]: 0.4,
					[PushTransactionSection.GetBalance]: 0.5,
					[PushTransactionSection.Enqueue]: 0.6,
				},
			}),
		];
		const series = buildProfilerSessionTimeseries(
			startedAt,
			spans,
			batches,
			queueDepth,
			writeActive,
			sleepActive,
			redisActive,
			sectionSamples,
		);

		expect(series.avg_replica_concurrent[0]).toEqual({ t_ms: 0, value: 0 });
		// At t=200 (abs 1200): replica-a=2, replica-b=1 → avg 1.5
		const at200 = series.avg_replica_concurrent.find((p) => p.t_ms === 200);
		expect(at200?.value).toBe(1.5);

		expect(series.push_transaction_entries_cumulative).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 100, value: 1 },
			{ t_ms: 150, value: 2 },
			{ t_ms: 200, value: 3 },
		]);
		expect(series.push_transaction_exits_cumulative).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 250, value: 1 },
			{ t_ms: 300, value: 2 },
			{ t_ms: 400, value: 3 },
		]);
		// No getBalance spans in this fixture → empty series baseline.
		expect(series.get_balance.avg_latency_ms).toEqual([
			{ t_ms: 0, value: 0 },
		]);
		expect(series.get_balance.throughput_per_sec).toEqual([
			{ t_ms: 0, value: 0 },
		]);

		expect(series.dbwriter_writes_cumulative).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 350, value: 10 },
			{ t_ms: 500, value: 15 },
		]);
		expect(series.dbwriter_queue_depth).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 200, value: 40 },
			{ t_ms: 400, value: 5 },
		]);
		expect(series.dbwriter_write_active).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 300, value: 1 },
			{ t_ms: 340, value: 0 },
			{ t_ms: 450, value: 1 },
			{ t_ms: 490, value: 0 },
		]);
		expect(series.dbwriter_sleep_active).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 500, value: 1 },
			{ t_ms: 600, value: 0 },
		]);
		expect(series.dbwriter_redis_active).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 340, value: 1 },
			{ t_ms: 380, value: 0 },
		]);
		// At t=200: only replica-a → verify_signature 2.0
		// At t=400: replica-a=2.0, replica-b=3.0 → avg 2.5
		expect(series.push_transaction_section_avg_ms.verify_signature).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 200, value: 2 },
			{ t_ms: 400, value: 2.5 },
		]);
		expect(series.push_transaction_section_avg_ms.acquire_lock).toEqual([
			{ t_ms: 0, value: 0 },
			{ t_ms: 200, value: 0.5 },
			{ t_ms: 400, value: 1 },
		]);
	});
});

describe("end-to-end throughput window", () => {
	it("uses first API start and last queue-empty transition", () => {
		const spans = [
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 2000,
				ended_at_unix_ms: 2100,
				elapsed_ms: 100,
				replica_id: "r1",
			}),
			new ProfilerSessionSpan({
				api: "pushTransaction",
				started_at_unix_ms: 2200,
				ended_at_unix_ms: 2300,
				elapsed_ms: 100,
				replica_id: "r1",
			}),
		];
		expect(firstApiStartUnixMs(spans)).toBe(2000);

		const queueDepth = [
			new ProfilerDbwriterQueueDepthEvent({ t_unix_ms: 2100, queue_depth: 5 }),
			new ProfilerDbwriterQueueDepthEvent({ t_unix_ms: 2200, queue_depth: 0 }),
			new ProfilerDbwriterQueueDepthEvent({ t_unix_ms: 2300, queue_depth: 3 }),
			new ProfilerDbwriterQueueDepthEvent({ t_unix_ms: 2500, queue_depth: 0 }),
			new ProfilerDbwriterQueueDepthEvent({ t_unix_ms: 2600, queue_depth: 0 }),
		];
		expect(lastQueueEmptyAtUnixMs(queueDepth)).toBe(2500);

		const sessionStartedAt = 1000;
		const stats = new ProfilerDbwriterRedisHash({
			writes_total: "100",
			batches: "2",
			first_write_unix_ms: "2100",
			last_write_unix_ms: "2500",
			queue_empty_at_unix_ms: "2200",
		}).toStats(
			firstApiStartUnixMs(spans),
			lastQueueEmptyAtUnixMs(queueDepth),
			sessionStartedAt,
		);
		// 100 writes over (2500-2000)=500ms → 200 /s
		// Bounds are ms since profiler start (session at 1000).
		expect(stats.throughput_start_ms).toBe(1000);
		expect(stats.throughput_end_ms).toBe(1500);
		expect(stats.queue_empty_at_unix_ms).toBe(2500);
		expect(stats.throughput_per_sec).toBe(200);
	});
});

describe("profilerSessionOutputPath", () => {
	it("builds profiler-session-{id}.json under the output dir", () => {
		expect(profilerSessionOutputPath("abc", "/tmp/out")).toBe(
			"/tmp/out/profiler-session-abc.json",
		);
	});
});
