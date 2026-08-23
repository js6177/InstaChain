import { LABELS } from "@openl2/wallet-shared";
import type {
	EChartsOption,
	GraphicComponentElementOption,
} from "echarts";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	clampBound,
	clampViewRange,
	collectProfilerXValues,
	getPushTransactionSectionAvg,
	nearestX,
	type ProfilerSessionTimeseriesView,
	type ProfilerTimeseriesPoint,
} from "./profiler-session-chart-utils";

interface ProfilerSessionChartProps {
	session: {
		timeseries: ProfilerSessionTimeseriesView;
	};
	throughputStartMs: number | null;
	throughputEndMs: number | null;
	showStartMarker: boolean;
	showEndMarker: boolean;
	viewStartMs: number;
	viewEndMs: number;
	onViewRangeChange: (startMs: number, endMs: number) => void;
	/** Live marker move (does not finalize txs/s). */
	onBoundsDraft: (startMs: number, endMs: number) => void;
	/** Marker drag finished — parent should recalculate txs/s. */
	onBoundsCommit: (startMs: number, endMs: number) => void;
	dataMaxMs: number;
}

const CHART_GROUP = "profiler-session-charts";
const START_MARKER_ID = "throughput-start-marker";
const END_MARKER_ID = "throughput-end-marker";

function toSeriesData(
	points: ReadonlyArray<ProfilerTimeseriesPoint>,
): Array<[number, number]> {
	return points.map((point) => [point.t_ms, point.value]);
}

function baseChartOption(
	legendNames: string[],
	viewStartMs: number,
	viewEndMs: number,
	snapXs: readonly number[],
): Partial<EChartsOption> {
	return {
		tooltip: {
			trigger: "axis",
			axisPointer: {
				type: "cross",
				snap: true,
				label: {
					precision: 0,
				},
			},
			valueFormatter: (value) =>
				typeof value === "number" ? String(value) : String(value ?? ""),
		},
		legend: {
			type: "scroll",
			orient: "horizontal",
			top: 2,
			left: "center",
			width: "92%",
			itemGap: 16,
			itemWidth: 14,
			itemHeight: 10,
			pageIconSize: 10,
			pageTextStyle: {
				color: "#d4d4d8",
			},
			textStyle: {
				fontSize: 11,
				color: "#e4e4e7",
			},
			data: legendNames,
		},
		grid: {
			left: 88,
			right: 28,
			top: 36,
			bottom: 52,
			containLabel: true,
		},
		xAxis: {
			type: "value",
			name: "ms since profiler start",
			nameLocation: "middle",
			nameGap: 36,
			nameTextStyle: {
				fontSize: 11,
				color: "#a1a1aa",
			},
			min: viewStartMs,
			max: viewEndMs > viewStartMs ? viewEndMs : viewStartMs + 1,
			scale: false,
			axisPointer: {
				snap: true,
				label: {
					formatter: (params: { value?: unknown }): string => {
						const raw =
							typeof params.value === "number"
								? params.value
								: Number(params.value);
						if (!Number.isFinite(raw)) {
							return "";
						}
						return String(nearestX(raw, snapXs));
					},
				},
			},
		},
	};
}

