/**
 * Host-side 1Hz `docker stats` / `podman stats` poller for Redis containers
 * during k6. Writes JSONL under STRESS_DATA_DIR for finalize to embed.
 */
import {
	RedisDockerStatsSample,
	RedisInstanceRole,
} from "@openl2/stress-results";
import { appendFile } from "node:fs/promises";
import {
	composeArgv,
	RedisComposeHost,
	resolveContainerCliForConfig,
	type StressOrchestratorConfig,
} from "../../scripts/compose";
import { redisDockerStatsPath } from "./redis-diagnostics";

interface DockerStatsJsonRow {
	Name?: string;
	CPUPerc?: string;
	MemUsage?: string;
	MemPerc?: string;
}

function parsePercent(raw: string | undefined): number {
	if (raw === undefined || raw.length === 0) {
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

export function parseMemUsage(memUsage: string | undefined): {
	usageBytes: number;
	limitBytes: number;
} {
	if (memUsage === undefined || memUsage.length === 0) {
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

function roleForContainerName(name: string): RedisInstanceRole | null {
	const lower = name.toLowerCase();
	if (lower.includes(RedisComposeHost.Transactions)) {
		return RedisInstanceRole.Transactions;
	}
	if (lower.includes(RedisComposeHost.AddressBalance)) {
		return RedisInstanceRole.AddressBalance;
	}
	return null;
}

async function resolveRedisContainerIds(
	config: StressOrchestratorConfig,
): Promise<string[]> {
	const ids: string[] = [];
	for (const service of [
		RedisComposeHost.Transactions,
		RedisComposeHost.AddressBalance,
	]) {
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
		[
			cli,
			"stats",
			"--no-stream",
			"--format",
			"{{json .}}",
			...containerIds,
		],
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
		const mem = parseMemUsage(row.MemUsage);
		samples.push(
			new RedisDockerStatsSample({
				role,
				capturedAtUnixMs,
				containerName: name,
				cpuPercent: parsePercent(row.CPUPerc),
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

	let containerIds = await resolveRedisContainerIds(options.config);
	console.log(
		`docker-stats monitor started mode=${options.mode} interval_ms=${intervalMs} ` +
			`containers=${containerIds.length} jsonl=${jsonlPath}`,
	);

	try {
		while (!options.signal.aborted) {
			const tickStarted = Date.now();
			try {
				if (containerIds.length === 0) {
					containerIds = await resolveRedisContainerIds(options.config);
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
