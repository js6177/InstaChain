/// <reference types="vitest/browser" />

import { describe, expect, test } from "vitest";
import {
	clampBound,
	clampViewRange,
	collectProfilerXValues,
	computeDockerStatsTotals,
	nearestX,
	type ProfilerSessionTimeseriesView,
	recalculateTotalTxsPerSec,
} from "../src/components/profiler-session-chart-utils";
import fixture from "./fixtures/profiler-session-chart-fixture.json";

const timeseries = fixture.timeseries as ProfilerSessionTimeseriesView;
const writesTotal = fixture.dbwriter.writes_total;
const throughputStartMs = fixture.dbwriter.throughput_start_ms;
const throughputEndMs = fixture.dbwriter.throughput_end_ms;

describe("collectProfilerXValues", () => {
	test("includes 0, every series t_ms, and throughput bounds", () => {
		const xs = collectProfilerXValues(
			timeseries,
			throughputStartMs,
			throughputEndMs,
		);

		expect(xs[0]).toBe(0);
		expect(xs).toContain(throughputStartMs);
		expect(xs).toContain(throughputEndMs);
		for (const point of timeseries.dbwriter_writes_cumulative) {
			expect(xs).toContain(point.t_ms);
		}
		for (let i = 1; i < xs.length; i += 1) {
			expect(xs[i]).toBeGreaterThan(xs[i - 1] ?? 0);
		}
	});

	test("omits null throughput bounds", () => {
		const xs = collectProfilerXValues(timeseries, null, null);
		expect(xs).not.toContain(throughputStartMs);
		expect(xs[0]).toBe(0);
		expect(xs[xs.length - 1]).toBeGreaterThan(0);
	});
});

describe("recalculateTotalTxsPerSec", () => {
	test("matches fixture throughput for copied session bounds", () => {
		const txsPerSec = recalculateTotalTxsPerSec(
			writesTotal,
			throughputStartMs,
			throughputEndMs,
		);
		expect(txsPerSec).toBe(fixture.dbwriter.throughput_per_sec);
	});

	test("returns null when bounds are missing or inverted", () => {
		expect(recalculateTotalTxsPerSec(writesTotal, null, throughputEndMs)).toBe(
			null,
		);
		expect(
			recalculateTotalTxsPerSec(writesTotal, throughputStartMs, null),
		).toBe(null);
		expect(
			recalculateTotalTxsPerSec(
				writesTotal,
				throughputEndMs,
				throughputStartMs,
			),
		).toBe(null);
		expect(
			recalculateTotalTxsPerSec(writesTotal, throughputStartMs, throughputStartMs),
		).toBe(null);
	});

	test("recalculates when the user commits a narrower window", () => {
		const startMs = 398;
		const endMs = 9107;
		const txsPerSec = recalculateTotalTxsPerSec(writesTotal, startMs, endMs);
		expect(txsPerSec).toBe(
			Number(((writesTotal / (endMs - startMs)) * 1000).toFixed(2)),
		);
	});
});

describe("nearestX", () => {
	const snapXs = collectProfilerXValues(
		timeseries,
		throughputStartMs,
		throughputEndMs,
	);

	test("returns the closest sample timestamp", () => {
		expect(nearestX(50, snapXs)).toBe(43);
		// Exact sample timestamps win; nearby values snap to the closest point.
		expect(nearestX(400, snapXs)).toBe(400);
		expect(nearestX(405, snapXs)).toBe(400);
		expect(nearestX(30500, snapXs)).toBe(30552);
	});

	test("rounds when there are no candidates", () => {
		expect(nearestX(12.6, [])).toBe(13);
		expect(nearestX(-3, [])).toBe(0);
	});
});