function TimeRangeScroller({
	dataMaxMs,
	viewStartMs,
	viewEndMs,
	onViewRangeChange,
}: {
	dataMaxMs: number;
	viewStartMs: number;
	viewEndMs: number;
	onViewRangeChange: (startMs: number, endMs: number) => void;
}): React.JSX.Element {
	const max = Math.max(dataMaxMs, 1);
	const startPct = (viewStartMs / max) * 100;
	const endPct = (viewEndMs / max) * 100;

	const clampRange = (start: number, end: number): void => {
		const next = clampViewRange({
			start,
			end,
			dataMaxMs,
			previousStartMs: viewStartMs,
		});
		onViewRangeChange(next.startMs, next.endMs);
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{LABELS.TEXT_PROFILER_VIEW_RANGE}</span>
				<span className="font-mono">
					{viewStartMs} – {viewEndMs} ms
				</span>
			</div>
			<div className="relative h-8 select-none">
				<div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
				<div
					className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/35"
					style={{
						left: `${startPct}%`,
						width: `${Math.max(endPct - startPct, 0.5)}%`,
					}}
				/>
				<input
					aria-label={LABELS.LABEL_PROFILER_VIEW_START}
					type="range"
					min={0}
					max={max}
					step={1}
					value={viewStartMs}
					onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
						clampRange(Number(event.target.value), viewEndMs);
					}}
					className="absolute inset-0 z-20 m-0 h-8 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-green-600 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-green-600"
				/>
				<input
					aria-label={LABELS.LABEL_PROFILER_VIEW_END}
					type="range"
					min={0}
					max={max}
					step={1}
					value={viewEndMs}
					onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
						clampRange(viewStartMs, Number(event.target.value));
					}}
					className="absolute inset-0 z-10 m-0 h-8 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-red-600 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-600"
				/>
			</div>
		</div>
	);
}

/** Matches baseChartOption grid padding; avoids brittle private echarts model access. */
function gridRect(chart: echarts.ECharts): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	const left = 56;
	const right = 24;
	const top = 52;
	const bottom = 48;
	const width = Math.max(chart.getWidth() - left - right, 1);
	const height = Math.max(chart.getHeight() - top - bottom, 1);
	return { x: left, y: top, width, height };
}

interface DragElement {
	x?: number;
}

/**
 * ECharts `convertToPixel` / `convertFromPixel` are typed as `number | number[]`
 * and can return NaN before axes are ready — narrow to a usable scalar.
 */
