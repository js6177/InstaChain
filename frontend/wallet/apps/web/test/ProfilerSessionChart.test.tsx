/// <reference types="vitest/browser" />

import { LABELS } from "@openl2/wallet-shared";
import { fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ProfilerSessionChart } from "../src/components/ProfilerSessionChart";
import {
	collectProfilerXValues,
	type ProfilerSessionTimeseriesView,
	recalculateTotalTxsPerSec,
} from "../src/components/profiler-session-chart-utils";
import fixture from "./fixtures/profiler-session-chart-fixture.json";

const timeseries = fixture.timeseries as ProfilerSessionTimeseriesView;
const throughputStartMs = fixture.dbwriter.throughput_start_ms;
const throughputEndMs = fixture.dbwriter.throughput_end_ms;
const writesTotal = fixture.dbwriter.writes_total;
const dataMaxMs = Math.max(
	...(collectProfilerXValues(timeseries, throughputStartMs, throughputEndMs)),
	1,
);

interface HarnessProps {
	showStartMarker?: boolean;
	showEndMarker?: boolean;
	viewStartMs?: number;
	viewEndMs?: number;
	throughputStartMs?: number | null;
	throughputEndMs?: number | null;
	onViewRangeChange?: (startMs: number, endMs: number) => void;
	onBoundsDraft?: (startMs: number, endMs: number) => void;
	onBoundsCommit?: (startMs: number, endMs: number) => void;
}

async function renderChart(props: HarnessProps = {}): Promise<{
	screen: Awaited<ReturnType<typeof render>>;
	onViewRangeChange: ReturnType<typeof vi.fn>;
	onBoundsDraft: ReturnType<typeof vi.fn>;
	onBoundsCommit: ReturnType<typeof vi.fn>;
}> {
	const onViewRangeChange = props.onViewRangeChange ?? vi.fn();
	const onBoundsDraft = props.onBoundsDraft ?? vi.fn();
	const onBoundsCommit = props.onBoundsCommit ?? vi.fn();

	const screen = await render(
		<ProfilerSessionChart
			session={{ timeseries }}
			throughputStartMs={
				props.throughputStartMs === undefined
					? throughputStartMs
					: props.throughputStartMs
			}
			throughputEndMs={
				props.throughputEndMs === undefined
					? throughputEndMs
					: props.throughputEndMs
			}
			showStartMarker={props.showStartMarker ?? true}
			showEndMarker={props.showEndMarker ?? true}
			viewStartMs={props.viewStartMs ?? 0}
			viewEndMs={props.viewEndMs ?? dataMaxMs}
			dataMaxMs={dataMaxMs}
			onViewRangeChange={onViewRangeChange}
			onBoundsDraft={onBoundsDraft}
			onBoundsCommit={onBoundsCommit}
		/>,
	);

	return { screen, onViewRangeChange, onBoundsDraft, onBoundsCommit };
}

function chartHostCount(container: HTMLElement): number {
	return container.querySelectorAll("[_echarts_instance_]").length;
}

