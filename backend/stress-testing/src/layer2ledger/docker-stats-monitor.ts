/**
 * Host-side 1Hz `docker stats` / `podman stats` poller for push-stress
 * compose services during k6. Writes JSONL under STRESS_DATA_DIR for finalize.
 */

import { appendFile } from "node:fs/promises";
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

/**
 * Docker `stats --format '{{json .}}'` uses string fields (`CPUPerc`, `MemUsage`
 * like `"28.8MiB / 30.4GiB"`). Podman uses numeric bytes / percent fields
 * (`CPU`, `MemUsage`, `MemLimit`, `MemPerc`).
 */
interface DockerStatsJsonRow {
	Name?: string;
	CPUPerc?: string | number;
	/** Docker: `"used / limit"` string. Podman: usage bytes (number). */
	MemUsage?: string | number;
	/** Podman-only companion to numeric MemUsage. */
	MemLimit?: number;
	MemPerc?: string | number;
	/** Podman CPU percent (Docker uses CPUPerc). */
	CPU?: number;
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

async function captureDockerStatsTick(
	config: StressOrchestratorConfig,
	containerIds: string[],
): Promise<RedisDockerStatsSample[]> {
	if (containerIds.length === 0) {
		return [];
	}
	const cli = resolveContainerCliForConfig();
	const proc = Bun.spawn(
		[cli, "stats", "--no-stream", "--format", "{{json .}}", ...containerIds],
		{
			cwd: config.root,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(
			`stats failed exit=${exitCode}: ${stderr.trim() || stdout.trim()}`,
		);
	}
	const capturedAtUnixMs = Date.now();
	const samples: RedisDockerStatsSample[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		let row: DockerStatsJsonRow;
		try {
			row = JSON.parse(trimmed) as DockerStatsJsonRow;
		} catch {
			continue;
		}
		const name = String(row.Name ?? "");
		const role = roleForContainerName(name);
		if (role === null) {
			continue;
		}
		const mem = parseMemUsage(row.MemUsage, row.MemLimit);
		samples.push(
			new RedisDockerStatsSample({
				role,
				capturedAtUnixMs,
				containerName: name,
				cpuPercent: parsePercent(row.CPUPerc ?? row.CPU),
				memoryUsageBytes: mem.usageBytes,
				memoryLimitBytes: mem.limitBytes,
				memoryPercent: parsePercent(row.MemPerc),
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
	console.log(
		`docker-stats monitor started mode=${options.mode} interval_ms=${intervalMs} ` +
			`containers=${containerIds.length} jsonl=${jsonlPath}`,
	);

	try {
		while (!options.signal.aborted) {
			const tickStarted = Date.now();
			try {
				if (containerIds.length === 0) {
					containerIds = await resolveStatsContainerIds(options.config);
				}
				const samples = await captureDockerStatsTick(
					options.config,
					containerIds,
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
