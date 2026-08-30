import { isStructuredObject } from "./json";

/** Which Redis role in the ledger stack. */
export enum RedisInstanceRole {
	Transactions = "transactions",
	AddressBalance = "addressbalance",
}

/**
 * Compose services included in host `docker stats` / `podman stats` sampling
 * during stress (push data path). Redis roles reuse {@link RedisInstanceRole}
 * string values for backward-compatible JSON.
 */
export enum DockerStatsServiceRole {
	Transactions = "transactions",
	AddressBalance = "addressbalance",
	Apihandler = "apihandler",
	Dbwriter = "dbwriter",
	Nginx = "nginx",
	Postgres = "postgres",
	PgBouncer = "pgbouncer",
}

const DOCKER_STATS_SERVICE_ROLES = new Set<string>(
	Object.values(DockerStatsServiceRole),
);

export function parseDockerStatsServiceRole(
	raw: unknown,
): DockerStatsServiceRole | null {
	if (typeof raw !== "string") {
		return null;
	}
	return DOCKER_STATS_SERVICE_ROLES.has(raw)
		? (raw as DockerStatsServiceRole)
		: null;
}

/** When a Redis diagnostic snapshot was taken relative to the stress wave. */
export enum RedisDiagPhase {
	Baseline = "baseline",
	During = "during",
	After = "after",
}

/**
 * Mode label for Redis diagnostic output files / reports.
 * Cold/warm push runs use BalanceCacheMode string values instead.
 */
export enum RedisDiagnosticsMode {
	Adhoc = "adhoc",
}

export class RedisPingLatencyMs {
	readonly sampleCount: number;
	readonly minMs: number;
	readonly avgMs: number;
	readonly maxMs: number;

	constructor(init: RedisPingLatencyMs) {
		this.sampleCount = init.sampleCount;
		this.minMs = init.minMs;
		this.avgMs = init.avgMs;
		this.maxMs = init.maxMs;
	}

	static parse(data: RedisPingLatencyMs | null): RedisPingLatencyMs | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisPingLatencyMs;
		return new RedisPingLatencyMs({
			sampleCount: typed.sampleCount,
			minMs: typed.minMs,
			avgMs: typed.avgMs,
			maxMs: typed.maxMs,
		});
	}
}

export class RedisCommandStat {
	readonly command: string;
	readonly calls: number;
	readonly usec: number;
	readonly usecPerCall: number;

	constructor(init: RedisCommandStat) {
		this.command = init.command;
		this.calls = init.calls;
		this.usec = init.usec;
		this.usecPerCall = init.usecPerCall;
	}

	static parse(data: RedisCommandStat | null): RedisCommandStat | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisCommandStat;
		return new RedisCommandStat({
			command: typed.command,
			calls: typed.calls,
			usec: typed.usec,
			usecPerCall: typed.usecPerCall,
		});
	}
}

export class RedisSlowLogEntry {
	readonly id: number;
	readonly timestampUnixSec: number;
	readonly durationUs: number;
	readonly command: string[];
	readonly clientAddr: string;
	readonly clientName: string;

	constructor(init: RedisSlowLogEntry) {
		this.id = init.id;
		this.timestampUnixSec = init.timestampUnixSec;
		this.durationUs = init.durationUs;
		this.command = init.command;
		this.clientAddr = init.clientAddr;
		this.clientName = init.clientName;
	}

	static parse(data: RedisSlowLogEntry | null): RedisSlowLogEntry | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisSlowLogEntry;
		const command = Array.isArray(typed.command)
			? typed.command.map(String)
			: [];
		return new RedisSlowLogEntry({
			id: typed.id,
			timestampUnixSec: typed.timestampUnixSec,
			durationUs: typed.durationUs,
			command,
			clientAddr: typed.clientAddr,
			clientName: typed.clientName,
		});
	}
}

export class RedisClientSummary {
	readonly id: string;
	readonly addr: string;
	readonly name: string;
	readonly ageSec: number;
	readonly idleSec: number;
	readonly cmd: string;
	readonly flags: string;

