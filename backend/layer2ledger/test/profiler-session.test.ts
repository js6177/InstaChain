import { describe, expect, it } from "bun:test";
import {
	computeApiStats,
	type ProfilerSessionSpan,
	profilerSessionOutputPath,
} from "../src/redis/profiler-session";

describe("computeApiStats", () => {
	it("computes throughput, peak concurrent, and mean latency", () => {
		const spans: ProfilerSessionSpan[] = [
			{
				api: "pushTransaction",
				started_at_unix_ms: 1000,
				ended_at_unix_ms: 1100,
				elapsed_ms: 100,
			},
			{
				api: "pushTransaction",
				started_at_unix_ms: 1050,
				ended_at_unix_ms: 1200,
				elapsed_ms: 150,
			},
			{
				api: "pushTransaction",
				started_at_unix_ms: 1300,
				ended_at_unix_ms: 1400,
				elapsed_ms: 100,
			},
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

describe("profilerSessionOutputPath", () => {
	it("builds profiler-session-{id}.json under the output dir", () => {
		expect(profilerSessionOutputPath("abc", "/tmp/out")).toBe(
			"/tmp/out/profiler-session-abc.json",
		);
	});
});
