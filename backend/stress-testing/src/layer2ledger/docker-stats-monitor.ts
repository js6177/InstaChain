/**
 * Host-side 1Hz container resource poller for push-stress compose services
 * during k6. Writes JSONL under STRESS_DATA_DIR for finalize.
 *
 * CPU is an **instantaneous** rate from cgroup `cpu.stat` usage deltas between
 * ticks (100% ≈ one fully busy host CPU). Podman `stats` `CPU`/`AvgCPU` is a
 * lifetime average since container start and must not be used for stress charts.
 * Memory is current cgroup `memory.current` (RSS-equivalent for the container).
 */

import { readFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { DockerService } from "@openl2/config-loader";
import {
	DockerStatsServiceRole,
	RedisDockerStatsSample,
} from "@openl2/stress-results";
import {
	composeArgv,
	resolveContainerCliForConfig,
	type StressOrchestratorConfig,
} from "../../scripts/compose";
import { redisDockerStatsPath } from "./redis-diagnostics";

interface ContainerInspectRow {
	Id?: string;
	Name?: string;
	State?: { Pid?: number; Running?: boolean };
}

interface CpuBaseline {
	usageUsec: number;
	wallUsec: number;
}

export function parsePercent(raw: string | number | undefined | null): number {
	if (raw === undefined || raw === null) {
		return 0;
	}
	if (typeof raw === "number") {
		return Number.isFinite(raw) ? raw : 0;
	}
	if (raw.length === 0) {
		return 0;
	}
	const trimmed = raw.trim().replace(/%/g, "");
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Parse docker/podman size tokens like `157.8MiB`, `1.5GB`, `1024kB`. */
export function parseDockerSizeToBytes(raw: string): number {
	const trimmed = raw.trim();
	const match = /^([0-9]*\.?[0-9]+)\s*([a-zA-Z]+)$/.exec(trimmed);
	if (match === null) {
		const asNumber = Number(trimmed);
		return Number.isFinite(asNumber) ? asNumber : 0;
	}
	const value = Number(match[1]);
	if (!Number.isFinite(value)) {
		return 0;
	}
	const unit = match[2].toLowerCase();
	const multipliers: Record<string, number> = {
		b: 1,
		kb: 1000,
		mb: 1000 ** 2,
		gb: 1000 ** 3,
		tb: 1000 ** 4,
		kib: 1024,
		mib: 1024 ** 2,
		gib: 1024 ** 3,
		tib: 1024 ** 4,
		k: 1024,
		m: 1024 ** 2,
		g: 1024 ** 3,
		t: 1024 ** 4,
	};
	const mult = multipliers[unit] ?? 1;
	return value * mult;
}

export function parseMemUsage(
	memUsage: string | number | undefined | null,
	memLimit?: number | undefined | null,
): {
	usageBytes: number;
	limitBytes: number;
} {
	if (typeof memUsage === "number") {
		return {
			usageBytes: Number.isFinite(memUsage) ? memUsage : 0,
			limitBytes:
				typeof memLimit === "number" && Number.isFinite(memLimit)
					? memLimit
					: 0,
		};
	}
	if (memUsage === undefined || memUsage === null || memUsage.length === 0) {
		return { usageBytes: 0, limitBytes: 0 };
	}
	const parts = memUsage.split("/");
	const usageRaw = (parts[0] ?? "").trim();
	const limitRaw = (parts[1] ?? "").trim();
	return {
		usageBytes: parseDockerSizeToBytes(usageRaw),
		limitBytes: parseDockerSizeToBytes(limitRaw),
	};
}

/**
 * Instantaneous CPU % from cgroup usage deltas.
 * 100 ≈ one fully busy host CPU (can exceed 100 for multi-threaded containers).
 */
export function computeInstantCpuPercent(args: {
	prevUsageUsec: number;
	prevWallUsec: number;
	usageUsec: number;
	wallUsec: number;
}): number | null {
	const deltaUsage = args.usageUsec - args.prevUsageUsec;
	const deltaWall = args.wallUsec - args.prevWallUsec;
	if (deltaWall <= 0 || deltaUsage < 0) {
		return null;
	}
	return (deltaUsage / deltaWall) * 100;
}

/** Parse `usage_usec` from a cgroup v2 `cpu.stat` file body. */
export function parseCpuStatUsageUsec(cpuStatText: string): number | null {
	const match = /^usage_usec\s+(\d+)\s*$/m.exec(cpuStatText);
	if (match === null) {
		return null;
	}
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

/** Resolve the cgroup v2 directory for a host PID (`/proc/<pid>/cgroup`). */
export function cgroupDirForHostPid(pid: number): string | null {
	if (!Number.isFinite(pid) || pid <= 0) {
		return null;
	}
	try {
		const text = readFileSync(`/proc/${pid}/cgroup`, "utf8");
		const lines = text.trim().split("\n");
		for (let i = lines.length - 1; i >= 0; i -= 1) {
			const line = lines[i] ?? "";
			const sep = line.indexOf("::");
			if (sep < 0) {
				continue;
			}
			const rel = line.slice(sep + 2).trim();
			if (rel.length === 0) {
				continue;
			}
			return join("/sys/fs/cgroup", rel);
		}
	} catch {
		return null;
	}
	return null;
}

function readCgroupUsageUsec(cgroupDir: string): number | null {
	try {
		return parseCpuStatUsageUsec(
			readFileSync(join(cgroupDir, "cpu.stat"), "utf8"),
		);
	} catch {
		return null;
	}
}

function readCgroupMemoryBytes(cgroupDir: string): {
	usageBytes: number;
	limitBytes: number;
} {
	let usageBytes = 0;
	let limitBytes = 0;
	try {
		const raw = Number(readFileSync(join(cgroupDir, "memory.current"), "utf8"));
		usageBytes = Number.isFinite(raw) ? raw : 0;
	} catch {
		usageBytes = 0;
	}
	try {
		const raw = readFileSync(join(cgroupDir, "memory.max"), "utf8").trim();
		if (raw !== "max") {
			const parsed = Number(raw);
			limitBytes = Number.isFinite(parsed) ? parsed : 0;
		}
	} catch {
		limitBytes = 0;
	}
	return { usageBytes, limitBytes };
}

/**
 * Push-stress data-path services to include in host docker/podman stats.
 * Order matters for name matching (nginx before apihandler).
 */
export const DOCKER_STATS_COMPOSE_SERVICES = [
	DockerService.REDIS_TRANSACTIONS,
	DockerService.REDIS_ADDRESSBALANCE,
	DockerService.LAYER2LEDGER_APIHANDLER_NGINX,
	DockerService.LAYER2LEDGER_APIHANDLER,
	DockerService.LAYER2LEDGER_DBWRITER,
	DockerService.LAYER2LEDGER_PGBOUNCER,
	DockerService.LAYER2LEDGER_POSTGRES,
] as const;

export function roleForContainerName(
	name: string,
): DockerStatsServiceRole | null {
	const lower = name.toLowerCase();
	// Most-specific substrings first (nginx contains "apihandler").
	if (lower.includes(DockerService.LAYER2LEDGER_APIHANDLER_NGINX)) {
		return DockerStatsServiceRole.Nginx;
	}
	if (lower.includes(DockerService.LAYER2LEDGER_APIHANDLER)) {
		return DockerStatsServiceRole.Apihandler;
	}
	if (lower.includes(DockerService.LAYER2LEDGER_DBWRITER)) {
		return DockerStatsServiceRole.Dbwriter;
	}
	if (lower.includes(DockerService.LAYER2LEDGER_PGBOUNCER)) {
		return DockerStatsServiceRole.PgBouncer;
	}
	if (lower.includes(DockerService.LAYER2LEDGER_POSTGRES)) {
		return DockerStatsServiceRole.Postgres;
	}
	if (lower.includes(DockerService.REDIS_TRANSACTIONS)) {
		return DockerStatsServiceRole.Transactions;
	}
	if (lower.includes(DockerService.REDIS_ADDRESSBALANCE)) {
		return DockerStatsServiceRole.AddressBalance;
	}
	return null;
}

async function resolveStatsContainerIds(
	config: StressOrchestratorConfig,
): Promise<string[]> {
	const ids: string[] = [];
	for (const service of DOCKER_STATS_COMPOSE_SERVICES) {
		const argv = [...composeArgv(config), "ps", "-q", service];
		const proc = Bun.spawn(argv, {
			cwd: config.root,
			env: {
				...process.env,
				ENVIRONMENT: config.environment,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
		]);
		if (exitCode !== 0) {
			continue;
		}
		for (const line of stdout.split("\n")) {
			const id = line.trim();
			if (id.length > 0) {
				ids.push(id);
			}
		}
	}
	return ids;
}

async function inspectContainers(
	config: StressOrchestratorConfig,
	containerIds: string[],
): Promise<ContainerInspectRow[]> {
	if (containerIds.length === 0) {
		return [];
	}
	const cli = resolveContainerCliForConfig();
	const proc = Bun.spawn([cli, "inspect", ...containerIds], {
		cwd: config.root,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(
			`inspect failed exit=${exitCode}: ${stderr.trim() || stdout.trim()}`,
		);
	}
	const parsed = JSON.parse(stdout) as ContainerInspectRow[];
	return Array.isArray(parsed) ? parsed : [];
}

/**
 * Sample instantaneous CPU (cgroup delta) + current memory for each container.
 * Returns no rows until each container has a prior baseline (first call seeds only).
 */
export async function captureDockerStatsTick(
	config: StressOrchestratorConfig,
	containerIds: string[],
	cpuBaselines: Map<string, CpuBaseline>,
): Promise<RedisDockerStatsSample[]> {
	if (containerIds.length === 0) {
		return [];
	}
	const inspected = await inspectContainers(config, containerIds);
	const capturedAtUnixMs = Date.now();
	const wallUsec = capturedAtUnixMs * 1000;
	const samples: RedisDockerStatsSample[] = [];

	for (const row of inspected) {
		const id = String(row.Id ?? "").trim();
		const name = String(row.Name ?? "").replace(/^\//, "");
		const role = roleForContainerName(name);
		const pid = row.State?.Pid ?? 0;
		if (id.length === 0 || role === null || !row.State?.Running || pid <= 0) {
			continue;
		}
		const cgroupDir = cgroupDirForHostPid(pid);
		if (cgroupDir === null) {
			continue;
		}
		const usageUsec = readCgroupUsageUsec(cgroupDir);
		if (usageUsec === null) {
			continue;
		}
		const mem = readCgroupMemoryBytes(cgroupDir);
		const prev = cpuBaselines.get(id);
		cpuBaselines.set(id, { usageUsec, wallUsec });
		if (prev === undefined) {
			continue;
		}
		const cpuPercent = computeInstantCpuPercent({
			prevUsageUsec: prev.usageUsec,
			prevWallUsec: prev.wallUsec,
			usageUsec,
			wallUsec,
		});
		if (cpuPercent === null) {
			continue;
		}
		const memoryPercent =
			mem.limitBytes > 0 ? (mem.usageBytes / mem.limitBytes) * 100 : 0;
		samples.push(
			new RedisDockerStatsSample({
				role,
				capturedAtUnixMs,
				containerName: name,
				cpuPercent,
				memoryUsageBytes: mem.usageBytes,
				memoryLimitBytes: mem.limitBytes,
				memoryPercent,
			}),
		);
	}
	return samples;
}

export async function runDockerStatsMonitor(options: {
	config: StressOrchestratorConfig;
	mode: string;
	intervalMs: number;
	signal: AbortSignal;
}): Promise<void> {
	const intervalMs = Math.max(100, options.intervalMs);
	const jsonlPath = redisDockerStatsPath(options.mode);
	await Bun.write(jsonlPath, "");

	let containerIds = await resolveStatsContainerIds(options.config);
	const cpuBaselines = new Map<string, CpuBaseline>();
	console.log(
		`docker-stats monitor started mode=${options.mode} interval_ms=${intervalMs} ` +
			`containers=${containerIds.length} jsonl=${jsonlPath} ` +
			`(cgroup instantaneous CPU; 100%=1 host CPU)`,
	);

	try {
		// Seed baselines so the first written tick is a real interval rate.
		if (containerIds.length > 0) {
			await captureDockerStatsTick(options.config, containerIds, cpuBaselines);
		}

		while (!options.signal.aborted) {
			const tickStarted = Date.now();
			try {
				if (containerIds.length === 0) {
					containerIds = await resolveStatsContainerIds(options.config);
					cpuBaselines.clear();
					if (containerIds.length > 0) {
						await captureDockerStatsTick(
							options.config,
							containerIds,
							cpuBaselines,
						);
					}
				}
				const samples = await captureDockerStatsTick(
					options.config,
					containerIds,
					cpuBaselines,
				);
				if (samples.length > 0) {
					await appendFile(
						jsonlPath,
						samples.map((s) => `${JSON.stringify(s)}\n`).join(""),
					);
					const summary = samples
						.map(
							(s) =>
								`${s.role} cpu=${s.cpuPercent.toFixed(2)}% ` +
								`mem=${(s.memoryUsageBytes / (1024 * 1024)).toFixed(1)}MiB`,
						)
						.join(" ");
					console.log(`docker-stats ${summary}`);
				}
			} catch (error) {
				console.warn(
					`docker-stats tick failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}

			const elapsed = Date.now() - tickStarted;
			const sleepMs = Math.max(0, intervalMs - elapsed);
			if (sleepMs > 0 && !options.signal.aborted) {
				await Promise.race([
					Bun.sleep(sleepMs),
					new Promise<void>((resolve) => {
						if (options.signal.aborted) {
							resolve();
							return;
						}
						options.signal.addEventListener("abort", () => resolve(), {
							once: true,
						});
					}),
				]);
			}
		}
	} finally {
		console.log(`docker-stats monitor stopped mode=${options.mode}`);
	}
}