	constructor(init: RedisClientSummary) {
		this.id = init.id;
		this.addr = init.addr;
		this.name = init.name;
		this.ageSec = init.ageSec;
		this.idleSec = init.idleSec;
		this.cmd = init.cmd;
		this.flags = init.flags;
	}

	static parse(data: RedisClientSummary | null): RedisClientSummary | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisClientSummary;
		return new RedisClientSummary({
			id: typed.id,
			addr: typed.addr,
			name: typed.name,
			ageSec: typed.ageSec,
			idleSec: typed.idleSec,
			cmd: typed.cmd,
			flags: typed.flags,
		});
	}
}

/**
 * Expected vs observed TCP clients for one Redis instance.
 * Ledger services use one ioredis connection per process (no pool).
 */
export class RedisConnectionPoolAnalysis {
	readonly connectedClients: number;
	readonly expectedMinClients: number;
	readonly expectedMaxClients: number;
	readonly apihandlerReplicas: number;
	readonly connectionsPerProcess: number;
	readonly note: string;
	readonly likelyClientSideQueueing: boolean;

	constructor(init: RedisConnectionPoolAnalysis) {
		this.connectedClients = init.connectedClients;
		this.expectedMinClients = init.expectedMinClients;
		this.expectedMaxClients = init.expectedMaxClients;
		this.apihandlerReplicas = init.apihandlerReplicas;
		this.connectionsPerProcess = init.connectionsPerProcess;
		this.note = init.note;
		this.likelyClientSideQueueing = init.likelyClientSideQueueing;
	}

	static parse(
		data: RedisConnectionPoolAnalysis | null,
	): RedisConnectionPoolAnalysis | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisConnectionPoolAnalysis;
		return new RedisConnectionPoolAnalysis({
			connectedClients: typed.connectedClients,
			expectedMinClients: typed.expectedMinClients,
			expectedMaxClients: typed.expectedMaxClients,
			apihandlerReplicas: typed.apihandlerReplicas,
			connectionsPerProcess: typed.connectionsPerProcess,
			note: typed.note,
			likelyClientSideQueueing: typed.likelyClientSideQueueing,
		});
	}
}

export class RedisPipeliningAnalysis {
	readonly enqueuePipelined: boolean;
	readonly fetchPipelined: boolean;
	readonly note: string;

	constructor(init: RedisPipeliningAnalysis) {
		this.enqueuePipelined = init.enqueuePipelined;
		this.fetchPipelined = init.fetchPipelined;
		this.note = init.note;
	}

	static parse(
		data: RedisPipeliningAnalysis | null,
	): RedisPipeliningAnalysis | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisPipeliningAnalysis;
		return new RedisPipeliningAnalysis({
			enqueuePipelined: typed.enqueuePipelined,
			fetchPipelined: typed.fetchPipelined,
			note: typed.note,
		});
	}
}

/** One 1Hz sample during the k6 wave (PING RTT + CLIENT LIST). */
export class RedisDuringSample {
	readonly role: RedisInstanceRole;
	readonly capturedAtUnixMs: number;
	readonly pingLatencyMs: RedisPingLatencyMs;
	readonly connectedClients: number;
	readonly blockedClients: number;
	readonly instantaneousOpsPerSec: number;
	readonly clients: RedisClientSummary[];

	constructor(init: RedisDuringSample) {
		this.role = init.role;
		this.capturedAtUnixMs = init.capturedAtUnixMs;
		this.pingLatencyMs = init.pingLatencyMs;
		this.connectedClients = init.connectedClients;
		this.blockedClients = init.blockedClients;
		this.instantaneousOpsPerSec = init.instantaneousOpsPerSec;
		this.clients = init.clients;
	}

	static parse(data: RedisDuringSample | null): RedisDuringSample | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisDuringSample;
		const ping = RedisPingLatencyMs.parse(typed.pingLatencyMs ?? null);
		if (ping === null) {
			return null;
		}
		const clients = Array.isArray(typed.clients)
			? typed.clients
					.map((row) => RedisClientSummary.parse(row ?? null))
					.filter((row): row is RedisClientSummary => row !== null)
			: [];
		const role =
			typed.role === RedisInstanceRole.AddressBalance
				? RedisInstanceRole.AddressBalance
				: RedisInstanceRole.Transactions;
		return new RedisDuringSample({
			role,
			capturedAtUnixMs: typed.capturedAtUnixMs,
			pingLatencyMs: ping,
			connectedClients: typed.connectedClients,
			blockedClients: typed.blockedClients,
			instantaneousOpsPerSec: typed.instantaneousOpsPerSec,
			clients,
		});
	}
}

