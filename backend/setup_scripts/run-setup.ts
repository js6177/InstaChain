#!/usr/bin/env bun
/**
 * First-time environment setup:
 * 1. Generate service keys/configs via setup scripts
 * 2. Start the bitcoin-core container (keeps the chain data volume)
 * 3. Wait until the blockchain has finished syncing
 * 4. Import BTC descriptors into the Bitcoin Core wallet
 *
 * Wallet overwrite deletes only the wallet directory — never the synced chain.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { BitcoinRPCClient } from "@openl2/bitcoin-core-rpc";
import {
	applyContainerRuntimeEnv,
	assertContainerRuntimeReady,
	BITCOIN_CORE_DATA_VOLUME,
	BitcoinChain,
	bitcoinWalletDataSubdir,
	type ContainerCliName,
	composeFilesForEnvironment,
	DockerService,
	type DockerServiceName,
	Environment,
	type EnvironmentName,
	getConfigFilePath,
	getLayer2LedgerDockerEnvFilePath,
	getProjectRoot,
	type Layer2BridgeBitcoinConfFileSettings,
	type Layer2BridgeConfig,
	loadLayer2BridgeConfig,
	loadLayer2LedgerDockerEnvSettings,
	readBitcoinConf,
	requireBun,
	resolveComposeCommand,
	resolveContainerCli,
	resolveEnvironment,
} from "@openl2/config-loader";
import { parseCliArgs } from "./src/cli-args";
import { log } from "./src/logger";

const ROOT = getProjectRoot(import.meta.dir);

const ENVIRONMENT_VALUES = new Set<string>([
	Environment.DEV,
	Environment.PROD,
	Environment.TEST,
]);

function parseEnvironment(raw: string): EnvironmentName {
	if (!ENVIRONMENT_VALUES.has(raw)) {
		throw new Error(
			`Invalid -env value "${raw}". Expected one of: ${[...ENVIRONMENT_VALUES].join(", ")}`,
		);
	}
	return raw as EnvironmentName;
}

function loadBitcoinRpcSettingsForImport(
	environment: EnvironmentName,
): Layer2BridgeBitcoinConfFileSettings {
	const confPath = getConfigFilePath("bitcoin.conf", environment);
	if (!existsSync(confPath)) {
		throw new Error(
			`bitcoin.conf not found at ${confPath}. Key generation may have failed.`,
		);
	}

	const conf = readBitcoinConf(confPath);
	const chain = (conf.globals.chain ?? BitcoinChain.TESTNET4).trim();
	const chainSection = conf.sections[chain];
	if (!chainSection) {
		throw new Error(`Missing [${chain}] section in ${confPath}`);
	}

	const dockerEnv = loadLayer2LedgerDockerEnvSettings(
		getLayer2LedgerDockerEnvFilePath(environment),
	);

	return {
		chain,
		rpcuser: String(chainSection.rpcuser),
		rpcpassword: String(chainSection.rpcpassword),
		// Host machine talks to the published RPC port on localhost.
		rpchost: dockerEnv.bitcoinRpcImportHost,
		rpcport: Number(chainSection.rpcport ?? dockerEnv.bitcoinRpcPort),
	};
}

class FirstTimeSetupRunner {
	private readonly env: Record<string, string>;
	private readonly containerCli: ContainerCliName;
	private readonly compose: string[];
	private readonly bunPath: string;

	constructor(
		private readonly root: string,
		private readonly environment: EnvironmentName,
		private readonly overwriteWallet: boolean,
	) {
		this.bunPath = requireBun();
		this.env = applyContainerRuntimeEnv({
			...process.env,
			ENVIRONMENT: environment,
			OPENL2_CONFIG_PATH: join(root, ".config"),
		});
		assertContainerRuntimeReady(this.env);
		this.containerCli = resolveContainerCli(this.env);
		this.compose = [
			...resolveComposeCommand(this.env),
			"--progress",
			"quiet",
		];
		for (const composeFile of composeFilesForEnvironment(environment)) {
			this.compose.push("-f", composeFile);
		}
		log.info(`Using container engine: ${this.containerCli}`);
	}

	private async runCompose(
		args: string[],
		options?: { check?: boolean; captureOutput?: boolean },
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const check = options?.check ?? true;
		const captureOutput = options?.captureOutput ?? false;
		const command = [...this.compose, ...args];

		const proc = Bun.spawn(command, {
			cwd: this.root,
			env: this.env,
			stdout: captureOutput ? "pipe" : "inherit",
			stderr: captureOutput ? "pipe" : "inherit",
		});

		const stdout = captureOutput ? await new Response(proc.stdout).text() : "";
		const stderr = captureOutput ? await new Response(proc.stderr).text() : "";
		const exitCode = await proc.exited;

		if (check && exitCode !== 0) {
			throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
		}

		return { exitCode, stdout, stderr };
	}

	private async runSetupScripts(...scriptArgs: string[]): Promise<void> {
		const setupDir = join(this.root, "backend/setup_scripts");
		const proc = Bun.spawn(
			[this.bunPath, "run", "src/main.ts", ...scriptArgs],
			{
				cwd: setupDir,
				env: this.env,
				stdout: "inherit",
				stderr: "inherit",
			},
		);
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			throw new Error(`Setup scripts failed with exit code ${exitCode}`);
		}
	}

	private async containerId(service: DockerServiceName): Promise<string> {
		const result = await this.runCompose(["ps", "-q", service], {
			check: false,
			captureOutput: true,
		});
		return result.stdout.trim();
	}

	private async containerHealth(containerId: string): Promise<string> {
		if (!containerId) {
			return "missing";
		}

		const proc = Bun.spawn([this.containerCli, "inspect", containerId], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return "unknown";
		}

		const inspected = JSON.parse(stdout) as Array<{
			State?: { Status?: string; Health?: { Status?: string } };
		}>;
		const state = inspected[0]?.State;
		if (!state) {
			return "unknown";
		}
		if (state.Health?.Status) {
			return state.Health.Status;
		}
		return state.Status ?? "unknown";
	}

	private async waitForHealthy(
		service: DockerServiceName,
		timeoutSec = 600,
	): Promise<void> {
		let waited = 0;
		while (waited < timeoutSec) {
			const health = await this.containerHealth(
				await this.containerId(service),
			);
			if (health === "healthy") {
				log.info(`${service} is healthy`);
				return;
			}
			await Bun.sleep(2000);
			waited += 2;
		}
		throw new Error(`Timed out waiting for ${service} to become healthy`);
	}

	private async generateKeysAndConfigs(): Promise<void> {
		log.info(`Generating keys and configs for environment=${this.environment}...`);
		await this.runSetupScripts(
			"-env",
			this.environment,
			"-containered",
			"true",
			"-generate-keys",
			"-generate-oauth-config",
		);
	}

	private async startBitcoinCore(): Promise<void> {
		// Recreate the container so it picks up the freshly generated bitcoin.conf.
		// Named volume BITCOIN_CORE_DATA_VOLUME is preserved (no `down -v`).
		log.info(
			`Starting ${DockerService.BITCOIN_CORE} container ` +
				`(preserving chain data volume ${BITCOIN_CORE_DATA_VOLUME})...`,
		);
		await this.runCompose(
			["up", "-d", "--build", "--force-recreate", DockerService.BITCOIN_CORE],
			{ check: true },
		);
		await this.waitForHealthy(DockerService.BITCOIN_CORE, 600);
	}

	private async waitForBitcoinRpc(
		rpcSettings: Layer2BridgeBitcoinConfFileSettings,
		timeoutSec = 180,
	): Promise<BitcoinRPCClient> {
		const deadline = Date.now() + timeoutSec * 1000;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				const client = new BitcoinRPCClient(rpcSettings);
				await client.getBlockchainInfo();
				return client;
			} catch (error) {
				lastError = error;
				await Bun.sleep(2000);
			}
		}

		throw new Error(
			`Could not connect to Bitcoin Core RPC at ${rpcSettings.rpchost}:${rpcSettings.rpcport}. ` +
				`Last error: ${lastError}`,
		);
	}

	private async waitForBlockchainSync(
		client: BitcoinRPCClient,
		timeoutSec = 86_400,
	): Promise<void> {
		log.info("Waiting for Bitcoin Core blockchain sync to finish...");
		const deadline = Date.now() + timeoutSec * 1000;

		while (Date.now() < deadline) {
			const info = await client.getBlockchainInfo();
			const progress = info.verificationprogress ?? 0;
			const ibd = info.initialblockdownload ?? true;
			log.info(
				`sync status: blocks=${info.blocks}/${info.headers} ` +
					`progress=${(progress * 100).toFixed(2)}% ` +
					`initialblockdownload=${ibd}`,
			);

			if (!ibd && info.blocks > 0 && info.blocks >= info.headers) {
				log.info("Blockchain sync complete");
				return;
			}

			await Bun.sleep(15_000);
		}

		throw new Error(
			`Timed out waiting for blockchain sync after ${timeoutSec}s`,
		);
	}

	private async walletExistsOnDisk(
		walletName: string,
		chain: string,
	): Promise<boolean> {
		const walletPath = join(
			"/home/bitcoin/.bitcoin",
			bitcoinWalletDataSubdir(chain),
			walletName,
		);
		const result = await this.runCompose(
			["exec", "-T", DockerService.BITCOIN_CORE, "test", "-d", walletPath],
			{ check: false, captureOutput: true },
		);
		return result.exitCode === 0;
	}

	private async deleteWalletDirectory(
		walletName: string,
		chain: string,
	): Promise<void> {
		const walletPath = join(
			"/home/bitcoin/.bitcoin",
			bitcoinWalletDataSubdir(chain),
			walletName,
		);
		log.info(`Deleting wallet directory only (keeping chain data): ${walletPath}`);
		await this.runCompose(
			["exec", "-T", DockerService.BITCOIN_CORE, "rm", "-rf", walletPath],
			{ check: true },
		);
	}

	private async prepareWallet(
		client: BitcoinRPCClient,
		bridgeSettings: Layer2BridgeConfig,
	): Promise<void> {
		const walletName = bridgeSettings.wallet_name;
		const chain = bridgeSettings.rpc_settings.chain;
		const exists = await this.walletExistsOnDisk(walletName, chain);

		if (exists && !this.overwriteWallet) {
			throw new Error(
				`Bitcoin Core wallet "${walletName}" already exists. ` +
					"Re-run with -overwrite-wallet to delete and recreate it " +
					"(synced blockchain data will be kept).",
			);
		}

		if (exists && this.overwriteWallet) {
			log.info(
				`Overwriting existing wallet "${walletName}" (chain data preserved)...`,
			);
			const loaded = await client.listWallets();
			if (loaded.includes(walletName)) {
				const unloadResp = await client.unloadWallet(walletName);
				if (unloadResp.error) {
					throw new Error(
						`Failed to unload wallet ${walletName}: ` +
							`${unloadResp.error.code} - ${unloadResp.error.message}`,
					);
				}
			}
			await this.deleteWalletDirectory(walletName, chain);
		}
	}

	private async importKeys(): Promise<void> {
		log.info("Importing BTC keys into Bitcoin Core wallet...");
		await this.runSetupScripts(
			"-env",
			this.environment,
			"-containered",
			"true",
			"-import-keys-to-bitcoin-core",
		);
	}

	async main(): Promise<void> {
		await this.generateKeysAndConfigs();
		await this.startBitcoinCore();

		const rpcSettings = loadBitcoinRpcSettingsForImport(this.environment);
		const client = await this.waitForBitcoinRpc(rpcSettings);
		await this.waitForBlockchainSync(client);

		const bridgeSettings = loadLayer2BridgeConfig(this.environment);
		await this.prepareWallet(client, bridgeSettings);
		await this.importKeys();

		log.info(
			`Setup complete for environment=${this.environment}. ` +
				"You can now start the rest of the stack (e.g. `make prod`, `make dev`, or `make backend-dev`).",
		);
	}
}

function printHelp(): void {
	log.info(`Usage: bun run run-setup.ts [options]

First-time setup: generate keys, start bitcoin-core, wait for sync, import wallet keys.

Options:
  -env <env>             Environment: ${[...ENVIRONMENT_VALUES].join(", ")} (default: ${Environment.DEFAULT})
  -overwrite-wallet      Delete and recreate the Bitcoin Core wallet if it already exists
                         (does not delete the synced blockchain / chain data volume)
  -h, --help             Show this help
`);
}

async function main(): Promise<void> {
	const { values } = parseCliArgs({
		env: { type: "string", default: resolveEnvironment() },
		"overwrite-wallet": { type: "boolean", default: false },
		help: { type: "boolean", short: "h", default: false },
	});

	if (values.help) {
		printHelp();
		return;
	}

	const environment = parseEnvironment(values.env ?? resolveEnvironment());
	const overwriteWallet = Boolean(values["overwrite-wallet"]);

	const runner = new FirstTimeSetupRunner(ROOT, environment, overwriteWallet);
	await runner.main();
}

try {
	await main();
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