describe("ProfilerSessionChart", () => {
	test("renders the five chart sections and view-range chrome", async () => {
		const { screen } = await renderChart();

		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_CONCURRENCY_TITLE))
			.toBeVisible();
		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_CUMULATIVE_TITLE))
			.toBeVisible();
		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_QUEUE_TITLE))
			.toBeVisible();
		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_WRITE_ACTIVE_TITLE))
			.toBeVisible();
		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_SECTION_AVG_TITLE))
			.toBeVisible();
		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_VIEW_RANGE))
			.toBeVisible();
		await expect
			.element(screen.getByText(`0 – ${dataMaxMs} ms`))
			.toBeVisible();

		await expect
			.poll(() => chartHostCount(screen.container))
			.toBeGreaterThanOrEqual(5);
	});

	test("view-range start thumb notifies parent of a new window", async () => {
		const onViewRangeChange = vi.fn();
		const { screen } = await renderChart({ onViewRangeChange });

		const startInput = screen.getByLabelText(LABELS.LABEL_PROFILER_VIEW_START);
		await expect.element(startInput).toBeVisible();
		fireEvent.change(startInput.element(), { target: { value: "5000" } });

		expect(onViewRangeChange).toHaveBeenCalled();
		const [startMs, endMs] = onViewRangeChange.mock.calls.at(-1) as [
			number,
			number,
		];
		expect(startMs).toBe(5000);
		expect(endMs).toBe(dataMaxMs);
		expect(endMs).toBeGreaterThan(startMs);
	});

	test("view-range end thumb notifies parent of a new window", async () => {
		const onViewRangeChange = vi.fn();
		const { screen } = await renderChart({ onViewRangeChange });

		const endInput = screen.getByLabelText(LABELS.LABEL_PROFILER_VIEW_END);
		fireEvent.change(endInput.element(), { target: { value: "12000" } });

		expect(onViewRangeChange).toHaveBeenCalled();
		const [startMs, endMs] = onViewRangeChange.mock.calls.at(-1) as [
			number,
			number,
		];
		expect(startMs).toBe(0);
		expect(endMs).toBe(12_000);
	});

	test("displays the controlled view window text", async () => {
		const { screen } = await renderChart({
			viewStartMs: 1000,
			viewEndMs: 8000,
		});

		await expect.element(screen.getByText("1000 – 8000 ms")).toBeVisible();
	});

	test("toggling markers on and off does not crash", async () => {
		const { screen } = await renderChart({
			showStartMarker: true,
			showEndMarker: true,
		});

		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_CONCURRENCY_TITLE))
			.toBeVisible();

		await screen.rerender(
			<ProfilerSessionChart
				session={{ timeseries }}
				throughputStartMs={throughputStartMs}
				throughputEndMs={throughputEndMs}
				showStartMarker={false}
				showEndMarker={true}
				viewStartMs={0}
				viewEndMs={dataMaxMs}
				dataMaxMs={dataMaxMs}
				onViewRangeChange={vi.fn()}
				onBoundsDraft={vi.fn()}
				onBoundsCommit={vi.fn()}
			/>,
		);

		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_QUEUE_TITLE))
			.toBeVisible();

		await screen.rerender(
			<ProfilerSessionChart
				session={{ timeseries }}
				throughputStartMs={throughputStartMs}
				throughputEndMs={throughputEndMs}
				showStartMarker={true}
				showEndMarker={false}
				viewStartMs={0}
				viewEndMs={dataMaxMs}
				dataMaxMs={dataMaxMs}
				onViewRangeChange={vi.fn()}
				onBoundsDraft={vi.fn()}
				onBoundsCommit={vi.fn()}
			/>,
		);

		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_CHART_CUMULATIVE_TITLE))
			.toBeVisible();
		await expect
			.poll(() => chartHostCount(screen.container))
			.toBeGreaterThanOrEqual(4);
	});

	test("draft vs commit: parent only finalizes txs/s from committed bounds", () => {
		const draftStart = 398;
		const draftEnd = 9107;
		const draftTxs = recalculateTotalTxsPerSec(
			writesTotal,
			draftStart,
			draftEnd,
		);
		const committedTxs = recalculateTotalTxsPerSec(
			writesTotal,
			throughputStartMs,
			throughputEndMs,
		);

		expect(committedTxs).toBe(fixture.dbwriter.throughput_per_sec);
		expect(draftTxs).not.toBe(committedTxs);
		expect(draftTxs).toBe(
			Number(((writesTotal / (draftEnd - draftStart)) * 1000).toFixed(2)),
		);
	});

	test("updating throughput bounds via props keeps the page stable", async () => {
		const onBoundsDraft = vi.fn();
		const onBoundsCommit = vi.fn();
		const { screen } = await renderChart({
			onBoundsDraft,
			onBoundsCommit,
		});

		await screen.rerender(
			<ProfilerSessionChart
				session={{ timeseries }}
				throughputStartMs={398}
				throughputEndMs={9107}
				showStartMarker={true}
				showEndMarker={true}
				viewStartMs={0}
				viewEndMs={dataMaxMs}
				dataMaxMs={dataMaxMs}
				onViewRangeChange={vi.fn()}
				onBoundsDraft={onBoundsDraft}
				onBoundsCommit={onBoundsCommit}
			/>,
		);

		await expect
			.element(screen.getByText(LABELS.TEXT_PROFILER_VIEW_RANGE))
			.toBeVisible();
		expect(onBoundsDraft).not.toHaveBeenCalled();
		expect(onBoundsCommit).not.toHaveBeenCalled();
	});
});
