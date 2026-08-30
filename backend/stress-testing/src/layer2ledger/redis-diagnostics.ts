/**
 * Redis diagnostics for stress runs: RTT baseline, commandstats, slowlog,
 * CLIENT LIST / connection expectations, and hot-path pipelining notes.
 *
 * Collects via ioredis on the same compose network as apihandler/dbwriter.
 * Host orchestrator scripts:
 *   - scripts/redis-latency-probe.ts — redis-cli --latency baseline
 *   - cli monitor-redis — 1Hz PING + CLIENT LIST during k6
 */
import type { ProcessDiagnosticsSample, RedisDiagPhase } from "@openl2/stress-results";
import {
	RedisClientSummary,
	RedisCommandStat,
	RedisConnectionPoolAnalysis,
	RedisDuringSample,
	RedisDockerStatsSample,
	RedisInstanceRole,
	RedisInstanceSnapshot,
	RedisPingLatencyMs,
	RedisPipeliningAnalysis,
	RedisSlowLogEntry,
	RedisStressDiagnostics,
} from "@openl2/stress-results";
import type Redis from "ioredis";
import { join } from "node:path";
import { stressDataDir } from "../common";

const DEFAULT_PING_SAMPLES = 50;
const DURING_PING_SAMPLES = 10;
const DEFAULT_SLOWLOG_COUNT = 128;
const CONNECTIONS_PER_PROCESS = 1;

export function redisDiagnosticsPath(mode: string): string {
	return join(stressDataDir(), `redis-diagnostics-${mode}.json`);
}

export function redisBaselinePath(mode: string): string {
	return join(stressDataDir(), `redis-baseline-${mode}.json`);
}

export function redisDuringSamplesPath(mode: string): string {
	return join(stressDataDir(), `redis-during-${mode}.jsonl`);
}

export function redisDockerStatsPath(mode: string): string {
	return join(stressDataDir(), `redis-docker-stats-${mode}.jsonl`);
}

export function redisCliLatencyPath(mode: string, role: string): string {
	return join(stressDataDir(), `redis-cli-latency-${mode}-${role}.txt`);
}

export function redisCliLatencyHistoryPath(mode: string, role: string): string {
	return join(
		stressDataDir(),
		`redis-cli-latency-history-${mode}-${role}.txt`,
	);
}

export function layer2RedisPipeliningAnalysis(): RedisPipeliningAnalysis {
	return new RedisPipeliningAnalysis({
		enqueuePipelined: false,
		fetchPipelined: false,
		note:
			"push_transaction enqueues with a single await redis.rpush(...) " +
			"(one RTT per accepted tx). dbwriter fetch uses a single " +
			"await redis.lrange(...) (one RTT per batch window). Multi-lock " +
			"release and address-balance cache warmup do use pipelines, but " +
			"the enqueue/fetch hot path does not — at high concurrency measured " +
			"latency is often network RTT + client command queueing on the " +
			"single ioredis TCP connection, not Redis CPU. Redis command " +
			"execution is typically sub-microsecond; 30–60ms wall times are " +
			"far more consistent with connection saturation / TCP overhead " +
			"than server-side processing.",
	});
}

function parseInfoSection(info: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of info.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const colon = trimmed.indexOf(":");
		if (colon <= 0) {
			continue;
		}
		out[trimmed.slice(0, colon)] = trimmed.slice(colon + 1);
	}
	return out;
}