function asChartScalar(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDragX(el: DragElement | null): number | null {
	if (!el) {
		return null;
	}
	return asChartScalar(el.x);
}

function buildDraggableMarkerGraphic(args: {
	id: string;
	tMs: number;
	color: string;
	label: string;
	chart: echarts.ECharts;
	otherBoundMs: number | null;
	isStart: boolean;
	dataMaxMs: number;
	snapXs: readonly number[];
	onDraft: (tMs: number, sourceChart: echarts.ECharts) => void;
	onCommit: (tMs: number) => void;
}): GraphicComponentElementOption | null {
	const xPixel = asChartScalar(
		args.chart.convertToPixel({ xAxisIndex: 0 }, args.tMs),
	);
	if (xPixel === null) {
		return null;
	}
	const rect = gridRect(args.chart);
	const toBoundMs = (pixelX: number): number | null => {
		const raw = asChartScalar(
			args.chart.convertFromPixel({ xAxisIndex: 0 }, pixelX),
		);
		if (raw === null) {
			return null;
		}
		return clampBound({
			rawMs: raw,
			isStart: args.isStart,
			otherBoundMs: args.otherBoundMs,
			dataMaxMs: args.dataMaxMs,
			snapXs: args.snapXs,
		});
	};
	return {
		id: args.id,
		type: "group",
		x: xPixel,
		y: 0,
		draggable: "horizontal",
		cursor: "ew-resize",
		z: 100,
		children: [
			{
				type: "rect",
				shape: {
					x: -8,
					y: rect.y,
					width: 16,
					height: rect.height,
				},
				style: {
					fill: "rgba(0,0,0,0.001)",
				},
				cursor: "ew-resize",
			},
			{
				type: "line",
				shape: {
					x1: 0,
					y1: rect.y,
					x2: 0,
					y2: rect.y + rect.height,
				},
				style: {
					stroke: args.color,
					lineWidth: 2,
				},
				cursor: "ew-resize",
				silent: true,
			},
			{
				type: "text",
				style: {
					text: args.label,
					fill: args.color,
					fontSize: 11,
					fontWeight: 600,
					backgroundColor: "rgba(9, 9, 11, 0.85)",
					padding: [3, 5],
					textAlign: args.isStart ? "right" : "left",
					textVerticalAlign: args.isStart ? "top" : "bottom",
				},
				x: args.isStart ? -10 : 10,
				y: args.isStart ? rect.y + 6 : rect.y + rect.height - 6,
				silent: true,
			},
		],
		ondrag: function (this: DragElement): void {
			const x = readDragX(this);
			if (x === null) {
				return;
			}
			const next = toBoundMs(x);
			if (next === null) {
				return;
			}
			args.onDraft(next, args.chart);
		},
		ondragend: function (this: DragElement): void {
			const x = readDragX(this);
			if (x === null) {
				return;
			}
			const next = toBoundMs(x);
			if (next === null) {
				return;
			}
			args.onCommit(next);
		},
	};
}

export function ProfilerSessionChart({
	session,
	throughputStartMs,
	throughputEndMs,
	showStartMarker,
	showEndMarker,
	viewStartMs,
	viewEndMs,
	onViewRangeChange,
	onBoundsDraft,
	onBoundsCommit,
	dataMaxMs,
}: ProfilerSessionChartProps): React.JSX.Element {
	const chartsRef = useRef<echarts.ECharts[]>([]);
	const boundsRef = useRef({
		start: throughputStartMs,
		end: throughputEndMs,
	});
	const snapXsRef = useRef<number[]>([]);
	const draggingRef = useRef(false);
	const onBoundsDraftRef = useRef(onBoundsDraft);
	const onBoundsCommitRef = useRef(onBoundsCommit);
	const showStartMarkerRef = useRef(showStartMarker);
	const showEndMarkerRef = useRef(showEndMarker);
	const dataMaxMsRef = useRef(dataMaxMs);

	// Keep snap points stable during marker drag so chart options don't rebuild.
	const snapXs = useMemo(
		() => collectProfilerXValues(session.timeseries, null, null),
		[session.timeseries],
	);

	useEffect(() => {
		onBoundsDraftRef.current = onBoundsDraft;
		onBoundsCommitRef.current = onBoundsCommit;
		showStartMarkerRef.current = showStartMarker;
		showEndMarkerRef.current = showEndMarker;
		dataMaxMsRef.current = dataMaxMs;
	});

	const {
		concurrencyOption,
		cumulativeOption,
		queueOption,
		writeActiveOption,
		sectionAvgOption,
	} = useMemo(() => {
		const { timeseries } = session;
		const sectionAvg = getPushTransactionSectionAvg(timeseries);

		const concurrencyOption: EChartsOption = {
			...baseChartOption(
				[LABELS.TEXT_PROFILER_CHART_AVG_CONCURRENT],
				viewStartMs,
				viewEndMs,
				snapXs,
			),
			yAxis: {
				type: "value",
				name: LABELS.TEXT_PROFILER_CHART_CONCURRENCY_AXIS,
				nameLocation: "middle",
				min: 0,
				minInterval: 1,
				nameGap: 70,
				nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
				axisLabel: {
					formatter: (value: number): string => String(Math.round(value)),
				},
			},
			series: [
				{
					name: LABELS.TEXT_PROFILER_CHART_AVG_CONCURRENT,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(timeseries.avg_replica_concurrent),
				},
			],
		};

		const cumulativeOption: EChartsOption = {
			...baseChartOption(
				[
					LABELS.TEXT_PROFILER_CHART_PUSH_ENTRIES,
					LABELS.TEXT_PROFILER_CHART_PUSH_EXITS,
					LABELS.TEXT_PROFILER_CHART_WRITES,
				],
				viewStartMs,
				viewEndMs,
				snapXs,
			),
			yAxis: {
				type: "value",
				name: LABELS.TEXT_PROFILER_CHART_CUMULATIVE_AXIS,
				nameLocation: "middle",
				min: 0,
				minInterval: 1,
				nameGap: 72,
				nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
				axisLabel: {
					formatter: (value: number): string => String(Math.round(value)),
				},
			},
			series: [
				{
					name: LABELS.TEXT_PROFILER_CHART_PUSH_ENTRIES,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(timeseries.push_transaction_entries_cumulative),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_PUSH_EXITS,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(timeseries.push_transaction_exits_cumulative),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_WRITES,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(timeseries.dbwriter_writes_cumulative),
				},
			],
		};

		const queueOption: EChartsOption = {
			...baseChartOption(
				[LABELS.TEXT_PROFILER_CHART_QUEUE_DEPTH],
				viewStartMs,
				viewEndMs,
				snapXs,
			),
			yAxis: {
				type: "value",
				name: LABELS.TEXT_PROFILER_CHART_QUEUE_AXIS,
				nameLocation: "middle",
				min: 0,
				minInterval: 1,
				nameGap: 70,
				nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
				axisLabel: {
					formatter: (value: number): string => String(Math.round(value)),
				},
			},
			series: [
				{
					name: LABELS.TEXT_PROFILER_CHART_QUEUE_DEPTH,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(timeseries.dbwriter_queue_depth),
				},
			],
		};

		const writeActiveOption: EChartsOption = {
			...baseChartOption(
				[
					LABELS.TEXT_PROFILER_CHART_WRITE_ACTIVE,
					LABELS.TEXT_PROFILER_CHART_REDIS_ACTIVE,
					LABELS.TEXT_PROFILER_CHART_SLEEP_ACTIVE,
				],
				viewStartMs,
				viewEndMs,
				snapXs,
			),
			yAxis: {
				type: "value",
				name: LABELS.TEXT_PROFILER_CHART_WRITE_ACTIVE_AXIS,
				nameLocation: "middle",
				min: 0,
				max: 1,
				minInterval: 1,
				nameGap: 70,
				nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
				axisLabel: {
					formatter: (value: number): string => String(Math.round(value)),
				},
			},
			series: [
				{
					name: LABELS.TEXT_PROFILER_CHART_WRITE_ACTIVE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					areaStyle: { opacity: 0.25 },
					data: toSeriesData(timeseries.dbwriter_write_active ?? []),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_REDIS_ACTIVE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					areaStyle: { opacity: 0.22 },
					data: toSeriesData(timeseries.dbwriter_redis_active ?? []),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SLEEP_ACTIVE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					areaStyle: { opacity: 0.2 },
					data: toSeriesData(timeseries.dbwriter_sleep_active ?? []),
				},
			],
		};

		const sectionAvgOption: EChartsOption = {
			...baseChartOption(
				[
					LABELS.TEXT_PROFILER_CHART_SECTION_VALIDATE,
					LABELS.TEXT_PROFILER_CHART_SECTION_VERIFY_SIGNATURE,
					LABELS.TEXT_PROFILER_CHART_SECTION_ACQUIRE_LOCK,
					LABELS.TEXT_PROFILER_CHART_SECTION_DUPLICATE_CHECK,
					LABELS.TEXT_PROFILER_CHART_SECTION_GET_BALANCE,
					LABELS.TEXT_PROFILER_CHART_SECTION_ENQUEUE,
				],
				viewStartMs,
				viewEndMs,
				snapXs,
			),
			legend: {
				type: "plain",
				orient: "horizontal",
				top: 2,
				left: "center",
				width: "90%",
				itemGap: 12,
				itemWidth: 12,
				itemHeight: 10,
				textStyle: { fontSize: 11, color: "#e4e4e7" },
				data: [
					LABELS.TEXT_PROFILER_CHART_SECTION_VALIDATE,
					LABELS.TEXT_PROFILER_CHART_SECTION_VERIFY_SIGNATURE,
					LABELS.TEXT_PROFILER_CHART_SECTION_ACQUIRE_LOCK,
					LABELS.TEXT_PROFILER_CHART_SECTION_DUPLICATE_CHECK,
					LABELS.TEXT_PROFILER_CHART_SECTION_GET_BALANCE,
					LABELS.TEXT_PROFILER_CHART_SECTION_ENQUEUE,
				],
			},
			grid: {
				left: 88,
				right: 28,
				top: 56,
				bottom: 52,
				containLabel: true,
			},
			yAxis: {
				type: "value",
				name: LABELS.TEXT_PROFILER_CHART_SECTION_AVG_AXIS,
				nameLocation: "middle",
				min: 0,
				nameGap: 70,
				nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			},
			series: [
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_VALIDATE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.validate),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_VERIFY_SIGNATURE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.verify_signature),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_ACQUIRE_LOCK,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.acquire_lock),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_DUPLICATE_CHECK,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.duplicate_check),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_GET_BALANCE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.get_balance),
				},
				{
					name: LABELS.TEXT_PROFILER_CHART_SECTION_ENQUEUE,
					type: "line",
					step: "end",
					showSymbol: false,
					symbol: "none",
					data: toSeriesData(sectionAvg.enqueue),
				},
			],
		};

		return {
			concurrencyOption,
			cumulativeOption,
			queueOption,
			writeActiveOption,
			sectionAvgOption,
		};
	}, [session, viewStartMs, viewEndMs, snapXs]);

	const syncMarkerGraphics = useCallback((): void => {
		const moveMarkerOnChart = (
			chart: echarts.ECharts,
			id: string,
			tMs: number,
		): void => {
			const xPixel = asChartScalar(
				chart.convertToPixel({ xAxisIndex: 0 }, tMs),
			);
			if (xPixel === null) {
				return;
			}
			chart.setOption(
				{
					graphic: [
						{
							id,
							x: xPixel,
						},
					],
				},
				{ lazyUpdate: true },
			);
		};

		const syncSiblingMarkers = (
			sourceChart: echarts.ECharts,
			markerId: string,
			tMs: number,
		): void => {
			for (const chart of chartsRef.current) {
				if (chart === sourceChart || chart.isDisposed()) {
					continue;
				}
				moveMarkerOnChart(chart, markerId, tMs);
			}
		};

		try {
			const start = boundsRef.current.start;
			const end = boundsRef.current.end;
			for (const chart of chartsRef.current) {
				if (chart.isDisposed()) {
					continue;
				}
				const graphics: GraphicComponentElementOption[] = [];
				if (showStartMarkerRef.current && start !== null) {
					const graphic = buildDraggableMarkerGraphic({
						id: START_MARKER_ID,
						tMs: start,
						color: "#16a34a",
						label: LABELS.TEXT_PROFILER_CHART_MARKER_START,
						chart,
						otherBoundMs: end,
						isStart: true,
						dataMaxMs: dataMaxMsRef.current,
						snapXs: snapXsRef.current,
						onDraft: (tMs, sourceChart): void => {
							draggingRef.current = true;
							const currentEnd = boundsRef.current.end ?? tMs + 1;
							boundsRef.current = { start: tMs, end: currentEnd };
							onBoundsDraftRef.current(tMs, currentEnd);
							syncSiblingMarkers(sourceChart, START_MARKER_ID, tMs);
						},
						onCommit: (tMs): void => {
							const currentEnd = boundsRef.current.end ?? tMs + 1;
							const nextStart = Math.min(tMs, currentEnd - 1);
							boundsRef.current = { start: nextStart, end: currentEnd };
							draggingRef.current = false;
							onBoundsCommitRef.current(nextStart, currentEnd);
						},
					});
					if (graphic) {
						graphics.push(graphic);
					}
				}
				if (showEndMarkerRef.current && end !== null) {
					const graphic = buildDraggableMarkerGraphic({
						id: END_MARKER_ID,
						tMs: end,
						color: "#dc2626",
						label: LABELS.TEXT_PROFILER_CHART_MARKER_END,
						chart,
						otherBoundMs: start,
						isStart: false,
						dataMaxMs: dataMaxMsRef.current,
						snapXs: snapXsRef.current,
						onDraft: (tMs, sourceChart): void => {
							draggingRef.current = true;
							const currentStart =
								boundsRef.current.start ?? Math.max(0, tMs - 1);
							boundsRef.current = { start: currentStart, end: tMs };
							onBoundsDraftRef.current(currentStart, tMs);
							syncSiblingMarkers(sourceChart, END_MARKER_ID, tMs);
						},
						onCommit: (tMs): void => {
							const currentStart =
								boundsRef.current.start ?? Math.max(0, tMs - 1);
							const nextEnd = Math.max(tMs, currentStart + 1);
							boundsRef.current = { start: currentStart, end: nextEnd };
							draggingRef.current = false;
							onBoundsCommitRef.current(currentStart, nextEnd);
						},
					});
					if (graphic) {
						graphics.push(graphic);
					}
				}
				// replaceMerge avoids index-merging old start/end graphics when one is toggled off.
				chart.setOption(
					{ graphic: graphics },
					{ lazyUpdate: true, replaceMerge: ["graphic"] },
				);
			}
		} catch {
			// Chart may be mid-dispose/update; retry on next effect/rAF.
		}
	}, []);

	useEffect(() => {
		if (draggingRef.current) {
			return;
		}
		showStartMarkerRef.current = showStartMarker;
		showEndMarkerRef.current = showEndMarker;
		dataMaxMsRef.current = dataMaxMs;
		snapXsRef.current = snapXs;
		boundsRef.current = {
			start: throughputStartMs,
			end: throughputEndMs,
		};
		// View window changes axis pixel mapping; re-place markers after option update.
		void viewStartMs;
		void viewEndMs;
		syncMarkerGraphics();
		const timer = window.setTimeout((): void => {
			if (!draggingRef.current) {
				syncMarkerGraphics();
			}
		}, 0);
		return (): void => window.clearTimeout(timer);
	}, [
		showStartMarker,
		showEndMarker,
		throughputStartMs,
		throughputEndMs,
		viewStartMs,
		viewEndMs,
		dataMaxMs,
		snapXs,
		syncMarkerGraphics,
	]);

	useEffect((): (() => void) => {
		echarts.connect(CHART_GROUP);
		return (): void => {
			echarts.disconnect(CHART_GROUP);
		};
	}, []);

	const onChartReady = (instance: echarts.ECharts): void => {
		instance.group = CHART_GROUP;
		chartsRef.current = chartsRef.current.filter(
			(chart) => !chart.isDisposed(),
		);
		if (!chartsRef.current.includes(instance)) {
			chartsRef.current.push(instance);
		}
		window.requestAnimationFrame((): void => {
			if (!draggingRef.current) {
				syncMarkerGraphics();
			}
		});
	};

	return (
		<div className="flex w-full flex-col gap-6">
			<TimeRangeScroller
				dataMaxMs={dataMaxMs}
				viewStartMs={viewStartMs}
				viewEndMs={viewEndMs}
				onViewRangeChange={onViewRangeChange}
			/>
			<section className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_CONCURRENCY_TITLE}
				</h3>
				<ReactECharts
					option={concurrencyOption}
					style={{ height: 300, width: "100%" }}
					notMerge
					lazyUpdate
					onChartReady={onChartReady}
				/>
			</section>
			<section className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_CUMULATIVE_TITLE}
				</h3>
				<ReactECharts
					option={cumulativeOption}
					style={{ height: 300, width: "100%" }}
					notMerge
					lazyUpdate
					onChartReady={onChartReady}
				/>
			</section>
			<section className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_QUEUE_TITLE}
				</h3>
				<ReactECharts
					option={queueOption}
					style={{ height: 300, width: "100%" }}
					notMerge
					lazyUpdate
					onChartReady={onChartReady}
				/>
			</section>
			<section className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_WRITE_ACTIVE_TITLE}
				</h3>
				<ReactECharts
					option={writeActiveOption}
					style={{ height: 240, width: "100%" }}
					notMerge
					lazyUpdate
					onChartReady={onChartReady}
				/>
			</section>
			<section className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_SECTION_AVG_TITLE}
				</h3>
				<ReactECharts
					option={sectionAvgOption}
					style={{ height: 360, width: "100%" }}
					notMerge
					lazyUpdate
					onChartReady={onChartReady}
				/>
			</section>
		</div>
	);
}

export default ProfilerSessionChart;
