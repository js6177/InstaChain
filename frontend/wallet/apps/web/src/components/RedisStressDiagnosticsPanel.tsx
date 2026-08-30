import { LABELS } from "@openl2/wallet-shared";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { computeDockerStatsTotals } from "./profiler-session-chart-utils";

interface RedisPingLatencyMsView {
	sampleCount: number;
	minMs: number;
	avgMs: number;
	maxMs: number;
}

interface RedisCommandStatView {
	command: string;
	calls: number;
	usec: number;
	usecPerCall: number;
}

interface RedisSlowLogEntryView {
	id: number;
	durationUs: number;
	command: string[];
	clientAddr: string;
}

interface RedisConnectionPoolView {
	connectedClients: number;
	expectedMinClients: number;
	expectedMaxClients: number;
	apihandlerReplicas: number;
}

interface RedisInstanceSnapshotView {
	role: string;
	phase: string;
	pingLatencyMs: RedisPingLatencyMsView;
	connectedClients: number;
	usedMemoryHuman: string;
	slowlogSlowerThanUs: number;
	slowlog: RedisSlowLogEntryView[];
	pool: RedisConnectionPoolView;
}

interface RedisDuringSampleView {
	role: string;
	capturedAtUnixMs: number;
	pingLatencyMs: RedisPingLatencyMsView;
	connectedClients: number;
	instantaneousOpsPerSec: number;
}

interface RedisDockerStatsSampleView {
	role: string;
	capturedAtUnixMs: number;
	containerName: string;
	cpuPercent: number;
	memoryUsageBytes: number;
	memoryLimitBytes: number;
	memoryPercent: number;
}

interface ProcessDiagnosticsSampleView {
	service: string;
	replicaId: string;
	capturedAtUnixMs: number;
	transactionsCommandQueueLength: number;
	addressBalanceCommandQueueLength: number;
	eventLoopDelayMeanMs: number;
	eventLoopDelayMaxMs: number;
	eventLoopDelayP99Ms: number;
}

export interface RedisStressDiagnosticsView {
	mode: string;
	duringSamples: RedisDuringSampleView[];
	dockerStatsSamples?: RedisDockerStatsSampleView[];
	processSamples?: ProcessDiagnosticsSampleView[];
	after: RedisInstanceSnapshotView[];
	commandstatDeltas: RedisCommandStatView[];
}

interface RedisStressDiagnosticsPanelProps {
	redis: RedisStressDiagnosticsView;
	/** Session start — used to plot during samples as relative ms. */
	sessionStartedAtUnixMs: number;
}

const YAxisValueKind = {
	Decimal: "decimal",
	Integer: "integer",
} as const;

type YAxisValueKindValue = (typeof YAxisValueKind)[keyof typeof YAxisValueKind];

function seriesForRole(
	samples: readonly RedisDuringSampleView[],
	role: string,
	pick: (sample: RedisDuringSampleView) => number,
	originUnixMs: number,
	valueKind: YAxisValueKindValue,
): Array<[number, number]> {
	return samples
		.filter((sample) => sample.role === role)
		.map((sample) => {
			const raw = pick(sample);
			const value =
				valueKind === YAxisValueKind.Integer
					? Math.round(raw)
					: Number(raw.toFixed(3));
			return [Math.max(sample.capturedAtUnixMs - originUnixMs, 0), value];
		});
}

const PROCESS_SAMPLE_BUCKET_MS = 500;

/**
 * Collapse multi-replica samples into 500ms buckets (worst-case / max).
 * Keeps charts readable when many apihandler replicas sample concurrently.
 */
