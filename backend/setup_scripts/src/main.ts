import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import {
	BitcoinRPCClient,
	isWalletAlreadyExists,
	isWalletAlreadyLoaded,
} from "@openl2/bitcoin-core-rpc";
import type {
	CommonBackendConfig,
	ConfigInterface,
	Layer2BridgeBitcoinConfFileSettings,
	Layer2BridgeConfig,
	Layer2LedgerAPIHandlerConfig,
	Layer2LedgerCommonConfig,
	Layer2LedgerTestHelperConfig,
} from "@openl2/config-loader";
import {
	BitcoinChain,
	DockerService,
	getBitcoinCoreConfDirectory,
	getConfigFilePath,
	getEnvSpecificConfigDirectory,
	getLayer2BridgeBitcoinConfFilePath,
	getLayer2LedgerDockerEnvFilePath,
	getLayer2OAuthManagerDockerEnvFilePath,
	getProjectRoot,
	Intermediate,
	isTestBitcoinNetwork,
	loadLayer2LedgerDockerEnvSettings,
	loadOAuthManagerDockerEnvSettings,
	readBitcoinConf,
	readConfig,
	Services,
	writeBitcoinConf,
	writeConfig,
	type EnvironmentName,
} from "@openl2/config-loader";
import { Layer2Address } from "@openl2/pubkey-utils";
import {
	deriveAddressFromXpubSegwit,
	generateBitcoinCoreDescriptorSegwit,
	generateMasterKeysSegwit,
	generateMnemonic,
	type MasterKeys,
} from "@openl2/pubkey-utils/btc";
import {
	generateAlphanumericId,
	generateSecurePassword,
	str2bool,
} from "./utils";

