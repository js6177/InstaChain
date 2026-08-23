import { LABELS } from "@openl2/wallet-shared";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, useMemo, useState, type JSX } from "react";
import { Button } from "@/components/ui/button";
import type { ProfilerTimeseriesPoint } from "./profiler-session-chart-utils";

export interface GetBalanceProfilerTimeseriesView {
	avg_latency_ms: ProfilerTimeseriesPoint[];
	throughput_per_sec: ProfilerTimeseriesPoint[];
}

export interface GetBalanceProfilerTableRow {
	sessionId: string;
	callCount: string;
	addressCount: string;
	cachePct: string;
	nonzeroPct: string;
	successRatePct: string | null;
	timeseries: GetBalanceProfilerTimeseriesView | null;
	/** Summary stats shown in the result column. */
	throughputPerSec?: number | null;
	avgLatencyMs?: number | null;
	peakConcurrent?: number | null;
}

interface GetBalanceProfilerChartProps {
	rows: readonly GetBalanceProfilerTableRow[];
	/** Session currently loaded in the URL — used as the default expanded row. */
	activeSessionId?: string;
}

type SortColumn =
	| "callCount"
	| "addressCount"
	| "cachePct"
	| "nonzeroPct";

type SortDirection = "asc" | "desc";

function toSeriesData(
	points: ReadonlyArray<ProfilerTimeseriesPoint>,
): Array<[number, number]> {
	return points.map((point) => [point.t_ms, point.value]);
}

function chartOption(
	yAxisName: string,
	seriesName: string,
	points: ReadonlyArray<ProfilerTimeseriesPoint>,
): EChartsOption {
	const maxT = Math.max(1, ...points.map((point) => point.t_ms));
	return {
		tooltip: {
			trigger: "axis",
			axisPointer: { type: "cross" },
		},
		legend: {
			type: "scroll",
			data: [seriesName],
			top: 2,
			left: "center",
			textStyle: { fontSize: 11, color: "#e4e4e7" },
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
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			min: 0,
			max: maxT,
		},
		yAxis: {
			type: "value",
			name: yAxisName,
			nameLocation: "middle",
			nameGap: 70,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			scale: true,
		},
		series: [
			{
				name: seriesName,
				type: "line",
				showSymbol: false,
				data: toSeriesData(points),
			},
		],
	};
}

function ExpandedCharts({
	timeseries,
}: {
	timeseries: GetBalanceProfilerTimeseriesView;
}): JSX.Element {
	const latencyOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_CHART_GET_BALANCE_LATENCY_AXIS,
				LABELS.TEXT_PROFILER_CHART_GET_BALANCE_AVG_LATENCY,
				timeseries.avg_latency_ms,
			),
		[timeseries.avg_latency_ms],
	);
	const throughputOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_CHART_GET_BALANCE_THROUGHPUT_AXIS,
				LABELS.TEXT_PROFILER_CHART_GET_BALANCE_THROUGHPUT,
				timeseries.throughput_per_sec,
			),
		[timeseries.throughput_per_sec],
	);

	return (
		<div className="space-y-4 py-3">
			<section className="space-y-2">
				<h4 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_GET_BALANCE_LATENCY_TITLE}
				</h4>
				<ReactECharts option={latencyOption} style={{ height: 260 }} />
			</section>
			<section className="space-y-2">
				<h4 className="text-sm font-medium text-foreground">
					{LABELS.TEXT_PROFILER_CHART_GET_BALANCE_THROUGHPUT_TITLE}
				</h4>
				<ReactECharts option={throughputOption} style={{ height: 260 }} />
			</section>
		</div>
	);
}

function parseSortValue(value: string): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function compareRows(
	a: GetBalanceProfilerTableRow,
	b: GetBalanceProfilerTableRow,
	column: SortColumn,
	direction: SortDirection,
): number {
	const aValue = parseSortValue(a[column]);
	const bValue = parseSortValue(b[column]);
	const aMissing = Number.isNaN(aValue);
	const bMissing = Number.isNaN(bValue);
	if (aMissing && bMissing) {
		return 0;
	}
	if (aMissing) {
		return 1;
	}
	if (bMissing) {
		return -1;
	}
	const delta = aValue - bValue;
	return direction === "asc" ? delta : -delta;
}