function parseIntField(
	fields: Record<string, string>,
	key: string,
	fallback: number,
): number {
	const raw = fields[key] ?? null;
	if (raw === null) {
		return fallback;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : fallback;
}

function parseCommandstats(info: string): RedisCommandStat[] {
	const fields = parseInfoSection(info);
	const stats: RedisCommandStat[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (!key.startsWith("cmdstat_")) {
			continue;
		}
		const command = key.slice("cmdstat_".length);
		const callsMatch = /calls=(\d+)/.exec(value);
		const usecMatch = /usec=(\d+)/.exec(value);
		const upcMatch = /usec_per_call=([0-9.]+)/.exec(value);
		const calls = callsMatch !== null ? Number(callsMatch[1]) : 0;
		const usec = usecMatch !== null ? Number(usecMatch[1]) : 0;
		const usecPerCall =
			upcMatch !== null
				? Number(upcMatch[1])
				: calls > 0
					? usec / calls
					: 0;
		stats.push(
			new RedisCommandStat({
				command,
				calls,
				usec,
				usecPerCall,
			}),
		);
	}
	stats.sort((a, b) => b.usec - a.usec);
	return stats;
}

function parseClientList(raw: string): RedisClientSummary[] {
	const clients: RedisClientSummary[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const fields: Record<string, string> = {};
		for (const part of trimmed.split(" ")) {
			const eq = part.indexOf("=");
			if (eq <= 0) {
				continue;
			}
			fields[part.slice(0, eq)] = part.slice(eq + 1);
		}
		clients.push(
			new RedisClientSummary({
				id: fields.id ?? "",
				addr: fields.addr ?? "",
				name: fields.name ?? "",
				ageSec: Number(fields.age ?? "0") || 0,
				idleSec: Number(fields.idle ?? "0") || 0,
				cmd: fields.cmd ?? "",
				flags: fields.flags ?? "",
			}),
		);
	}
	return clients;
}

function parseSlowlog(raw: unknown): RedisSlowLogEntry[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const entries: RedisSlowLogEntry[] = [];
	for (const row of raw) {
		if (!Array.isArray(row) || row.length < 4) {
			continue;
		}
		const id = Number(row[0]);
		const timestampUnixSec = Number(row[1]);
		const durationUs = Number(row[2]);
		const commandRaw = row[3];
		const command = Array.isArray(commandRaw)
			? commandRaw.map(String)
			: [String(commandRaw)];
		const clientAddr = row.length > 4 ? String(row[4]) : "";
		const clientName = row.length > 5 ? String(row[5]) : "";
		entries.push(
			new RedisSlowLogEntry({
				id: Number.isFinite(id) ? id : 0,
				timestampUnixSec: Number.isFinite(timestampUnixSec)
					? timestampUnixSec
					: 0,
				durationUs: Number.isFinite(durationUs) ? durationUs : 0,
				command,
				clientAddr,
				clientName,
			}),
		);
	}
	return entries;
}

export async function samplePingLatency(
	redis: Redis,
	sampleCount: number,
): Promise<RedisPingLatencyMs> {
	const samples: number[] = [];
	for (let i = 0; i < sampleCount; i += 1) {
		const started = performance.now();
		await redis.ping();
		samples.push(performance.now() - started);
	}
	const minMs = Math.min(...samples);
	const maxMs = Math.max(...samples);
	const avgMs =
		samples.reduce((sum, value) => sum + value, 0) / samples.length;
	return new RedisPingLatencyMs({
		sampleCount: samples.length,
		minMs,
		avgMs,
		maxMs,
	});
}

function analyzePool(
	connectedClients: number,
	apihandlerReplicas: number,
): RedisConnectionPoolAnalysis {
	const expectedMinClients = apihandlerReplicas + 1;
	const expectedMaxClients = apihandlerReplicas + 1 + 4;
	const likelyClientSideQueueing = connectedClients <= expectedMaxClients;
	const note =
		`Ledger services use ioredis with a single TCP connection per process ` +
		`(connectionsPerProcess=${CONNECTIONS_PER_PROCESS}, no connection pool). ` +
		`With ~${apihandlerReplicas} apihandler replicas + 1 dbwriter, expect roughly ` +
		`${expectedMinClients}–${expectedMaxClients} clients on this instance. ` +
		`Observed connected_clients=${connectedClients}. ` +
		(likelyClientSideQueueing
			? "Low client count with high concurrency means many requests share " +
				"one socket and queue behind each other in the client library — " +
				"this looks identical to \"Redis is slow\" from the caller's view."
			: "Connected client count is higher than the usual ledger footprint; " +
				"inspect CLIENT LIST names/addrs for unexpected consumers.");
	return new RedisConnectionPoolAnalysis({
		connectedClients,
		expectedMinClients,
		expectedMaxClients,
		apihandlerReplicas,
		connectionsPerProcess: CONNECTIONS_PER_PROCESS,
		note,
		likelyClientSideQueueing,
	});
}

export function resolveApihandlerReplicaHint(): number {
	const raw = process.env.LAYER2LEDGER_APIHANDLER_REPLICAS ?? null;
	if (raw !== null && raw.length > 0) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed);
		}
	}
	return 8;
}