function seriesForProcessSamplesMax(
	samples: readonly ProcessDiagnosticsSampleView[],
	filter: (sample: ProcessDiagnosticsSampleView) => boolean,
	pick: (sample: ProcessDiagnosticsSampleView) => number,
	originUnixMs: number,
	valueKind: YAxisValueKindValue,
): Array<[number, number]> {
	const buckets = new Map<number, number>();
	for (const sample of samples) {
		if (!filter(sample)) {
			continue;
		}
		const relativeMs = Math.max(sample.capturedAtUnixMs - originUnixMs, 0);
		const bucket =
			Math.floor(relativeMs / PROCESS_SAMPLE_BUCKET_MS) *
			PROCESS_SAMPLE_BUCKET_MS;
		const raw = pick(sample);
		const value =
			valueKind === YAxisValueKind.Integer
				? Math.round(raw)
				: Number(raw.toFixed(3));
		const previous = buckets.get(bucket);
		buckets.set(
			bucket,
			previous === undefined ? value : Math.max(previous, value),
		);
	}
	return [...buckets.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([t, value]) => [t, value]);
}

function formatDurationUs(durationUs: number): string {
	if (durationUs > 1000) {
		return `${(durationUs / 1000).toFixed(2)} ms`;
	}
	return `${durationUs}µs`;
}

function formatSlowlogThresholdUs(thresholdUs: number): string {
	if (thresholdUs > 1000) {
		const ms = thresholdUs / 1000;
		const msLabel = Number.isInteger(ms) ? String(ms) : ms.toFixed(2);
		return `≥${msLabel} ms`;
	}
	return `≥${thresholdUs}µs`;
}

function formatSlowlogCommand(command: readonly string[]): string {
	return command.join(" ");
}

function slowlogInstruction(command: readonly string[]): string {
	return (command[0] ?? "?").toUpperCase();
}

const SLOWLOG_INSTRUCTION_COLORS = [
	"blue",
	"green",
	"red",
	"orange",
	"purple",
	"teal",
	"brown",
	"pink",
	"olive",
	"navy",
	"maroon",
	"gold",
] as const;

function colorForSlowlogInstruction(instruction: string): string {
	let hash = 0;
	for (let i = 0; i < instruction.length; i += 1) {
		hash = (hash * 31 + instruction.charCodeAt(i)) >>> 0;
	}
	return SLOWLOG_INSTRUCTION_COLORS[
		hash % SLOWLOG_INSTRUCTION_COLORS.length
	] as string;
}

const SLOWLOG_TOP_CHART_COUNT = 16;

interface SlowlogBarRow {
	id: number;
	instruction: string;
	durationUs: number;
	command: string[];
}

/** Top N individual slowlog entries by duration (newest ties keep order). */
function buildTopSlowlogBars(
	entries: readonly RedisSlowLogEntryView[],
): SlowlogBarRow[] {
	return [...entries]
		.sort((a, b) => b.durationUs - a.durationUs)
		.slice(0, SLOWLOG_TOP_CHART_COUNT)
		.map((entry) => ({
			id: entry.id,
			instruction: slowlogInstruction(entry.command),
			durationUs: entry.durationUs,
			command: entry.command,
		}))
		.reverse();
}

function topSlowlogBarOption(
	entries: readonly RedisSlowLogEntryView[],
): EChartsOption {
	const rows = buildTopSlowlogBars(entries);
	const categoryKeys = rows.map((row) => String(row.id));
	// Keep every bar; show each instruction name only once (topmost occurrence).
	const yLabelsByKey = new Map<string, string>();
	const labeledInstructions = new Set<string>();
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		const row = rows[index] as SlowlogBarRow;
		const key = String(row.id);
		if (labeledInstructions.has(row.instruction)) {
			yLabelsByKey.set(key, "");
			continue;
		}
		labeledInstructions.add(row.instruction);
		yLabelsByKey.set(key, row.instruction);
	}
	const barData = rows.map((row) => ({
		value: Number((row.durationUs / 1000).toFixed(3)),
		itemStyle: {
			color: colorForSlowlogInstruction(row.instruction),
		},
	}));

	return {
		tooltip: {
			show: false,
		},
		grid: {
			left: 16,
			right: 28,
			top: 12,
			bottom: 40,
			containLabel: true,
		},
		xAxis: {
			type: "value",
			name: LABELS.TEXT_PROFILER_REDIS_SLOWLOG_DURATION_AXIS,
			nameLocation: "middle",
			nameGap: 28,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			axisLabel: {
				color: "#a1a1aa",
				formatter: (value: number): string => String(value),
			},
			splitLine: {
				lineStyle: { color: "rgba(255,255,255,0.08)" },
			},
		},
		yAxis: {
			type: "category",
			data: categoryKeys,
			axisLabel: {
				color: "#e4e4e7",
				fontSize: 11,
				fontFamily: "ui-monospace, monospace",
				formatter: (key: string): string => yLabelsByKey.get(key) ?? "",
			},
			axisTick: { show: false },
			axisLine: { show: false },
		},
		series: [
			{
				type: "bar",
				data: barData,
				barMaxWidth: 22,
				z: 10,
				emphasis: {
					focus: "self",
					itemStyle: {
						shadowBlur: 10,
						shadowColor: "rgba(0,0,0,0.5)",
					},
				},
			},
		],
	};
}

