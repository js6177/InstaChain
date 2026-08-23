#!/usr/bin/env bun
/**
 * Probe Redis RTT from the compose network (same path as apihandler).
 *
 * Usage:
 *   bun scripts/redis-latency-probe.ts baseline <mode>
 *
 * Env:
 *   REDIS_LATENCY_BASELINE_SECONDS  (default 10)
 *   STRESS_DATA_DIR
 */
import { RedisInstanceRole } from "@openl2/stress-results";
import { mkdirSync } from "node:fs";
import {
	composeArgv,
	loadOrchestratorConfig,
	RedisComposeHost,
	STRESS_COMPOSE_SERVICE,
} from "./compose";

enum ProbeAction {
	Baseline = "baseline",
}

function usage(): never {
	console.error(
		"Usage: bun scripts/redis-latency-probe.ts baseline <mode>",
	);
	process.exit(2);
}

function parseAction(raw: string | null): ProbeAction {
	if (raw === ProbeAction.Baseline) {
		return raw;
	}
	usage();
}

async function runBaselineLatency(
	mode: string,
	seconds: number,
): Promise<void> {
	const config = loadOrchestratorConfig();
	mkdirSync(config.stressDataDir, { recursive: true });
	console.log(
		`======== redis-cli --latency baseline mode=${mode} (${seconds}s) ========`,
	);

	const targets: Array<{ role: RedisInstanceRole; host: RedisComposeHost }> =
		[
			{
				role: RedisInstanceRole.Transactions,
				host: RedisComposeHost.Transactions,
			},
			{
				role: RedisInstanceRole.AddressBalance,
				host: RedisComposeHost.AddressBalance,
			},
		];

	for (const target of targets) {
		const outPath = `${config.stressDataDir}/redis-cli-latency-${mode}-${target.role}.txt`;
		console.log(`probing ${target.host} -> ${outPath}`);

		const compose = composeArgv(config);
		const redisCli = Bun.spawn(
			[
				...compose,
				"run",
				"--rm",
				"--quiet-pull",
				"--no-deps",
				STRESS_COMPOSE_SERVICE.RedisCli,
				"-h",
				target.host,
				"-p",
				"6379",
				"--latency",
			],
			{
				cwd: config.root,
				env: { ...process.env, ENVIRONMENT: config.environment },
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const timeout = setTimeout(() => {
			redisCli.kill("SIGINT");
		}, seconds * 1000);

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(redisCli.stdout).text(),
			new Response(redisCli.stderr).text(),
			redisCli.exited,
		]);
		clearTimeout(timeout);

		const body = `${stdout}${stderr}`.trim();
		await Bun.write(outPath, body.length > 0 ? `${body}\n` : "");
		// SIGINT / timeout kills are expected (exit often non-zero).
		if (exitCode !== 0 && exitCode !== 130 && exitCode !== 143) {
			console.warn(
				`warning: redis-cli --latency exited rc=${exitCode} for ${target.host}`,
			);
		}
		if (body.length > 0) {
			const lines = body.split("\n").slice(-5);
			for (const line of lines) {
				console.log(line);
			}
		} else {
			console.warn(`warning: empty latency output for ${target.host}`);
		}
	}
}

async function main(): Promise<void> {
	const action = parseAction(Bun.argv[2] ?? null);
	const mode = Bun.argv[3] ?? null;
	if (mode === null || mode.length === 0) {
		usage();
	}
	const config = loadOrchestratorConfig();
	if (action === ProbeAction.Baseline) {
		await runBaselineLatency(mode, config.redisLatencyBaselineSeconds);
	}
}

await main();