/** Lightweight 1Hz sample: PING RTT + CLIENT LIST (+ ops/sec). */
export async function captureRedisDuringSample(options: {
	redis: Redis;
	role: RedisInstanceRole;
	pingSamples?: number;
}): Promise<RedisDuringSample> {
	const pingSamples = options.pingSamples ?? DURING_PING_SAMPLES;
	const [pingLatencyMs, clientsInfo, statsInfo, clientListRaw] =
		await Promise.all([
			samplePingLatency(options.redis, pingSamples),
			options.redis.info("clients"),
			options.redis.info("stats"),
			options.redis.client("LIST"),
		]);
	const clientFields = parseInfoSection(clientsInfo);
	const stats = parseInfoSection(statsInfo);
	const clients = parseClientList(String(clientListRaw));
	return new RedisDuringSample({
		role: options.role,
		capturedAtUnixMs: Date.now(),
		pingLatencyMs,
		connectedClients: parseIntField(
			clientFields,
			"connected_clients",
			clients.length,
		),
		blockedClients: parseIntField(clientFields, "blocked_clients", 0),
		instantaneousOpsPerSec: parseIntField(
			stats,
			"instantaneous_ops_per_sec",
			0,
		),
		clients,
	});
}

export async function captureRedisInstanceSnapshot(options: {
	redis: Redis;
	role: RedisInstanceRole;
	host: string;
	port: number;
	phase: RedisDiagPhase;
	apihandlerReplicas: number;
	pingSamples?: number;
	slowlogCount?: number;
}): Promise<RedisInstanceSnapshot> {
	const pingSamples = options.pingSamples ?? DEFAULT_PING_SAMPLES;
	const slowlogCount = options.slowlogCount ?? DEFAULT_SLOWLOG_COUNT;

	const [
		pingLatencyMs,
		infoAll,
		infoCommandstats,
		clientListRaw,
		slowlogRaw,
		slowlogConfig,
	] = await Promise.all([
		samplePingLatency(options.redis, pingSamples),
		options.redis.info(),
		options.redis.info("commandstats"),
		options.redis.client("LIST"),
		options.redis.slowlog("GET", slowlogCount),
		options.redis.config("GET", "slowlog-log-slower-than"),
	]);

	const info = parseInfoSection(infoAll);
	const clients = parseClientList(String(clientListRaw));
	const connectedClients = parseIntField(
		info,
		"connected_clients",
		clients.length,
	);
	const slowlogSlowerThanUs = Array.isArray(slowlogConfig)
		? Number(slowlogConfig[1] ?? "10000") || 10000
		: 10000;

	return new RedisInstanceSnapshot({
		role: options.role,
		host: options.host,
		port: options.port,
		phase: options.phase,
		capturedAtUnixMs: Date.now(),
		pingLatencyMs,
		connectedClients,
		blockedClients: parseIntField(info, "blocked_clients", 0),
		usedMemoryHuman: info.used_memory_human ?? "unknown",
		instantaneousOpsPerSec: parseIntField(
			info,
			"instantaneous_ops_per_sec",
			0,
		),
		totalCommandsProcessed: parseIntField(
			info,
			"total_commands_processed",
			0,
		),
		slowlogSlowerThanUs,
		commandstats: parseCommandstats(infoCommandstats),
		slowlog: parseSlowlog(slowlogRaw),
		clients,
		pool: analyzePool(connectedClients, options.apihandlerReplicas),
	});
}

export async function resetRedisSlowlog(redis: Redis): Promise<void> {
	await redis.slowlog("RESET");
}

export function diffCommandstats(
	baseline: RedisInstanceSnapshot[],
	after: RedisInstanceSnapshot[],
): RedisCommandStat[] {
	const byKey = new Map<string, { calls: number; usec: number }>();
	for (const snap of after) {
		for (const stat of snap.commandstats) {
			const key = `${snap.role}:${stat.command}`;
			const prev = byKey.get(key) ?? { calls: 0, usec: 0 };
			byKey.set(key, {
				calls: prev.calls + stat.calls,
				usec: prev.usec + stat.usec,
			});
		}
	}
	for (const snap of baseline) {
		for (const stat of snap.commandstats) {
			const key = `${snap.role}:${stat.command}`;
			const prev = byKey.get(key);
			if (prev === undefined) {
				continue;
			}
			byKey.set(key, {
				calls: Math.max(prev.calls - stat.calls, 0),
				usec: Math.max(prev.usec - stat.usec, 0),
			});
		}
	}
	const deltas: RedisCommandStat[] = [];
	for (const [key, value] of byKey.entries()) {
		if (value.calls <= 0 && value.usec <= 0) {
			continue;
		}
		deltas.push(
			new RedisCommandStat({
				command: key,
				calls: value.calls,
				usec: value.usec,
				usecPerCall: value.calls > 0 ? value.usec / value.calls : 0,
			}),
		);
	}
	deltas.sort((a, b) => b.usec - a.usec);
	return deltas;
}