describe("clampBound", () => {
	const snapXs = collectProfilerXValues(
		timeseries,
		throughputStartMs,
		throughputEndMs,
	);
	const dataMaxMs = snapXs[snapXs.length - 1] ?? 1;

	test("snaps start bound and keeps it before end", () => {
		expect(
			clampBound({
				rawMs: 50,
				isStart: true,
				otherBoundMs: throughputEndMs,
				dataMaxMs,
				snapXs,
			}),
		).toBe(43);

		expect(
			clampBound({
				rawMs: 40000,
				isStart: true,
				otherBoundMs: throughputEndMs,
				dataMaxMs,
				snapXs,
			}),
		).toBeLessThan(throughputEndMs);
	});

	test("snaps end bound and keeps it after start", () => {
		expect(
			clampBound({
				rawMs: 30500,
				isStart: false,
				otherBoundMs: throughputStartMs,
				dataMaxMs,
				snapXs,
			}),
		).toBe(30552);

		expect(
			clampBound({
				rawMs: 0,
				isStart: false,
				otherBoundMs: throughputStartMs,
				dataMaxMs,
				snapXs,
			}),
		).toBeGreaterThan(throughputStartMs);
	});

	test("clamps to [0, dataMaxMs]", () => {
		expect(
			clampBound({
				rawMs: -100,
				isStart: true,
				otherBoundMs: null,
				dataMaxMs,
				snapXs,
			}),
		).toBe(0);
		expect(
			clampBound({
				rawMs: dataMaxMs + 10_000,
				isStart: false,
				otherBoundMs: null,
				dataMaxMs,
				snapXs,
			}),
		).toBe(dataMaxMs);
	});
});

describe("clampViewRange", () => {
	const dataMaxMs = collectProfilerXValues(
		timeseries,
		throughputStartMs,
		throughputEndMs,
	).at(-1) ?? 1;

	test("accepts a valid narrowed window", () => {
		expect(
			clampViewRange({
				start: 1000,
				end: 10_000,
				dataMaxMs,
				previousStartMs: 0,
			}),
		).toEqual({ startMs: 1000, endMs: 10_000 });
	});

	test("clamps to data bounds", () => {
		expect(
			clampViewRange({
				start: -50,
				end: dataMaxMs + 500,
				dataMaxMs,
				previousStartMs: 0,
			}),
		).toEqual({ startMs: 0, endMs: dataMaxMs });
	});

	test("enforces a minimum window when dragging start", () => {
		const minWindowMs = Math.max(1, Math.round(Math.max(dataMaxMs, 1) * 0.01));
		const result = clampViewRange({
			start: 5000,
			end: 5000,
			dataMaxMs,
			previousStartMs: 0,
		});
		expect(result.endMs - result.startMs).toBeGreaterThanOrEqual(minWindowMs);
		expect(result.endMs).toBe(5000);
	});

	test("enforces a minimum window when dragging end", () => {
		const minWindowMs = Math.max(1, Math.round(Math.max(dataMaxMs, 1) * 0.01));
		const result = clampViewRange({
			start: 5000,
			end: 5000,
			dataMaxMs,
			previousStartMs: 5000,
		});
		expect(result.endMs - result.startMs).toBeGreaterThanOrEqual(minWindowMs);
		expect(result.startMs).toBe(5000);
	});
});

describe("computeDockerStatsTotals", () => {
	test("returns null for empty samples", () => {
		expect(computeDockerStatsTotals([])).toBe(null);
	});

	test("sums containers per tick then reports peak and average", () => {
		const totals = computeDockerStatsTotals([
			{
				capturedAtUnixMs: 1000,
				cpuPercent: 10,
				memoryUsageBytes: 100,
			},
			{
				capturedAtUnixMs: 1000,
				cpuPercent: 20,
				memoryUsageBytes: 50,
			},
			{
				capturedAtUnixMs: 2000,
				cpuPercent: 40,
				memoryUsageBytes: 200,
			},
			{
				capturedAtUnixMs: 2000,
				cpuPercent: 5,
				memoryUsageBytes: 25,
			},
		]);
		expect(totals).not.toBe(null);
		expect(totals?.tickCount).toBe(2);
		expect(totals?.peakTotalCpuPercent).toBe(45);
		expect(totals?.avgTotalCpuPercent).toBe(37.5);
		expect(totals?.peakTotalMemoryBytes).toBe(225);
		expect(totals?.avgTotalMemoryBytes).toBe(187.5);
	});
});