function ensureDir(path: string): void {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

function generateLayer2LedgerOAuthManagerConfig(
	environment: EnvironmentName,
	containered = true,
): void {
	console.log(
		`\nGenerating OAuth manager config for environment: ${environment}`,
	);

	const projectRoot = getProjectRoot();
	const outConfigDir = getEnvSpecificConfigDirectory(environment);
	ensureDir(outConfigDir);

	const oauthDockerEnv = loadOAuthManagerDockerEnvSettings(
		getLayer2OAuthManagerDockerEnvFilePath(environment),
	);
	const mongoHost = containered ? oauthDockerEnv.mongodbHost : "localhost";
	const serverHost = oauthDockerEnv.serverHost;

	const configPath = getConfigFilePath(
		Services.LAYER2LEDGEROAUTHMANAGER,
		environment,
	);
	const defaultConfigPath = join(
		projectRoot,
		"backend",
		"layer2ledgeroauthmanager",
		"config.json",
	);

	let configData: ConfigInterface;
	if (existsSync(configPath)) {
		configData = readConfig<ConfigInterface>(configPath);
	} else if (existsSync(defaultConfigPath)) {
		configData = readConfig<ConfigInterface>(defaultConfigPath);
	} else {
		configData = {
			server: { port: oauthDockerEnv.serverPort, host: serverHost },
			mongoDb: {
				host: mongoHost,
				port: oauthDockerEnv.mongodbPort,
				dbName: oauthDockerEnv.mongodbDbName,
			},
		};
	}

	configData.server = {
		port: oauthDockerEnv.serverPort,
		host: serverHost,
	};
	configData.mongoDb = {
		host: mongoHost,
		port: oauthDockerEnv.mongodbPort,
		dbName: oauthDockerEnv.mongodbDbName,
	};

	writeConfig(configPath, configData);
	console.log(`Generated OAuth manager config at: ${configPath}`);
}

function loadBitcoinRpcSettingsForImport(
	environment: EnvironmentName,
	containered: boolean,
): Layer2BridgeBitcoinConfFileSettings {
	const confPath = getConfigFilePath("bitcoin.conf", environment);
	if (!existsSync(confPath)) {
		throw new Error(
			`bitcoin.conf not found at ${confPath}. Run with -generate-keys first.`,
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
	const rpchost = containered ? dockerEnv.bitcoinRpcImportHost : "127.0.0.1";

	return {
		chain,
		rpcuser: String(chainSection.rpcuser),
		rpcpassword: String(chainSection.rpcpassword),
		rpchost,
		rpcport: Number(chainSection.rpcport ?? dockerEnv.bitcoinRpcPort),
	};
}

async function waitForBitcoinRpc(
	rpcSettings: Layer2BridgeBitcoinConfFileSettings,
	timeoutSec = 120,
): Promise<void> {
	const deadline = Date.now() + timeoutSec * 1000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const client = new BitcoinRPCClient(rpcSettings);
			await client.getBlockchainInfo();
			return;
		} catch (error) {
			lastError = error;
			await Bun.sleep(2000);
		}
	}

	throw new Error(
		`Could not connect to Bitcoin Core RPC at ${rpcSettings.rpchost}:${rpcSettings.rpcport} after ${timeoutSec}s. ` +
			`Ensure the ${DockerService.BITCOIN_CORE} container is running and RPC is published ` +
			`(docker compose up -d --force-recreate ${DockerService.BITCOIN_CORE}). Last error: ${lastError}`,
	);
}

function generateKeys(
	env: EnvironmentName,
	containered = true,
): { bridgeSettings: Layer2BridgeConfig; btcKeys: MasterKeys } {
	console.log(`\nLoading configurations for environment: ${env}`);

	const projectRoot = getProjectRoot();
	const outConfigDir = getEnvSpecificConfigDirectory(env);
	ensureDir(outConfigDir);
	console.log(`Project root is at: ${projectRoot}`);
	console.log(`Output config path is at: ${outConfigDir}`);

	const layer2ledgerDockerEnv = loadLayer2LedgerDockerEnvSettings(
		getLayer2LedgerDockerEnvFilePath(env),
	);

	const dbHost = containered ? layer2ledgerDockerEnv.postgresHost : "localhost";
	const redisHost = containered ? layer2ledgerDockerEnv.redisHost : "localhost";

	const layer2ledgerCommonSettings: Layer2LedgerCommonConfig = {
		database: {
			db_user: layer2ledgerDockerEnv.postgresUser,
			db_password: layer2ledgerDockerEnv.postgresPassword,
			db_host: dbHost,
			db_port: String(layer2ledgerDockerEnv.postgresPort),
			db_name: layer2ledgerDockerEnv.postgresDb,
		},
		redis: {
			host: redisHost,
			port: layer2ledgerDockerEnv.redisPort,
		},
	};

	const layer2bridgeSigningAddress = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	layer2bridgeSigningAddress.generateNewAddress();
	const onboardingLayer2DepositAddress = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	onboardingLayer2DepositAddress.generateNewAddress();

	const mnemonic = generateMnemonic(12);
	const btcKeys = generateMasterKeysSegwit(mnemonic, true);

	const layer2ledgerApihandlerSettings: Layer2LedgerAPIHandlerConfig = {
		layer2ledger_node_id: generateAlphanumericId(),
		deposit_wallet_master_pubkey: btcKeys.master_xpub,
		minimum_layer1_transaction_amount: 1000,
		layer2bridge_signing_address: {
			mneumonic: null,
			private_key: layer2bridgeSigningAddress.private_key_str_base58,
			public_key: layer2bridgeSigningAddress.public_key_str_base58,
		},
		deposit_transaction_pubkey: generateAlphanumericId(),
		layer2bridge_signing_key_uses_functional_test_keys: false,
		onboarding_layer2_deposit_address: {
			mneumonic: null,
			private_key: onboardingLayer2DepositAddress.private_key_str_base58,
			public_key: onboardingLayer2DepositAddress.public_key_str_base58,
		},
	};

	const templatePath = getLayer2BridgeBitcoinConfFilePath();
	const bitcoinConf = readBitcoinConf(templatePath);
	const newBtcRpcPassword = generateSecurePassword(16);

	const selectedChain = (
		bitcoinConf.globals.chain ?? BitcoinChain.TESTNET4
	).trim();
	bitcoinConf.globals.chain = selectedChain;
	bitcoinConf.sections[selectedChain] ??= {};
	bitcoinConf.sections[selectedChain].rpcpassword = newBtcRpcPassword;
	if (containered) {
		bitcoinConf.sections[selectedChain].rpcbind = "0.0.0.0";
		bitcoinConf.sections[selectedChain].rpcallowip = "0.0.0.0/0";
	}
	console.log(`Chain specified in bitcoin.conf: ${selectedChain}`);

	const selectedChainInfo = bitcoinConf.sections[selectedChain] ?? {};
	const rpcHost = containered
		? layer2ledgerDockerEnv.bitcoinRpcHost
		: "localhost";
	const layer2NodeUrl = containered
		? `http://${layer2ledgerDockerEnv.layer2ledgerApihandlerHost}:${layer2ledgerDockerEnv.layer2ledgerFastapiPort}`
		: `http://localhost:${layer2ledgerDockerEnv.layer2ledgerFastapiPort}`;

	const layer2bridgeBitcoinConfSettings: Layer2BridgeBitcoinConfFileSettings = {
		chain: selectedChain,
		rpchost: rpcHost,
		rpcport: Number(selectedChainInfo.rpcport),
		rpcuser: String(selectedChainInfo.rpcuser),
		rpcpassword: String(selectedChainInfo.rpcpassword),
	};

	const layer2bridgeSettings: Layer2BridgeConfig = {
		rpc_settings: layer2bridgeBitcoinConfSettings,
		database_layer2bridge_name: `layer2bridge_db.${env}`,
		wallet_name: `wallet-${env}`,
		layer2_node_url: layer2NodeUrl,
		onboarding_signing_private_key:
			layer2bridgeSigningAddress.private_key_str_base58,
	};

	const commonBackendSettings: CommonBackendConfig = {
		node_id: layer2ledgerApihandlerSettings.layer2ledger_node_id,
		layer2bridge_signing_public_key:
			layer2bridgeSigningAddress.public_key_str_base58,
	};

	writeBitcoinConf(getConfigFilePath("bitcoin.conf", env), bitcoinConf);
	writeConfig(
		getConfigFilePath(Services.LAYER2LEDGER_COMMON, env),
		layer2ledgerCommonSettings,
	);
	writeConfig(
		getConfigFilePath(Services.LAYER2LEDGER_APIHANDLER, env),
		layer2ledgerApihandlerSettings,
	);

	const layer2ledgerTesthelperSettings: Layer2LedgerTestHelperConfig = {
		host: "0.0.0.0",
		port: layer2ledgerDockerEnv.testhelperPort,
	};
	writeConfig(
		getConfigFilePath(Services.LAYER2LEDGER_TESTHELPER, env),
		layer2ledgerTesthelperSettings,
	);
	writeConfig(
		getConfigFilePath(Services.LAYER2LEDGERBRIDGE, env),
		layer2bridgeSettings,
	);
	writeConfig(
		getConfigFilePath(Services.BACKEND_COMMON, env),
		commonBackendSettings,
	);

	const tempKeysPath = getConfigFilePath(
		Intermediate.BITCOIN_CORE_MASTER_KEYS,
		env,
	);
	writeConfig(tempKeysPath, btcKeys);
	console.log(`Master keys saved to: ${tempKeysPath}`);

	return { bridgeSettings: layer2bridgeSettings, btcKeys };
}

async function importKeysToBitcoinCore(
	env: EnvironmentName,
	bridgeSettings: Layer2BridgeConfig | null = null,
	btcKeys: MasterKeys | null = null,
	containered = true,
): Promise<void> {
	let resolvedBridgeSettings = bridgeSettings;
	let resolvedBtcKeys = btcKeys;

	if (resolvedBridgeSettings === null) {
		const bridgeSettingsPath = getConfigFilePath(
			Services.LAYER2LEDGERBRIDGE,
			env,
		);
		console.log(`Loading bridge settings from: ${bridgeSettingsPath}`);
		if (!existsSync(bridgeSettingsPath)) {
			console.log(
				`Error: Bridge settings file not found at ${bridgeSettingsPath}. Run with -generate-keys first.`,
			);
			return;
		}
		resolvedBridgeSettings = readConfig<Layer2BridgeConfig>(bridgeSettingsPath);
	}

	if (resolvedBtcKeys === null) {
		const tempKeysPath = getConfigFilePath(
			Intermediate.BITCOIN_CORE_MASTER_KEYS,
			env,
		);
		console.log(`Loading master keys from: ${tempKeysPath}`);
		if (!existsSync(tempKeysPath)) {
			console.log(
				`Error: Master keys file not found at ${tempKeysPath}. Run with -generate-keys first.`,
			);
			return;
		}
		resolvedBtcKeys = readConfig<MasterKeys>(tempKeysPath);
	}

	let rpcSettings: Layer2BridgeBitcoinConfFileSettings;
	try {
		rpcSettings = loadBitcoinRpcSettingsForImport(env, containered);
	} catch (error) {
		console.log(
			`Error: ${error instanceof Error ? error.message : String(error)}`,
		);
		return;
	}

	console.log(
		`\nImporting keys to Bitcoin Core wallet: ${resolvedBridgeSettings.wallet_name}`,
	);
	console.log(
		`Connecting to Bitcoin Core RPC at ${rpcSettings.rpchost}:${rpcSettings.rpcport}`,
	);

	try {
		await waitForBitcoinRpc(rpcSettings);
	} catch (error) {
		console.log(error instanceof Error ? error.message : String(error));
		return;
	}

	let rpcClient = new BitcoinRPCClient(rpcSettings);

	const loadResp = await rpcClient.loadWallet(
		resolvedBridgeSettings.wallet_name,
	);
	if (loadResp.error) {
		if (isWalletAlreadyLoaded(loadResp.error)) {
			console.log(
				`Wallet '${resolvedBridgeSettings.wallet_name}' is already loaded.`,
			);
		} else {
			console.log(
				`Could not load wallet, attempting to create it. Error: ${loadResp.error.code} - ${loadResp.error.message}`,
			);
			const createResp = await rpcClient.createWallet(
				resolvedBridgeSettings.wallet_name,
			);
			if (createResp.error) {
				if (isWalletAlreadyExists(createResp.error)) {
					console.log(
						`Wallet '${resolvedBridgeSettings.wallet_name}' already exists. Attempting to load it again...`,
					);
					const loadResp2 = await rpcClient.loadWallet(
						resolvedBridgeSettings.wallet_name,
					);
					if (loadResp2.error && !isWalletAlreadyLoaded(loadResp2.error)) {
						console.log(
							`Failed to load existing wallet: ${loadResp2.error.code} - ${loadResp2.error.message}`,
						);
						return;
					}
				} else {
					console.log(
						`Failed to create wallet: ${createResp.error.code} - ${createResp.error.message}`,
					);
					return;
				}
			} else {
				console.log(
					`Wallet '${resolvedBridgeSettings.wallet_name}' created successfully.`,
				);
			}
		}
	} else {
		console.log(
			`Wallet '${resolvedBridgeSettings.wallet_name}' loaded successfully.`,
		);
	}

	rpcClient = rpcClient.withWallet(resolvedBridgeSettings.wallet_name);

	const testnet = isTestBitcoinNetwork(
		resolvedBridgeSettings.rpc_settings.chain,
	);
	const descriptorsData = generateBitcoinCoreDescriptorSegwit(
		resolvedBtcKeys.master_xprv,
		testnet,
	);

	const importRequests = descriptorsData.map((descriptor) => ({
		desc: descriptor.desc,
		active: descriptor.active,
		internal: descriptor.internal,
		range: descriptor.range,
		timestamp: descriptor.timestamp,
	}));

	console.log("Importing descriptors...");
	try {
		const results = await rpcClient.importDescriptors(importRequests);
		for (const [index, result] of results.entries()) {
			if (result.success) {
				console.log(`Descriptor ${index} imported successfully.`);
			} else {
				console.log(
					`Failed to import descriptor ${index}: ${JSON.stringify(result.error)}`,
				);
			}
		}
	} catch (error) {
		console.log(`Failed to call importdescriptors: ${error}`);
	}

	console.log("\nVerifying imported keys...");
	try {
		const newAddress = await rpcClient.getNewAddress("", "bech32");
		console.log(`New address from Bitcoin Core: ${newAddress}`);

		const derivedAddress = deriveAddressFromXpubSegwit(
			resolvedBtcKeys.master_xpub,
			0,
			0,
			testnet,
		);
		console.log(`Derived address 0 from xpub: ${derivedAddress}`);

		if (newAddress === derivedAddress) {
			console.log("✓ Verification successful: Addresses match!");
		} else {
			console.log(
				"! Verification warning: Addresses do not match. This might be expected if the wallet was previously used.",
			);
		}
	} catch (error) {
		console.log(`Verification failed with error: ${error}`);
	}
}

async function promptEnter(message: string): Promise<void> {
	process.stdout.write(message);
	const reader = Bun.stdin.stream().getReader();
	const decoder = new TextDecoder();
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}
		if (decoder.decode(value).includes("\n")) {
			break;
		}
	}
	reader.releaseLock();
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			env: { type: "string", short: "e", default: "dev" },
			"generate-keys": { type: "boolean", default: false },
			"import-keys-to-bitcoin-core": { type: "boolean", default: false },
			"generate-oauth-config": { type: "boolean", default: false },
			containered: { type: "string", default: "true" },
			"overwrite-bitcoinconf": { type: "boolean", default: false },
		},
		allowPositionals: true,
		strict: false,
	});

	// Support both `--env=prod` / `-env=prod` and argparse-style `-env prod` / `-generate-keys`.
	const argv = Bun.argv.slice(2);
	const flag = (name: string): boolean =>
		argv.includes(`-${name}`) ||
		argv.includes(`--${name}`) ||
		Boolean(values[name as keyof typeof values]);

	const getArgValue = (name: string, fallback: string): string => {
		const eqPrefix = `-${name}=`;
		const longEqPrefix = `--${name}=`;
		for (const arg of argv) {
			if (arg.startsWith(eqPrefix)) {
				return arg.slice(eqPrefix.length);
			}
			if (arg.startsWith(longEqPrefix)) {
				return arg.slice(longEqPrefix.length);
			}
		}
		const shortIndex = argv.indexOf(`-${name}`);
		if (
			shortIndex !== -1 &&
			argv[shortIndex + 1] &&
			!argv[shortIndex + 1]!.startsWith("-")
		) {
			return argv[shortIndex + 1]!;
		}
		const longIndex = argv.indexOf(`--${name}`);
		if (
			longIndex !== -1 &&
			argv[longIndex + 1] &&
			!argv[longIndex + 1]!.startsWith("-")
		) {
			return argv[longIndex + 1]!;
		}
		return fallback;
	};

	const env = getArgValue(
		"env",
		String(values.env ?? "dev"),
	) as EnvironmentName;
	const generateKeysFlag = flag("generate-keys");
	const importKeysFlag = flag("import-keys-to-bitcoin-core");
	const generateOauthConfigFlag = flag("generate-oauth-config");
	const containered = str2bool(
		getArgValue("containered", String(values.containered ?? "true")),
	);
	const overwriteBitcoinconf = flag("overwrite-bitcoinconf");

	if (!generateKeysFlag && !importKeysFlag && !generateOauthConfigFlag) {
		console.log(`Usage: bun run src/main.ts [options]

Options:
  -env <env>                         Environment to use (default: dev)
  -generate-keys                     Generate keys and save to config files
  -import-keys-to-bitcoin-core       Import generated keys to Bitcoin Core
  -generate-oauth-config             Generate layer2ledgeroauthmanager config.json from docker env file
  -containered <true|false>          Whether the setup is for a containered environment (default: true)
  -overwrite-bitcoinconf             Overwrite the system bitcoin.conf with the project one (only if -containered is false)
`);
		return;
	}

	if (generateOauthConfigFlag) {
		generateLayer2LedgerOAuthManagerConfig(env, containered);
	}

	let bridgeSettings: Layer2BridgeConfig | null = null;
	let btcKeys: MasterKeys | null = null;

	if (generateKeysFlag) {
		const generated = generateKeys(env, containered);
		bridgeSettings = generated.bridgeSettings;
		btcKeys = generated.btcKeys;
	}

	if (!containered && overwriteBitcoinconf) {
		const source = getConfigFilePath("bitcoin.conf", env);
		const destDir = getBitcoinCoreConfDirectory();
		const dest = join(destDir, "bitcoin.conf");

		console.log(`Overwriting system bitcoin.conf at ${dest} with ${source}`);
		ensureDir(destDir);
		copyFileSync(source, dest);

		if (importKeysFlag) {
			await promptEnter(
				"Start bitcoin core, and press Enter to import key import...",
			);
		}
	}

	if (importKeysFlag) {
		await importKeysToBitcoinCore(env, bridgeSettings, btcKeys, containered);
	}
}

await main();