function formatBytesHuman(bytes: number): string {
	const abs = Math.abs(bytes);
	if (abs >= 1024 ** 3) {
		return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	}
	if (abs >= 1024 ** 2) {
		return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	}
	if (abs >= 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${Math.round(bytes)} B`;
}

function formatAxisTooltipValue(value: unknown, integerAxis: boolean): string {
	if (typeof value !== "number") {
		return String(value ?? "");
	}
	return integerAxis ? String(Math.round(value)) : String(value);
}

function seriesForDockerStats(
	samples: readonly RedisDockerStatsSampleView[],
	role: string,
	pick: (sample: RedisDockerStatsSampleView) => number,
	originUnixMs: number,
): Array<[number, number]> {
	/** Sum multi-replica samples that share a role + capture timestamp. */
	const byTime = new Map<number, number>();
	for (const sample of samples) {
		if (sample.role !== role) {
			continue;
		}
		const t = Math.max(sample.capturedAtUnixMs - originUnixMs, 0);
		byTime.set(t, (byTime.get(t) ?? 0) + pick(sample));
	}
	return [...byTime.entries()].sort((a, b) => a[0] - b[0]);
}

const DOCKER_STATS_SERIES: ReadonlyArray<{
	role: string;
	label: string;
}> = [
	{
		role: "transactions",
		label: LABELS.TEXT_PROFILER_REDIS_ROLE_TRANSACTIONS,
	},
	{
		role: "addressbalance",
		label: LABELS.TEXT_PROFILER_REDIS_ROLE_ADDRESSBALANCE,
	},
	{
		role: "apihandler",
		label: LABELS.TEXT_PROFILER_DOCKER_STATS_ROLE_APIHANDLER,
	},
	{
		role: "dbwriter",
		label: LABELS.TEXT_PROFILER_DOCKER_STATS_ROLE_DBWRITER,
	},
	{
		role: "nginx",
		label: LABELS.TEXT_PROFILER_DOCKER_STATS_ROLE_NGINX,
	},
	{
		role: "pgbouncer",
		label: LABELS.TEXT_PROFILER_DOCKER_STATS_ROLE_PGBOUNCER,
	},
	{
		role: "postgres",
		label: LABELS.TEXT_PROFILER_DOCKER_STATS_ROLE_POSTGRES,
	},
];

function dockerStatsSeriesPresent(
	samples: readonly RedisDockerStatsSampleView[],
): typeof DOCKER_STATS_SERIES {
	const present = new Set(samples.map((sample) => sample.role));
	return DOCKER_STATS_SERIES.filter((series) => present.has(series.role));
}

function memoryChartOption(
	series: Array<{ name: string; data: Array<[number, number]> }>,
): EChartsOption {
	return {
		tooltip: {
			trigger: "axis",
			valueFormatter: (value) =>
				typeof value === "number"
					? formatBytesHuman(value)
					: String(value ?? ""),
		},
		legend: {
			type: "scroll",
			top: 2,
			left: "center",
			width: "92%",
			itemGap: 16,
			textStyle: { fontSize: 11, color: "#e4e4e7" },
			pageTextStyle: { color: "#d4d4d8" },
		},
		grid: {
			left: 72,
			right: 28,
			top: 40,
			bottom: 48,
			containLabel: true,
		},
		xAxis: {
			type: "value",
			name: "ms",
			nameLocation: "middle",
			nameGap: 30,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			axisLabel: {
				show: true,
				color: "#d4d4d8",
				fontSize: 11,
				hideOverlap: false,
			},
		},
		yAxis: {
			type: "value",
			name: LABELS.TEXT_PROFILER_REDIS_CHART_MEMORY_AXIS,
			nameLocation: "middle",
			nameGap: 50,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			scale: true,
			axisLine: { show: true, lineStyle: { color: "#52525b" } },
			axisTick: { show: true, lineStyle: { color: "#52525b" } },
			splitLine: {
				show: true,
				lineStyle: { color: "rgba(255,255,255,0.08)" },
			},
			axisLabel: {
				show: true,
				color: "#e4e4e7",
				fontSize: 11,
				margin: 10,
				hideOverlap: false,
				formatter: (value: number): string => formatBytesHuman(value),
			},
		},
		series: series.map((entry) => ({
			name: entry.name,
			type: "line",
			showSymbol: false,
			data: entry.data,
		})),
	};
}

function chartOption(
	yName: string,
	series: Array<{ name: string; data: Array<[number, number]> }>,
	valueKind: YAxisValueKindValue,
): EChartsOption {
	const integerAxis = valueKind === YAxisValueKind.Integer;
	return {
		tooltip: {
			trigger: "axis",
			valueFormatter: (value) => formatAxisTooltipValue(value, integerAxis),
		},
		legend: {
			type: "scroll",
			top: 2,
			left: "center",
			width: "92%",
			itemGap: 16,
			textStyle: { fontSize: 11, color: "#e4e4e7" },
			pageTextStyle: { color: "#d4d4d8" },
		},
		grid: {
			left: 72,
			right: 28,
			top: 40,
			bottom: 48,
			containLabel: true,
		},
		xAxis: {
			type: "value",
			name: "ms",
			nameLocation: "middle",
			nameGap: 30,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			axisLabel: {
				show: true,
				color: "#d4d4d8",
				fontSize: 11,
				hideOverlap: false,
			},
		},
		yAxis: {
			type: "value",
			name: yName,
			nameLocation: "middle",
			nameGap: 50,
			nameTextStyle: { fontSize: 11, color: "#a1a1aa" },
			scale: !integerAxis,
			min: integerAxis ? 0 : undefined,
			minInterval: integerAxis ? 1 : undefined,
			axisLine: { show: true, lineStyle: { color: "#52525b" } },
			axisTick: { show: true, lineStyle: { color: "#52525b" } },
			splitLine: {
				show: true,
				lineStyle: { color: "rgba(255,255,255,0.08)" },
			},
			axisLabel: {
				show: true,
				color: "#e4e4e7",
				fontSize: 11,
				margin: 10,
				hideOverlap: false,
				formatter: integerAxis
					? (value: number): string => String(Math.round(value))
					: (value: number): string => {
							if (!Number.isFinite(value)) {
								return "";
							}
							if (Math.abs(value) >= 10) {
								return value.toFixed(1);
							}
							if (Math.abs(value) >= 1) {
								return value.toFixed(2);
							}
							return value.toFixed(3);
						},
			},
		},
		series: series.map((entry) => ({
			name: entry.name,
			type: "line",
			showSymbol: false,
			step: integerAxis ? "end" : undefined,
			data: entry.data,
		})),
	};
}

function SlowlogSection({
	slowlog,
	slowlogSlowerThanUs,
}: {
	slowlog: RedisSlowLogEntryView[];
	slowlogSlowerThanUs: number;
}): JSX.Element {
	const slowlogBars = useMemo(() => buildTopSlowlogBars(slowlog), [slowlog]);
	const chartOption = useMemo(() => topSlowlogBarOption(slowlog), [slowlog]);
	const sortedEntries = useMemo(
		() => [...slowlog].sort((a, b) => b.durationUs - a.durationUs),
		[slowlog],
	);
	const [hover, setHover] = useState<{
		instruction: string;
		durationMs: number;
		command: string;
		x: number;
		y: number;
	} | null>(null);

	const onEvents = useMemo(
		() => ({
			mouseover: (params: {
				componentType?: string;
				seriesIndex?: number;
				dataIndex?: number;
				event?: { offsetX?: number; offsetY?: number };
			}): void => {
				if (
					params.componentType !== "series" ||
					params.seriesIndex !== 0 ||
					params.dataIndex === undefined
				) {
					return;
				}
				const row = slowlogBars[params.dataIndex];
				if (row === undefined) {
					return;
				}
				setHover({
					instruction: row.instruction,
					durationMs: Number((row.durationUs / 1000).toFixed(3)),
					command: formatSlowlogCommand(row.command),
					x: params.event?.offsetX ?? 0,
					y: params.event?.offsetY ?? 0,
				});
			},
			globalout: (): void => {
				setHover(null);
			},
		}),
		[slowlogBars],
	);

	return (
		<div className="space-y-2 min-w-0 overflow-visible">
			<div className="text-xs text-muted-foreground">
				{LABELS.TEXT_PROFILER_REDIS_SLOWLOG_TOP_CHART_TITLE} (
				{slowlogBars.length}/{slowlog.length},{" "}
				{formatSlowlogThresholdUs(slowlogSlowerThanUs)})
			</div>
			<div className="relative z-30 overflow-visible">
				<ReactECharts
					option={chartOption}
					style={{
						height: Math.max(180, slowlogBars.length * 28 + 64),
						width: "100%",
					}}
					opts={{ renderer: "canvas" }}
					onEvents={onEvents}
					notMerge
				/>
				{hover !== null ? (
					<div
						className="pointer-events-none absolute z-[100] max-w-md rounded-md border border-zinc-600 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-50 shadow-xl"
						style={{
							left: Math.min(hover.x + 12, 280),
							top: Math.max(hover.y - 8, 4),
						}}
					>
						<div className="font-semibold">{hover.instruction}</div>
						<div className="mt-0.5 tabular-nums">
							{hover.durationMs.toFixed(2)} ms
						</div>
						<div className="mt-1 break-all font-mono text-[11px] text-zinc-300">
							{hover.command}
						</div>
					</div>
				) : null}
			</div>
			<div className="text-xs text-muted-foreground">
				{LABELS.TEXT_PROFILER_REDIS_SLOWLOG} ({slowlog.length})
			</div>
			<div className="max-h-56 overflow-y-auto overflow-x-auto rounded-md border">
				<table className="w-full text-xs">
					<thead className="sticky top-0 bg-muted/90 backdrop-blur">
						<tr className="border-b text-left">
							<th className="whitespace-nowrap px-2 py-1.5 font-medium w-[7.5rem]">
								{LABELS.TEXT_PROFILER_REDIS_SLOWLOG_DURATION}
							</th>
							<th className="px-2 py-1.5 font-medium">
								{LABELS.TEXT_PROFILER_REDIS_CMD}
							</th>
						</tr>
					</thead>
					<tbody>
						{sortedEntries.map((entry) => (
							<tr
								key={entry.id}
								className="border-b border-border/60 align-top"
							>
								<td className="whitespace-nowrap px-2 py-1 font-mono text-foreground tabular-nums">
									{formatDurationUs(entry.durationUs)}
								</td>
								<td className="px-2 py-1 font-mono break-all text-muted-foreground">
									{formatSlowlogCommand(entry.command)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

/**
 * Redis diagnostics for a profiler session: charts + slowlog + commandstats.
 * Omits long-form interpretation prose.
 */
export function RedisStressDiagnosticsPanel({
	redis,
	sessionStartedAtUnixMs,
}: RedisStressDiagnosticsPanelProps): JSX.Element {
	const duringSamples = Array.isArray(redis.duringSamples)
		? redis.duringSamples
		: [];
	const dockerStatsSamples = Array.isArray(redis.dockerStatsSamples)
		? redis.dockerStatsSamples
		: [];
	const processSamples = Array.isArray(redis.processSamples)
		? redis.processSamples
		: [];
	const after = Array.isArray(redis.after) ? redis.after : [];
	const topDeltas = Array.isArray(redis.commandstatDeltas)
		? redis.commandstatDeltas.slice(0, 12)
		: [];

	const originUnixMs = useMemo(() => {
		// Align to the stress wave (during Redis / docker stats), not profiler
		// session start — prepare can take tens of seconds before k6 begins.
		const waveTimestamps: number[] = [];
		for (const sample of duringSamples) {
			waveTimestamps.push(sample.capturedAtUnixMs);
		}
		for (const sample of dockerStatsSamples) {
			waveTimestamps.push(sample.capturedAtUnixMs);
		}
		if (waveTimestamps.length > 0) {
			return Math.min(...waveTimestamps);
		}
		const fallback: number[] = [sessionStartedAtUnixMs];
		for (const sample of processSamples) {
			fallback.push(sample.capturedAtUnixMs);
		}
		return Math.min(...fallback);
	}, [
		duringSamples,
		dockerStatsSamples,
		processSamples,
		sessionStartedAtUnixMs,
	]);

	const pingOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_REDIS_CHART_PING_AXIS,
				[
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_TRANSACTIONS,
						data: seriesForRole(
							duringSamples,
							"transactions",
							(s) => s.pingLatencyMs.avgMs,
							originUnixMs,
							YAxisValueKind.Decimal,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_ADDRESSBALANCE,
						data: seriesForRole(
							duringSamples,
							"addressbalance",
							(s) => s.pingLatencyMs.avgMs,
							originUnixMs,
							YAxisValueKind.Decimal,
						),
					},
				],
				YAxisValueKind.Decimal,
			),
		[duringSamples, originUnixMs],
	);

	const clientsOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_REDIS_CHART_CLIENTS_AXIS,
				[
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_TRANSACTIONS,
						data: seriesForRole(
							duringSamples,
							"transactions",
							(s) => s.connectedClients,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_ADDRESSBALANCE,
						data: seriesForRole(
							duringSamples,
							"addressbalance",
							(s) => s.connectedClients,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
				],
				YAxisValueKind.Integer,
			),
		[duringSamples, originUnixMs],
	);

	const opsOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_REDIS_CHART_OPS_AXIS,
				[
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_TRANSACTIONS,
						data: seriesForRole(
							duringSamples,
							"transactions",
							(s) => s.instantaneousOpsPerSec,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_ROLE_ADDRESSBALANCE,
						data: seriesForRole(
							duringSamples,
							"addressbalance",
							(s) => s.instantaneousOpsPerSec,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
				],
				YAxisValueKind.Integer,
			),
		[duringSamples, originUnixMs],
	);

	const cpuOption = useMemo(() => {
		const series = dockerStatsSeriesPresent(dockerStatsSamples).map(
			(entry) => ({
				name: entry.label,
				data: seriesForDockerStats(
					dockerStatsSamples,
					entry.role,
					(s) => Number(s.cpuPercent.toFixed(3)),
					originUnixMs,
				),
			}),
		);
		return chartOption(
			LABELS.TEXT_PROFILER_REDIS_CHART_CPU_AXIS,
			series,
			YAxisValueKind.Decimal,
		);
	}, [dockerStatsSamples, originUnixMs]);

	const memoryOption = useMemo(() => {
		const series = dockerStatsSeriesPresent(dockerStatsSamples).map(
			(entry) => ({
				name: entry.label,
				data: seriesForDockerStats(
					dockerStatsSamples,
					entry.role,
					(s) => s.memoryUsageBytes,
					originUnixMs,
				),
			}),
		);
		return memoryChartOption(series);
	}, [dockerStatsSamples, originUnixMs]);

	const dockerStatsTotals = useMemo(
		() => computeDockerStatsTotals(dockerStatsSamples),
		[dockerStatsSamples],
	);

	const commandQueueOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_REDIS_CHART_COMMAND_QUEUE_AXIS,
				[
					{
						name: LABELS.TEXT_PROFILER_REDIS_PROCESS_APIHANDLER_TX,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "apihandler",
							(s) => s.transactionsCommandQueueLength,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_PROCESS_APIHANDLER_AB,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "apihandler",
							(s) => s.addressBalanceCommandQueueLength,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_PROCESS_DBWRITER_TX,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "dbwriter",
							(s) => s.transactionsCommandQueueLength,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_PROCESS_DBWRITER_AB,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "dbwriter",
							(s) => s.addressBalanceCommandQueueLength,
							originUnixMs,
							YAxisValueKind.Integer,
						),
					},
				],
				YAxisValueKind.Integer,
			),
		[originUnixMs, processSamples],
	);

	const eventLoopOption = useMemo(
		() =>
			chartOption(
				LABELS.TEXT_PROFILER_REDIS_CHART_EVENT_LOOP_AXIS,
				[
					{
						name: LABELS.TEXT_PROFILER_REDIS_EVENT_LOOP_MEAN,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "apihandler",
							(s) => s.eventLoopDelayMeanMs,
							originUnixMs,
							YAxisValueKind.Decimal,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_EVENT_LOOP_MAX,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "apihandler",
							(s) => s.eventLoopDelayMaxMs,
							originUnixMs,
							YAxisValueKind.Decimal,
						),
					},
					{
						name: LABELS.TEXT_PROFILER_REDIS_EVENT_LOOP_P99,
						data: seriesForProcessSamplesMax(
							processSamples,
							(s) => s.service === "apihandler",
							(s) => s.eventLoopDelayP99Ms,
							originUnixMs,
							YAxisValueKind.Decimal,
						),
					},
				],
				YAxisValueKind.Decimal,
			),
		[originUnixMs, processSamples],
	);

	return (
		<div className="space-y-4 border-t pt-4">
			<h3 className="text-base font-semibold">
				{LABELS.HEADING_PROFILER_REDIS_DIAGNOSTICS}
			</h3>

			{after.length > 0 && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-sm">
					{after.map((snap) => (
						<div
							key={`${snap.role}-${snap.phase}`}
							className="rounded-md border p-3 space-y-3 min-w-0"
						>
							<div className="font-medium font-mono text-xs uppercase">
								{snap.role}
							</div>
							<div className="text-muted-foreground text-xs">
								{LABELS.TEXT_PROFILER_REDIS_APIHANDLER_REPLICAS}:{" "}
								<span className="text-foreground font-mono">
									{snap.pool.apihandlerReplicas}
								</span>
								{" · "}
								{LABELS.TEXT_PROFILER_REDIS_CONNECTED_CLIENTS}:{" "}
								<span className="text-foreground font-mono">
									{snap.connectedClients}
								</span>
								{" · "}
								{LABELS.TEXT_PROFILER_REDIS_EXPECTED_CLIENTS}:{" "}
								<span className="text-foreground font-mono">
									{snap.pool.expectedMinClients}–{snap.pool.expectedMaxClients}
								</span>
							</div>
							<div className="text-muted-foreground text-xs">
								{LABELS.TEXT_PROFILER_REDIS_PING_AVG}:{" "}
								<span className="text-foreground font-mono">
									{snap.pingLatencyMs.avgMs.toFixed(3)} ms
								</span>
								{" · "}
								{LABELS.TEXT_PROFILER_REDIS_MEMORY}:{" "}
								<span className="text-foreground font-mono">
									{snap.usedMemoryHuman}
								</span>
							</div>
							{snap.slowlog.length > 0 && (
								<SlowlogSection
									slowlog={snap.slowlog}
									slowlogSlowerThanUs={snap.slowlogSlowerThanUs}
								/>
							)}
						</div>
					))}
				</div>
			)}

			{duringSamples.length > 0 && (
				<div className="space-y-6">
					<section className="space-y-2">
						<h4 className="text-sm font-medium text-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_PING_TITLE}
						</h4>
						<ReactECharts
							option={pingOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
					</section>
					<section className="space-y-2">
						<h4 className="text-sm font-medium text-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_CLIENTS_TITLE}
						</h4>
						<ReactECharts
							option={clientsOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
					</section>
					<section className="space-y-2">
						<h4 className="text-sm font-medium text-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_OPS_TITLE}
						</h4>
						<ReactECharts
							option={opsOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
					</section>
				</div>
			)}

			{dockerStatsSamples.length > 0 && (
				<div className="space-y-6">
					<section className="space-y-2">
						<h4 className="text-sm font-medium text-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_CPU_TITLE}
						</h4>
						<ReactECharts
							option={cpuOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
						{dockerStatsTotals !== null && (
							<p className="text-xs text-muted-foreground">
								{LABELS.TEXT_PROFILER_REDIS_CHART_CPU_TOTAL_PEAK}
								{": "}
								{dockerStatsTotals.peakTotalCpuPercent.toFixed(1)}%
								{" · "}
								{LABELS.TEXT_PROFILER_REDIS_CHART_CPU_TOTAL_AVG}
								{": "}
								{dockerStatsTotals.avgTotalCpuPercent.toFixed(1)}%
							</p>
						)}
					</section>
					<section className="space-y-2">
						<h4 className="text-sm font-medium text-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_MEMORY_TITLE}
						</h4>
						<ReactECharts
							option={memoryOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
						{dockerStatsTotals !== null && (
							<p className="text-xs text-muted-foreground">
								{LABELS.TEXT_PROFILER_REDIS_CHART_MEMORY_TOTAL_PEAK}
								{": "}
								{formatBytesHuman(dockerStatsTotals.peakTotalMemoryBytes)}
								{" · "}
								{LABELS.TEXT_PROFILER_REDIS_CHART_MEMORY_TOTAL_AVG}
								{": "}
								{formatBytesHuman(dockerStatsTotals.avgTotalMemoryBytes)}
							</p>
						)}
					</section>
				</div>
			)}

			{processSamples.length > 0 && (
				<section className="space-y-6">
					<h4 className="text-sm font-medium text-foreground">
						{LABELS.TEXT_PROFILER_REDIS_PROCESS_SECTION_TITLE}
					</h4>
					<div className="space-y-2">
						<div className="text-xs text-muted-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_COMMAND_QUEUE_TITLE}
						</div>
						<ReactECharts
							option={commandQueueOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
					</div>
					<div className="space-y-2">
						<div className="text-xs text-muted-foreground">
							{LABELS.TEXT_PROFILER_REDIS_CHART_EVENT_LOOP_TITLE}
						</div>
						<ReactECharts
							option={eventLoopOption}
							style={{ height: 260, width: "100%" }}
							notMerge
						/>
					</div>
				</section>
			)}

			{topDeltas.length > 0 && (
				<div>
					<div className="text-xs text-muted-foreground mb-2">
						{LABELS.TEXT_PROFILER_REDIS_COMMANDSTATS}
					</div>
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-left">
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_PROFILER_REDIS_CMD}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_PROFILER_REDIS_CALLS}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_PROFILER_REDIS_USEC}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_PROFILER_REDIS_USEC_PER_CALL}
									</th>
								</tr>
							</thead>
							<tbody>
								{topDeltas.map((stat) => (
									<tr key={stat.command} className="border-b">
										<td className="px-3 py-2 font-mono text-xs">
											{stat.command}
										</td>
										<td className="px-3 py-2 font-mono">{stat.calls}</td>
										<td className="px-3 py-2 font-mono">{stat.usec}</td>
										<td className="px-3 py-2 font-mono">
											{stat.usecPerCall.toFixed(2)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
