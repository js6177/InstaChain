/**
 * CLI for OpenL2 stress orchestration.
 *
 * Usage:
 *   bun src/cli.ts prepare --service layer2ledger --api push --mode cold
 *   bun src/cli.ts finalize --service layer2ledger --api push --mode cold
 *   bun src/cli.ts diagnose-redis
 *   bun src/cli.ts monitor-redis --mode cold --interval-ms 1000
 *
 * k6 runs between prepare and finalize (see `scripts/run-layer2ledger-push.ts`).
 */
import { loadLayer2LedgerCommonConfig } from "@openl2/config-loader";
import {
	RedisDiagPhase,
	RedisDiagnosticsMode,
} from "@openl2/stress-results";
import {
	BalanceCacheMode,
	createRedisClients,
	preparePushDataset,
} from "./layer2ledger/prepare-push";
import { finalizePushStress } from "./layer2ledger/finalize-push";
import { runRedisDuringMonitor } from "./layer2ledger/redis-during-monitor";
import {
	buildRedisStressDiagnostics,
	captureBothRedisSnapshots,
	printRedisDiagnostics,
	redisDiagnosticsPath,
} from "./layer2ledger/redis-diagnostics";
import { parseCliArgs } from "./cli-args";

enum StressCommand {
	Prepare = "prepare",
	Finalize = "finalize",
	DiagnoseRedis = "diagnose-redis",
	MonitorRedis = "monitor-redis",
}

enum StressService {
	Layer2Ledger = "layer2ledger",
}

enum StressApi {
	Push = "push",
	PushTransaction = "push_transaction",
}

function usage(): never {
	console.error(`Usage:
  bun src/cli.ts prepare  --service layer2ledger --api push --mode <cold|warm>
  bun src/cli.ts finalize --service layer2ledger --api push --mode <cold|warm>
  bun src/cli.ts diagnose-redis
  bun src/cli.ts monitor-redis --mode <cold|warm> [--interval-ms 1000]
`);
	process.exit(2);
}

function requireStringFlag(
	values: Record<string, string | boolean | string[] | undefined>,
	name: string,
	fallback: string | null,
): string {
	const raw = values[name];
	if (typeof raw === "string" && raw.length > 0) {
		return raw;
	}
	if (fallback !== null) {
		return fallback;
	}
	throw new Error(`Missing required --${name}`);
}

function parseMode(mode: string): BalanceCacheMode {
	if (mode === BalanceCacheMode.Cold || mode === BalanceCacheMode.Warm) {
		return mode;
	}
	throw new Error(`Invalid --mode=${mode} (expected cold|warm)`);
}

function parseCommand(command: string | null): StressCommand {
	if (
		command === StressCommand.Prepare ||
		command === StressCommand.Finalize ||
		command === StressCommand.DiagnoseRedis ||
		command === StressCommand.MonitorRedis
	) {
		return command;
	}
	usage();
}

async function diagnoseRedisNow(): Promise<void> {
	const { redisTransaction, redisAddressBalance } = await createRedisClients();
	try {
		const endpoints = loadLayer2LedgerCommonConfig();
		const snapshots = await captureBothRedisSnapshots({
			redisTransaction,
			redisAddressBalance,
			transactionsHost: endpoints.redis_transactions.host,
			transactionsPort: endpoints.redis_transactions.port,
			addressBalanceHost: endpoints.redis_addressbalance.host,
			addressBalancePort: endpoints.redis_addressbalance.port,
			phase: RedisDiagPhase.After,
		});
		const report = await buildRedisStressDiagnostics({
			mode: RedisDiagnosticsMode.Adhoc,
			baseline: [],
			after: snapshots,
		});
		const path = redisDiagnosticsPath(RedisDiagnosticsMode.Adhoc);
		await Bun.write(path, `${JSON.stringify(report, null, 2)}\n`);
		printRedisDiagnostics(report);
	} finally {
		await redisTransaction.quit();
		await redisAddressBalance.quit();
	}
}

async function monitorRedis(mode: BalanceCacheMode, intervalMs: number): Promise<void> {
	const controller = new AbortController();
	const onSignal = (): void => {
		controller.abort();
	};
	process.on("SIGTERM", onSignal);
	process.on("SIGINT", onSignal);
	try {
		await runRedisDuringMonitor({
			mode,
			intervalMs,
			signal: controller.signal,
		});
	} finally {
		process.off("SIGTERM", onSignal);
		process.off("SIGINT", onSignal);
	}
}

async function main(): Promise<void> {
	const { values, positionals } = parseCliArgs({
		service: { type: "string" },
		api: { type: "string" },
		mode: { type: "string" },
		"interval-ms": { type: "string" },
	});

	const command = parseCommand(positionals[0] ?? null);

	if (command === StressCommand.DiagnoseRedis) {
		await diagnoseRedisNow();
		return;
	}

	if (command === StressCommand.MonitorRedis) {
		const mode = parseMode(requireStringFlag(values, "mode", null));
		const intervalRaw = requireStringFlag(
			values,
			"interval-ms",
			process.env.REDIS_DURING_INTERVAL_MS ?? "1000",
		);
		const intervalMs = Number(intervalRaw);
		if (!Number.isFinite(intervalMs) || intervalMs < 100) {
			throw new Error(`Invalid --interval-ms=${intervalRaw}`);
		}
		await monitorRedis(mode, intervalMs);
		return;
	}

	const service = requireStringFlag(
		values,
		"service",
		StressService.Layer2Ledger,
	);
	const api = requireStringFlag(values, "api", StressApi.Push);
	const mode = parseMode(requireStringFlag(values, "mode", null));

	if (service !== StressService.Layer2Ledger) {
		throw new Error(
			`Unsupported --service=${service} (only layer2ledger is implemented; oauthmanager later)`,
		);
	}
	if (api !== StressApi.Push && api !== StressApi.PushTransaction) {
		throw new Error(`Unsupported --api=${api} (expected push)`);
	}

	if (command === StressCommand.Prepare) {
		await preparePushDataset(mode);
		return;
	}

	const link = await finalizePushStress(mode);
	console.log("stress profiler visualization urls:");
	console.log(`${link.title}:`);
	console.log(link.url);
}

await main();
