/**
 * CLI for OpenL2 stress orchestration.
 *
 * Usage:
 *   bun src/cli.ts prepare --service layer2ledger --api push --mode cold
 *   bun src/cli.ts finalize --service layer2ledger --api push --mode cold
 *
 * k6 runs between prepare and finalize (see `scripts/run-layer2ledger-push.sh`).
 */
import {
	BalanceCacheMode,
	preparePushDataset,
} from "./layer2ledger/prepare-push";
import { finalizePushStress } from "./layer2ledger/finalize-push";
import { parseCliArgs } from "./cli-args";

enum StressCommand {
	Prepare = "prepare",
	Finalize = "finalize",
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
`);
	process.exit(2);
}

function requireStringFlag(
	values: Record<string, string | boolean | string[]>,
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
	if (command === StressCommand.Prepare || command === StressCommand.Finalize) {
		return command;
	}
	usage();
}

async function main(): Promise<void> {
	const { values, positionals } = parseCliArgs({
		service: { type: "string" },
		api: { type: "string" },
		mode: { type: "string" },
	});

	const command = parseCommand(positionals[0] ?? null);
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