function summarizeDuringSamples(samples: RedisDuringSample[]): string[] {
	if (samples.length === 0) {
		return [
			"No 1Hz during-stress samples found (monitor-redis may have been skipped).",
		];
	}
	const lines: string[] = [];
	for (const role of [
		RedisInstanceRole.Transactions,
		RedisInstanceRole.AddressBalance,
	]) {
		const roleSamples = samples.filter((sample) => sample.role === role);
		if (roleSamples.length === 0) {
			continue;
		}
		const pingAvgs = roleSamples.map((s) => s.pingLatencyMs.avgMs);
		const clientCounts = roleSamples.map((s) => s.connectedClients);
		const ops = roleSamples.map((s) => s.instantaneousOpsPerSec);
		const pingMin = Math.min(...pingAvgs);
		const pingMax = Math.max(...pingAvgs);
		const pingAvg =
			pingAvgs.reduce((sum, value) => sum + value, 0) / pingAvgs.length;
		const clientsMin = Math.min(...clientCounts);
		const clientsMax = Math.max(...clientCounts);
		const opsMax = Math.max(...ops);
		lines.push(
			`[${role}] during 1Hz samples=${roleSamples.length} ` +
				`ping_avg_ms min/avg/max=${pingMin.toFixed(3)}/${pingAvg.toFixed(3)}/${pingMax.toFixed(3)} ` +
				`connected_clients min/max=${clientsMin}/${clientsMax} ` +
				`peak_ops_per_sec=${opsMax}`,
		);
	}
	return lines;
}

function buildInterpretation(
	baseline: RedisInstanceSnapshot[],
	after: RedisInstanceSnapshot[],
	duringSamples: RedisDuringSample[],
	deltas: RedisCommandStat[],
	pipelining: RedisPipeliningAnalysis,
): string[] {
	const lines: string[] = [];
	for (const snap of baseline) {
		lines.push(
			`[${snap.role}] baseline ioredis PING RTT ` +
				`min=${snap.pingLatencyMs.minMs.toFixed(3)}ms ` +
				`avg=${snap.pingLatencyMs.avgMs.toFixed(3)}ms ` +
				`max=${snap.pingLatencyMs.maxMs.toFixed(3)}ms ` +
				`(${snap.pingLatencyMs.sampleCount} samples). ` +
				`Compare to redis-cli --latency on the same compose network.`,
		);
	}
	lines.push(...summarizeDuringSamples(duringSamples));
	for (const snap of after) {
		const topSlow = snap.slowlog.slice(0, 5);
		if (topSlow.length === 0) {
			lines.push(
				`[${snap.role}] SLOWLOG empty (threshold ${snap.slowlogSlowerThanUs}µs). ` +
					`No individual commands crossed the slow threshold — prefer RTT/` +
					`queueing explanations over expensive Redis ops.`,
			);
		} else {
			const sample = topSlow
				.map(
					(entry) =>
						`${entry.command[0] ?? "?"} ${entry.durationUs}µs`,
				)
				.join(", ");
			lines.push(
				`[${snap.role}] SLOWLOG has ${snap.slowlog.length} entries ` +
					`(threshold ${snap.slowlogSlowerThanUs}µs). Top: ${sample}. ` +
					`Large SMEMBERS/KEYS/LRANGE or big value serialization show up here.`,
			);
		}
		lines.push(`[${snap.role}] ${snap.pool.note}`);
	}
	if (deltas.length > 0) {
		const top = deltas.slice(0, 8);
		const dominated = top[0] ?? null;
		const deltaLabel =
			baseline.length > 0
				? "Commandstat deltas (after − baseline)"
				: "Current commandstats (no baseline; absolute since Redis start / last RESETSTAT)";
		lines.push(
			`${deltaLabel}, top by cumulative usec: ` +
				top
					.map(
						(stat) =>
							`${stat.command} calls=${stat.calls} usec=${stat.usec} ` +
							`(~${stat.usecPerCall.toFixed(1)}µs/call)`,
					)
					.join("; "),
		);
		if (dominated !== null && deltas.length > 1) {
			const restUsec = deltas
				.slice(1)
				.reduce((sum, stat) => sum + stat.usec, 0);
			if (dominated.usec > restUsec) {
				lines.push(
					`One command type dominates cumulative time: ${dominated.command}.`,
				);
			}
		}
	}
	lines.push(pipelining.note);
	const afterPing = after[0]?.pingLatencyMs.avgMs ?? null;
	if (afterPing !== null && afterPing < 1) {
		lines.push(
			`Post-run PING RTT still sub-millisecond (~${afterPing.toFixed(3)}ms). ` +
				`If profiler Redis sections were 30–60ms, that gap is almost certainly ` +
				`client-side queueing / lack of pipelining / connection sharing — not Redis CPU.`,
		);
	}
	return lines;
}

