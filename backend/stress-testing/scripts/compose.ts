/**
 * Shared compose helpers for host-side stress orchestration scripts.
 */
import {
	DOCKER_TEST_COMPOSE_FILES,
	DockerComposeProfile,
	Environment,
	getProjectRoot,
	resolveComposeCommand,
	resolveContainerCli,
} from "@openl2/config-loader";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const STRESS_COMPOSE_SERVICE = {
	PrepareFinalize: "test-stress-layer2ledger",
	K6: "test-stress-k6",
	RedisCli: "test-stress-redis-cli",
} as const;

export enum RedisComposeHost {
	Transactions = "redis-transactions",
	AddressBalance = "redis-addressbalance",
}

export interface StressOrchestratorConfig {
	root: string;
	stressDataDir: string;
	txCount: number;
	concurrency: number;
	vus: number;
	settleTimeoutMs: number;
	settleConcurrency: string;
	k6MaxDuration: string;
	resultFile: string;
	apihandlerReplicas: number;
	redisLatencyEnabled: boolean;
	redisLatencyBaselineSeconds: number;
	redisDuringIntervalMs: number;
	environment: string;
}

function envInt(name: string, fallback: number): number {
	const raw = process.env[name] ?? null;
	if (raw === null || raw.length === 0) {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function envString(name: string, fallback: string): string {
	const raw = process.env[name] ?? null;
	if (raw === null || raw.length === 0) {
		return fallback;
	}
	return raw;
}

export function loadOrchestratorConfig(
	scriptDir: string = import.meta.dir,
): StressOrchestratorConfig {
	const root = getProjectRoot(scriptDir);
	const stressDataDir = envString(
		"STRESS_DATA_DIR",
		join(root, ".test-output/stress"),
	);
	mkdirSync(stressDataDir, { recursive: true });
	return {
		root,
		stressDataDir,
		txCount: envInt("STRESS_TX_COUNT", 50_000),
		concurrency: envInt("STRESS_CONCURRENCY", 2000),
		vus: envInt("STRESS_VUS", 1024),
		settleTimeoutMs: envInt("STRESS_SETTLE_TIMEOUT_MS", 600_000),
		settleConcurrency: envString("STRESS_SETTLE_CONCURRENCY", ""),
		k6MaxDuration: envString("STRESS_K6_MAX_DURATION", "15m"),
		resultFile: envString(
			"STRESS_RESULT_FILE",
			"/stress-data/test-layer2ledger-stress.throughput.json",
		),
		apihandlerReplicas: envInt("LAYER2LEDGER_APIHANDLER_REPLICAS", 8),
		redisLatencyEnabled: envString("STRESS_REDIS_LATENCY", "1") === "1",
		redisLatencyBaselineSeconds: envInt("REDIS_LATENCY_BASELINE_SECONDS", 10),
		redisDuringIntervalMs: envInt("REDIS_DURING_INTERVAL_MS", 1000),
		environment: envString("ENVIRONMENT", Environment.TEST),
	};
}

export function composeArgv(config: StressOrchestratorConfig): string[] {
	const env = {
		...process.env,
		ENVIRONMENT: config.environment,
		CONTAINER_CLI: process.env.CONTAINER_CLI ?? resolveContainerCli(),
	};
	const argv = [...resolveComposeCommand(env)];
	for (const file of DOCKER_TEST_COMPOSE_FILES) {
		argv.push("-f", file);
	}
	argv.push("--profile", DockerComposeProfile.TEST);
	return argv;
}

export function resolveContainerCliForConfig(): string {
	return resolveContainerCli({
		...process.env,
		CONTAINER_CLI: process.env.CONTAINER_CLI ?? resolveContainerCli(),
	});
}

export async function runCompose(
	config: StressOrchestratorConfig,
	args: string[],
	options: {
		env?: Record<string, string>;
		allowFailure?: boolean;
		stdout?: "inherit" | "pipe";
		stderr?: "inherit" | "pipe";
	} = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const argv = [...composeArgv(config), ...args];
	const proc = Bun.spawn(argv, {
		cwd: config.root,
		env: {
			...process.env,
			ENVIRONMENT: config.environment,
			...options.env,
		},
		stdout: options.stdout ?? "inherit",
		stderr: options.stderr ?? "inherit",
	});
	const exitCode = await proc.exited;
	const stdout =
		options.stdout === "pipe" ? await new Response(proc.stdout).text() : "";
	const stderr =
		options.stderr === "pipe" ? await new Response(proc.stderr).text() : "";
	if (exitCode !== 0 && !options.allowFailure) {
		throw new Error(
			`compose failed exit=${exitCode} cmd=${argv.join(" ")}\n${stderr}`,
		);
	}
	return { exitCode, stdout, stderr };
}

export function spawnCompose(
	config: StressOrchestratorConfig,
	args: string[],
	options: { env?: Record<string, string> } = {},
): ReturnType<typeof Bun.spawn> {
	const argv = [...composeArgv(config), ...args];
	return Bun.spawn(argv, {
		cwd: config.root,
		env: {
			...process.env,
			ENVIRONMENT: config.environment,
			...options.env,
		},
		stdout: "inherit",
		stderr: "inherit",
	});
}