/** Which Bun process emitted a process-diagnostics sample. */
export enum ProcessDiagnosticsService {
	Apihandler = "apihandler",
	Dbwriter = "dbwriter",
}

/**
 * One 500ms sample of ioredis client queue depth + Bun event-loop delay
 * from an apihandler/dbwriter replica.
 */
export class ProcessDiagnosticsSample {
	readonly service: ProcessDiagnosticsService;
	readonly replicaId: string;
	readonly capturedAtUnixMs: number;
	/** `redis.commandQueue.length` for the transactions Redis client. */
	readonly transactionsCommandQueueLength: number;
	/** `redis.commandQueue.length` for the address-balance Redis client. */
	readonly addressBalanceCommandQueueLength: number;
	/** Event-loop delay histogram mean for the sample window (ms). */
	readonly eventLoopDelayMeanMs: number;
	/** Event-loop delay histogram max for the sample window (ms). */
	readonly eventLoopDelayMaxMs: number;
	/** Event-loop delay histogram p99 for the sample window (ms). */
	readonly eventLoopDelayP99Ms: number;

	constructor(init: ProcessDiagnosticsSample) {
		this.service = init.service;
		this.replicaId = init.replicaId;
		this.capturedAtUnixMs = init.capturedAtUnixMs;
		this.transactionsCommandQueueLength = init.transactionsCommandQueueLength;
		this.addressBalanceCommandQueueLength =
			init.addressBalanceCommandQueueLength;
		this.eventLoopDelayMeanMs = init.eventLoopDelayMeanMs;
		this.eventLoopDelayMaxMs = init.eventLoopDelayMaxMs;
		this.eventLoopDelayP99Ms = init.eventLoopDelayP99Ms;
	}

	static parse(
		data: ProcessDiagnosticsSample | null,
	): ProcessDiagnosticsSample | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as ProcessDiagnosticsSample;
		if (
			typeof typed.capturedAtUnixMs !== "number" ||
			typeof typed.transactionsCommandQueueLength !== "number" ||
			typeof typed.addressBalanceCommandQueueLength !== "number" ||
			typeof typed.eventLoopDelayMeanMs !== "number" ||
			typeof typed.eventLoopDelayMaxMs !== "number" ||
			typeof typed.eventLoopDelayP99Ms !== "number"
		) {
			return null;
		}
		const service =
			typed.service === ProcessDiagnosticsService.Dbwriter
				? ProcessDiagnosticsService.Dbwriter
				: ProcessDiagnosticsService.Apihandler;
		return new ProcessDiagnosticsSample({
			service,
			replicaId: String(typed.replicaId ?? ""),
			capturedAtUnixMs: typed.capturedAtUnixMs,
			transactionsCommandQueueLength: typed.transactionsCommandQueueLength,
			addressBalanceCommandQueueLength: typed.addressBalanceCommandQueueLength,
			eventLoopDelayMeanMs: typed.eventLoopDelayMeanMs,
			eventLoopDelayMaxMs: typed.eventLoopDelayMaxMs,
			eventLoopDelayP99Ms: typed.eventLoopDelayP99Ms,
		});
	}
}

/**
 * One 1Hz host `docker stats` / `podman stats` sample for a compose service
 * container during the stress wave (Redis, apihandler replicas, dbwriter, etc.).
 */
export class RedisDockerStatsSample {
	readonly role: DockerStatsServiceRole;
	readonly capturedAtUnixMs: number;
	readonly containerName: string;
	/** CPU usage percent (0–100+ under multi-core). */
	readonly cpuPercent: number;
	readonly memoryUsageBytes: number;
	readonly memoryLimitBytes: number;
	readonly memoryPercent: number;