export async function captureBothRedisSnapshots(options: {
	redisTransaction: Redis;
	redisAddressBalance: Redis;
	transactionsHost: string;
	transactionsPort: number;
	addressBalanceHost: string;
	addressBalancePort: number;
	phase: RedisDiagPhase;
	apihandlerReplicas?: number;
}): Promise<RedisInstanceSnapshot[]> {
	const replicas =
		options.apihandlerReplicas ?? resolveApihandlerReplicaHint();
	return Promise.all([
		captureRedisInstanceSnapshot({
			redis: options.redisTransaction,
			role: RedisInstanceRole.Transactions,
			host: options.transactionsHost,
			port: options.transactionsPort,
			phase: options.phase,
			apihandlerReplicas: replicas,
		}),
		captureRedisInstanceSnapshot({
			redis: options.redisAddressBalance,
			role: RedisInstanceRole.AddressBalance,
			host: options.addressBalanceHost,
			port: options.addressBalancePort,
			phase: options.phase,
			apihandlerReplicas: replicas,
		}),
	]);
}

export async function loadBaselineSnapshots(
	mode: string,
): Promise<RedisInstanceSnapshot[]> {
	const path = redisBaselinePath(mode);
	if (!(await Bun.file(path).exists())) {
		return [];
	}
	const raw = await Bun.file(path).json();
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.map((row) => RedisInstanceSnapshot.parse(row ?? null))
		.filter((row): row is RedisInstanceSnapshot => row !== null);
}

export async function writeBaselineSnapshots(
	mode: string,
	snapshots: RedisInstanceSnapshot[],
): Promise<string> {
	const path = redisBaselinePath(mode);
	await Bun.write(path, `${JSON.stringify(snapshots, null, 2)}\n`);
	return path;
}

export async function loadDuringSamples(
	mode: string,
): Promise<RedisDuringSample[]> {
	const path = redisDuringSamplesPath(mode);
	if (!(await Bun.file(path).exists())) {
		return [];
	}
	const text = (await Bun.file(path).text()).trim();
	if (text.length === 0) {
		return [];
	}
	const samples: RedisDuringSample[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		try {
			const parsed = RedisDuringSample.parse(JSON.parse(trimmed));
			if (parsed !== null) {
				samples.push(parsed);
			}
		} catch {
			// skip malformed lines
		}
	}
	return samples;
}

export async function loadDockerStatsSamples(
	mode: string,
): Promise<RedisDockerStatsSample[]> {
	const path = redisDockerStatsPath(mode);
	if (!(await Bun.file(path).exists())) {
		return [];
	}
	const text = (await Bun.file(path).text()).trim();
	if (text.length === 0) {
		return [];
	}
	const samples: RedisDockerStatsSample[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		try {
			const parsed = RedisDockerStatsSample.parse(JSON.parse(trimmed));
			if (parsed !== null) {
				samples.push(parsed);
			}
		} catch {
			// skip malformed lines
		}
	}
	return samples;
}

export async function collectRedisCliLatencyNotes(
	mode: string,
): Promise<string[]> {
	const dir = stressDataDir();
	const notes: string[] = [];
	const candidates = [
		`redis-cli-latency-${mode}-transactions.txt`,
		`redis-cli-latency-${mode}-addressbalance.txt`,
		`redis-cli-latency-history-${mode}-transactions.txt`,
		`redis-cli-latency-history-${mode}-addressbalance.txt`,
	];
	for (const name of candidates) {
		const path = join(dir, name);
		if (!(await Bun.file(path).exists())) {
			continue;
		}
		const text = (await Bun.file(path).text()).trim();
		if (text.length === 0) {
			continue;
		}
		const preview = text.split("\n").slice(-8).join(" | ");
		notes.push(`${name}: ${preview}`);
	}
	return notes;
}