function SortHeaderButton({
	column,
	label,
	sortColumn,
	sortDirection,
	onSort,
}: {
	column: SortColumn;
	label: string;
	sortColumn: SortColumn;
	sortDirection: SortDirection;
	onSort: (column: SortColumn) => void;
}): JSX.Element {
	const active = sortColumn === column;
	const ariaLabel =
		active && sortDirection === "asc"
			? LABELS.BUTTON_PROFILER_SORT_DESC
			: LABELS.BUTTON_PROFILER_SORT_ASC;
	return (
		<div className="flex items-center gap-1">
			<span>{label}</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-6 w-6 px-0"
				aria-label={`${ariaLabel}: ${label}`}
				onClick={(): void => {
					onSort(column);
				}}
			>
				{active && sortDirection === "desc" ? (
					<ArrowDown className="h-3.5 w-3.5" />
				) : (
					<ArrowUp
						className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`}
					/>
				)}
			</Button>
		</div>
	);
}

function RowSummaryStats({
	row,
}: {
	row: GetBalanceProfilerTableRow;
}): JSX.Element {
	return (
		<div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
			<span>
				<span className="text-muted-foreground">
					{LABELS.TEXT_PROFILER_STAT_GET_BALANCE_SUCCESS_RATE}:{" "}
				</span>
				<span
					className={`font-semibold ${
						row.successRatePct != null && Number(row.successRatePct) < 95
							? "text-amber-600 dark:text-amber-400"
							: ""
					}`}
				>
					{row.successRatePct != null ? `${row.successRatePct}%` : "—"}
				</span>
			</span>
			<span>
				<span className="text-muted-foreground">
					{LABELS.TEXT_PROFILER_STAT_GET_BALANCE_PER_SEC}:{" "}
				</span>
				<span className="font-semibold">{row.throughputPerSec ?? "—"}</span>
			</span>
			<span>
				<span className="text-muted-foreground">
					{LABELS.TEXT_PROFILER_STAT_GET_BALANCE_AVG_LATENCY}:{" "}
				</span>
				<span className="font-semibold">{row.avgLatencyMs ?? "—"}</span>
			</span>
			<span>
				<span className="text-muted-foreground">
					{LABELS.TEXT_PROFILER_STAT_PEAK_CONCURRENT}:{" "}
				</span>
				<span className="font-semibold">{row.peakConcurrent ?? "—"}</span>
			</span>
		</div>
	);
}

/**
 * getBalance stress results table: four variable columns + a button that
 * reveals average-latency and throughput charts for that row.
 */
export function GetBalanceProfilerChart({
	rows,
	activeSessionId,
}: GetBalanceProfilerChartProps): JSX.Element {
	const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
		activeSessionId ?? rows[0]?.sessionId ?? null,
	);
	const [sortColumn, setSortColumn] = useState<SortColumn>("callCount");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const sortedRows = useMemo(() => {
		return [...rows].sort((a, b) =>
			compareRows(a, b, sortColumn, sortDirection),
		);
	}, [rows, sortColumn, sortDirection]);

	const onSort = (column: SortColumn): void => {
		if (sortColumn === column) {
			setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
			return;
		}
		setSortColumn(column);
		setSortDirection("asc");
	};

	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b bg-muted/40 text-left">
						<th className="px-3 py-2 font-medium">
							<SortHeaderButton
								column="callCount"
								label={LABELS.TEXT_PROFILER_GET_BALANCE_VAR_CALLS}
								sortColumn={sortColumn}
								sortDirection={sortDirection}
								onSort={onSort}
							/>
						</th>
						<th className="px-3 py-2 font-medium">
							<SortHeaderButton
								column="addressCount"
								label={LABELS.TEXT_PROFILER_GET_BALANCE_VAR_ADDRESSES}
								sortColumn={sortColumn}
								sortDirection={sortDirection}
								onSort={onSort}
							/>
						</th>
						<th className="px-3 py-2 font-medium">
							<SortHeaderButton
								column="cachePct"
								label={LABELS.TEXT_PROFILER_GET_BALANCE_VAR_CACHE_PCT}
								sortColumn={sortColumn}
								sortDirection={sortDirection}
								onSort={onSort}
							/>
						</th>
						<th className="px-3 py-2 font-medium">
							<SortHeaderButton
								column="nonzeroPct"
								label={LABELS.TEXT_PROFILER_GET_BALANCE_VAR_NONZERO_PCT}
								sortColumn={sortColumn}
								sortDirection={sortDirection}
								onSort={onSort}
							/>
						</th>
						<th className="px-3 py-2 font-medium">
							{LABELS.TEXT_PROFILER_GET_BALANCE_CHART_ROW}
						</th>
					</tr>
				</thead>
				<tbody>
					{sortedRows.map((row) => {
						const expanded = expandedSessionId === row.sessionId;
						return (
							<Fragment key={row.sessionId}>
								<tr className="border-b">
									<td className="px-3 py-2 font-mono">{row.callCount}</td>
									<td className="px-3 py-2 font-mono">{row.addressCount}</td>
									<td className="px-3 py-2 font-mono">{row.cachePct}%</td>
									<td className="px-3 py-2 font-mono">{row.nonzeroPct}%</td>
									<td className="px-3 py-2">
										<div className="flex items-center justify-start gap-3">
											<Button
												type="button"
												variant={expanded ? "secondary" : "outline"}
												size="sm"
												className="shrink-0"
												disabled={!row.timeseries}
												onClick={(): void => {
													setExpandedSessionId((current) =>
														current === row.sessionId ? null : row.sessionId,
													);
												}}
											>
												{expanded
													? LABELS.BUTTON_PROFILER_HIDE_CHART
													: LABELS.BUTTON_PROFILER_SHOW_CHART}
											</Button>
											<RowSummaryStats row={row} />
										</div>
									</td>
								</tr>
								{expanded && row.timeseries ? (
									<tr className="border-b bg-muted/20">
										<td colSpan={5} className="px-3">
											<ExpandedCharts timeseries={row.timeseries} />
										</td>
									</tr>
								) : null}
							</Fragment>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