	constructor(init: RedisDockerStatsSample) {
		this.role = init.role;
		this.capturedAtUnixMs = init.capturedAtUnixMs;
		this.containerName = init.containerName;
		this.cpuPercent = init.cpuPercent;
		this.memoryUsageBytes = init.memoryUsageBytes;
		this.memoryLimitBytes = init.memoryLimitBytes;
		this.memoryPercent = init.memoryPercent;
	}

	static parse(
		data: RedisDockerStatsSample | null,
	): RedisDockerStatsSample | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisDockerStatsSample;
		if (
			typeof typed.capturedAtUnixMs !== "number" ||
			typeof typed.cpuPercent !== "number" ||
			typeof typed.memoryUsageBytes !== "number" ||
			typeof typed.memoryLimitBytes !== "number" ||
			typeof typed.memoryPercent !== "number"
		) {
			return null;
		}
		const role = parseDockerStatsServiceRole(typed.role);
		if (role === null) {
			return null;
		}
		return new RedisDockerStatsSample({
			role,
			capturedAtUnixMs: typed.capturedAtUnixMs,
			containerName: String(typed.containerName ?? ""),
			cpuPercent: typed.cpuPercent,
			memoryUsageBytes: typed.memoryUsageBytes,
			memoryLimitBytes: typed.memoryLimitBytes,
			memoryPercent: typed.memoryPercent,
		});
	}
}

export class RedisInstanceSnapshot {
	readonly role: RedisInstanceRole;
	readonly host: string;
	readonly port: number;
	readonly phase: RedisDiagPhase;
	readonly capturedAtUnixMs: number;
	readonly pingLatencyMs: RedisPingLatencyMs;
	readonly connectedClients: number;
	readonly blockedClients: number;
	readonly usedMemoryHuman: string;
	readonly instantaneousOpsPerSec: number;
	readonly totalCommandsProcessed: number;
	readonly slowlogSlowerThanUs: number;
	readonly commandstats: RedisCommandStat[];
	readonly slowlog: RedisSlowLogEntry[];
	readonly clients: RedisClientSummary[];
	readonly pool: RedisConnectionPoolAnalysis;

	constructor(init: RedisInstanceSnapshot) {
		this.role = init.role;
		this.host = init.host;
		this.port = init.port;
		this.phase = init.phase;
		this.capturedAtUnixMs = init.capturedAtUnixMs;
		this.pingLatencyMs = init.pingLatencyMs;
		this.connectedClients = init.connectedClients;
		this.blockedClients = init.blockedClients;
		this.usedMemoryHuman = init.usedMemoryHuman;
		this.instantaneousOpsPerSec = init.instantaneousOpsPerSec;
		this.totalCommandsProcessed = init.totalCommandsProcessed;
		this.slowlogSlowerThanUs = init.slowlogSlowerThanUs;
		this.commandstats = init.commandstats;
		this.slowlog = init.slowlog;
		this.clients = init.clients;
		this.pool = init.pool;
	}

	static parse(
		data: RedisInstanceSnapshot | null,
	): RedisInstanceSnapshot | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisInstanceSnapshot;
		const ping = RedisPingLatencyMs.parse(typed.pingLatencyMs ?? null);
		const pool = RedisConnectionPoolAnalysis.parse(typed.pool ?? null);
		if (ping === null || pool === null) {
			return null;
		}
		const commandstats = Array.isArray(typed.commandstats)
			? typed.commandstats
					.map((row) => RedisCommandStat.parse(row ?? null))
					.filter((row): row is RedisCommandStat => row !== null)
			: [];
		const slowlog = Array.isArray(typed.slowlog)
			? typed.slowlog
					.map((row) => RedisSlowLogEntry.parse(row ?? null))
					.filter((row): row is RedisSlowLogEntry => row !== null)
			: [];
		const clients = Array.isArray(typed.clients)
			? typed.clients
					.map((row) => RedisClientSummary.parse(row ?? null))
					.filter((row): row is RedisClientSummary => row !== null)
			: [];
		const role =
			typed.role === RedisInstanceRole.AddressBalance
				? RedisInstanceRole.AddressBalance
				: RedisInstanceRole.Transactions;
		const phase =
			typed.phase === RedisDiagPhase.During
				? RedisDiagPhase.During
				: typed.phase === RedisDiagPhase.After
					? RedisDiagPhase.After
					: RedisDiagPhase.Baseline;
		return new RedisInstanceSnapshot({
			role,
			host: typed.host,
			port: typed.port,
			phase,
			capturedAtUnixMs: typed.capturedAtUnixMs,
			pingLatencyMs: ping,
			connectedClients: typed.connectedClients,
			blockedClients: typed.blockedClients,
			usedMemoryHuman: typed.usedMemoryHuman,
			instantaneousOpsPerSec: typed.instantaneousOpsPerSec,
			totalCommandsProcessed: typed.totalCommandsProcessed,
			slowlogSlowerThanUs: typed.slowlogSlowerThanUs,
			commandstats,
			slowlog,
			clients,
			pool,
		});
	}
}