export async function buildRedisStressDiagnostics(options: {
	mode: string;
	baseline: RedisInstanceSnapshot[];
	after: RedisInstanceSnapshot[];
	duringSamples?: RedisDuringSample[];
	dockerStatsSamples?: RedisDockerStatsSample[];
	processSamples?: ProcessDiagnosticsSample[];
}): Promise<RedisStressDiagnostics> {
	const pipelining = layer2RedisPipeliningAnalysis();
	const duringSamples =
		options.duringSamples ?? (await loadDuringSamples(options.mode));
	const dockerStatsSamples =
		options.dockerStatsSamples ??
		(await loadDockerStatsSamples(options.mode));
	const processSamples = options.processSamples ?? [];
	const commandstatDeltas = diffCommandstats(
		options.baseline,
		options.after,
	);
	const redisCliLatencyNotes = await collectRedisCliLatencyNotes(
		options.mode,
	);
	const interpretation = buildInterpretation(
		options.baseline,
		options.after,
		duringSamples,
		commandstatDeltas,
		pipelining,
	);
	if (dockerStatsSamples.length > 0) {
		interpretation.push(
			`Host docker/podman stats: ${dockerStatsSamples.length} samples ` +
				`(1Hz CPU% + memory for Redis, apihandler, dbwriter, nginx, pgbouncer, postgres).`,
		);
	} else {
		interpretation.push(
			"No host docker/podman stats samples found; orchestrator should poll " +
				"`docker stats` during k6.",
		);
	}
	if (processSamples.length > 0) {
		interpretation.push(
			`Process diagnostics: ${processSamples.length} samples ` +
				`(500ms ioredis commandQueue.length + event-loop delay mean/max/p99).`,
		);
	} else {
		interpretation.push(
			"No process diagnostics samples found; apihandler/dbwriter should sample " +
				"when redis-diagnostics is configured.",
		);
	}
	if (redisCliLatencyNotes.length > 0) {
		interpretation.push(
			`redis-cli latency probe output (same compose network path): ` +
				redisCliLatencyNotes.join(" ;; "),
		);
	} else {
		interpretation.push(
			"No redis-cli --latency files found under STRESS_DATA_DIR; " +
				"orchestrator should run scripts/redis-latency-probe.ts before k6.",
		);
	}
	return new RedisStressDiagnostics({
		mode: options.mode,
		pipelining,
		baseline: options.baseline,
		after: options.after,
		duringSamples,
		dockerStatsSamples,
		processSamples,
		commandstatDeltas,
		redisCliLatencyNotes,
		interpretation,
	});
}

export function printRedisDiagnostics(report: RedisStressDiagnostics): void {
	console.log("");
	console.log(`======== redis diagnostics mode=${report.mode} ========`);
	for (const line of report.interpretation) {
		console.log(`redis-diag: ${line}`);
	}
	if (report.commandstatDeltas.length > 0) {
		console.log("redis-diag: top commandstat deltas:");
		for (const stat of report.commandstatDeltas.slice(0, 12)) {
			console.log(
				`  ${stat.command} calls=${stat.calls} usec=${stat.usec} ` +
					`usec_per_call=${stat.usecPerCall.toFixed(2)}`,
			);
		}
	}
	for (const snap of report.after) {
		if (snap.slowlog.length === 0) {
			continue;
		}
		console.log(
			`redis-diag: [${snap.role}] slowlog (threshold ${snap.slowlogSlowerThanUs}µs):`,
		);
		for (const entry of snap.slowlog.slice(0, 10)) {
			console.log(
				`  id=${entry.id} ${entry.durationUs}µs ` +
					`cmd=${entry.command.join(" ").slice(0, 120)} ` +
					`client=${entry.clientAddr}`,
			);
		}
	}
	if (report.duringSamples.length > 0) {
		console.log(
			`redis-diag: during samples file has ${report.duringSamples.length} rows`,
		);
	}
	if (report.dockerStatsSamples.length > 0) {
		console.log(
			`redis-diag: docker stats samples file has ${report.dockerStatsSamples.length} rows`,
		);
	}
	console.log(
		`redis-diag: report file=${redisDiagnosticsPath(report.mode)}`,
	);
}
