#!/usr/bin/env bun
/**
 * Host-side orchestrator for layer2ledger push stress (prepare → k6 → finalize).
 * Invoked by `make stress-test`.
 *
 * Env (all optional):
 *   STRESS_TX_COUNT, STRESS_CONCURRENCY, STRESS_VUS,
 *   STRESS_SETTLE_TIMEOUT_MS, STRESS_SETTLE_CONCURRENCY,
 *   STRESS_K6_MAX_DURATION, STRESS_RESULT_FILE,
 *   LAYER2LEDGER_APIHANDLER_REPLICAS,
 *   STRESS_REDIS_LATENCY (1/0), REDIS_LATENCY_BASELINE_SECONDS,
 *   REDIS_DURING_INTERVAL_MS (default 1000)
 */
import { BalanceCacheMode } from "../src/layer2ledger/prepare-push";
import { runDockerStatsMonitor } from "../src/layer2ledger/docker-stats-monitor";
import {
	loadOrchestratorConfig,
	resolveContainerCliForConfig,
	runCompose,
	spawnCompose,
	STRESS_COMPOSE_SERVICE,
	type StressOrchestratorConfig,
} from "./compose";

enum StressPhase {
	Prepare = "prepare",
	Finalize = "finalize",
}

function stressEnv(
	config: StressOrchestratorConfig,
): Record<string, string> {
	return {
		STRESS_TX_COUNT: String(config.txCount),
		STRESS_CONCURRENCY: String(config.concurrency),
		STRESS_VUS: String(config.vus),
		STRESS_SETTLE_TIMEOUT_MS: String(config.settleTimeoutMs),
		STRESS_SETTLE_CONCURRENCY: config.settleConcurrency,
		STRESS_RESULT_FILE: config.resultFile,
		LAYER2LEDGER_APIHANDLER_REPLICAS: String(config.apihandlerReplicas),
		REDIS_DURING_INTERVAL_MS: String(config.redisDuringIntervalMs),
	};
}

async function runPrep(
	config: StressOrchestratorConfig,
	mode: BalanceCacheMode,
	phase: StressPhase,
): Promise<void> {
	await runCompose(
		config,
		[
			"run",
			"--rm",
			"--quiet-pull",
			"--no-deps",
			STRESS_COMPOSE_SERVICE.PrepareFinalize,
			phase,
			"--service",
			"layer2ledger",
			"--api",
			"push",
			"--mode",
			mode,
		],
		{ env: stressEnv(config) },
	);
}

async function runK6(config: StressOrchestratorConfig): Promise<void> {
	const result = await runCompose(
		config,
		[
			"run",
			"--rm",
			"--quiet-pull",
			"--no-deps",
			STRESS_COMPOSE_SERVICE.K6,
		],
		{
			env: {
				STRESS_VUS: String(config.vus),
				STRESS_K6_MAX_DURATION: config.k6MaxDuration,
			},
			allowFailure: true,
		},
	);
	if (result.exitCode !== 0) {
		console.log(
			"k6 exited non-zero (thresholds/errors); continuing to finalize",
		);
	}
}

async function runRedisCliBaseline(
	config: StressOrchestratorConfig,
	mode: BalanceCacheMode,
): Promise<void> {
	if (!config.redisLatencyEnabled) {
		console.log(
			`skipping redis-cli latency probe (STRESS_REDIS_LATENCY=${process.env.STRESS_REDIS_LATENCY ?? "0"})`,
		);
		return;
	}
	const probe = Bun.spawn(
		[
			"bun",
			`${config.root}/backend/stress-testing/scripts/redis-latency-probe.ts`,
			"baseline",
			mode,
		],
		{
			cwd: config.root,
			env: {
				...process.env,
				STRESS_DATA_DIR: config.stressDataDir,
				REDIS_LATENCY_BASELINE_SECONDS: String(
					config.redisLatencyBaselineSeconds,
				),
				ENVIRONMENT: config.environment,
			},
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	const code = await probe.exited;
	if (code !== 0) {
		console.warn(
			`warning: redis latency probe baseline failed exit=${code}; continuing`,
		);
	}
}

function startDuringMonitor(
	config: StressOrchestratorConfig,
	mode: BalanceCacheMode,
): ReturnType<typeof Bun.spawn> | null {
	if (!config.redisLatencyEnabled) {
		return null;
	}
	console.log(
		`======== redis during-monitor start mode=${mode} interval_ms=${config.redisDuringIntervalMs} ========`,
	);
	return spawnCompose(
		config,
		[
			"run",
			"--rm",
			"--quiet-pull",
			"--no-deps",
			"--name",
			`stress-redis-monitor-${mode}`,
			STRESS_COMPOSE_SERVICE.PrepareFinalize,
			"monitor-redis",
			"--mode",
			mode,
			"--interval-ms",
			String(config.redisDuringIntervalMs),
		],
		{ env: stressEnv(config) },
	);
}

async function stopDuringMonitor(
	config: StressOrchestratorConfig,
	mode: BalanceCacheMode,
	proc: ReturnType<typeof Bun.spawn> | null,
): Promise<void> {
	if (proc === null) {
		return;
	}
	console.log(`======== redis during-monitor stop mode=${mode} ========`);
	const containerName = `stress-redis-monitor-${mode}`;
	proc.kill("SIGTERM");
	const cli = resolveContainerCliForConfig();
	const stop = Bun.spawn([cli, "rm", "-f", containerName], {
		cwd: config.root,
		stdout: "pipe",
		stderr: "pipe",
	});
	await stop.exited;
	await Promise.race([
		proc.exited,
		Bun.sleep(5_000).then(() => {
			proc.kill("SIGKILL");
		}),
	]);
}

async function runMode(
	config: StressOrchestratorConfig,
	mode: BalanceCacheMode,
): Promise<void> {
	console.log("");
	console.log(`======== stress prepare mode=${mode} ========`);
	await runPrep(config, mode, StressPhase.Prepare);

	console.log("");
	await runRedisCliBaseline(config, mode);
	const monitor = startDuringMonitor(config, mode);
	const dockerStatsAbort = new AbortController();
	const dockerStatsPromise =
		config.redisLatencyEnabled
			? runDockerStatsMonitor({
					config,
					mode,
					intervalMs: config.redisDuringIntervalMs,
					signal: dockerStatsAbort.signal,
				})
			: Promise.resolve();

	console.log("");
	console.log(`======== stress k6 mode=${mode} ========`);
	try {
		await runK6(config);
	} finally {
		dockerStatsAbort.abort();
		await stopDuringMonitor(config, mode, monitor);
		await dockerStatsPromise;
	}

	console.log("");
	console.log(`======== stress finalize mode=${mode} ========`);
	await runPrep(config, mode, StressPhase.Finalize);
}

async function main(): Promise<void> {
	const config = loadOrchestratorConfig();
	process.chdir(config.root);
	process.env.STRESS_DATA_DIR = config.stressDataDir;
	for (const mode of [BalanceCacheMode.Cold, BalanceCacheMode.Warm]) {
		await runMode(config, mode);
	}
}

await main();