/** Full Redis diagnostic report for one stress mode (cold/warm/adhoc). */
export class RedisStressDiagnostics {
	readonly mode: string;
	readonly pipelining: RedisPipeliningAnalysis;
	readonly baseline: RedisInstanceSnapshot[];
	readonly after: RedisInstanceSnapshot[];
	readonly duringSamples: RedisDuringSample[];
	readonly dockerStatsSamples: RedisDockerStatsSample[];
	readonly processSamples: ProcessDiagnosticsSample[];
	readonly commandstatDeltas: RedisCommandStat[];
	readonly redisCliLatencyNotes: string[];
	readonly interpretation: string[];

	constructor(init: RedisStressDiagnostics) {
		this.mode = init.mode;
		this.pipelining = init.pipelining;
		this.baseline = init.baseline;
		this.after = init.after;
		this.duringSamples = init.duringSamples;
		this.dockerStatsSamples = init.dockerStatsSamples;
		this.processSamples = init.processSamples;
		this.commandstatDeltas = init.commandstatDeltas;
		this.redisCliLatencyNotes = init.redisCliLatencyNotes;
		this.interpretation = init.interpretation;
	}

	static parse(
		data: RedisStressDiagnostics | null,
	): RedisStressDiagnostics | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as RedisStressDiagnostics;
		const pipelining = RedisPipeliningAnalysis.parse(typed.pipelining ?? null);
		if (pipelining === null) {
			return null;
		}
		const baseline = Array.isArray(typed.baseline)
			? typed.baseline
					.map((row) => RedisInstanceSnapshot.parse(row ?? null))
					.filter((row): row is RedisInstanceSnapshot => row !== null)
			: [];
		const after = Array.isArray(typed.after)
			? typed.after
					.map((row) => RedisInstanceSnapshot.parse(row ?? null))
					.filter((row): row is RedisInstanceSnapshot => row !== null)
			: [];
		const duringSamples = Array.isArray(typed.duringSamples)
			? typed.duringSamples
					.map((row) => RedisDuringSample.parse(row ?? null))
					.filter((row): row is RedisDuringSample => row !== null)
			: [];
		const dockerStatsSamples = Array.isArray(typed.dockerStatsSamples)
			? typed.dockerStatsSamples
					.map((row) => RedisDockerStatsSample.parse(row ?? null))
					.filter((row): row is RedisDockerStatsSample => row !== null)
			: [];
		const processSamples = Array.isArray(typed.processSamples)
			? typed.processSamples
					.map((row) => ProcessDiagnosticsSample.parse(row ?? null))
					.filter((row): row is ProcessDiagnosticsSample => row !== null)
			: [];
		const commandstatDeltas = Array.isArray(typed.commandstatDeltas)
			? typed.commandstatDeltas
					.map((row) => RedisCommandStat.parse(row ?? null))
					.filter((row): row is RedisCommandStat => row !== null)
			: [];
		const redisCliLatencyNotes = Array.isArray(typed.redisCliLatencyNotes)
			? typed.redisCliLatencyNotes.map(String)
			: [];
		const interpretation = Array.isArray(typed.interpretation)
			? typed.interpretation.map(String)
			: [];
		return new RedisStressDiagnostics({
			mode: typed.mode,
			pipelining,
			baseline,
			after,
			duringSamples,
			dockerStatsSamples,
			processSamples,
			commandstatDeltas,
			redisCliLatencyNotes,
			interpretation,
		});
	}
}
