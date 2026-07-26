import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createLayer2LedgerClient,
	createLayer2TestHelperClient,
	ErrorCodes,
	type GetTransactionsResponse,
	type GetTransactionsResponseTransaction,
	type Layer2LedgerClient,
	type Layer2TestHelperClient,
	type NodeInfo,
	unwrapLayer2LedgerResponse,
	unwrapLayer2TestHelperResponse,
} from "@openl2/api-layer2ledger";
import {
	buildDepositMessage,
	buildGetDepositAddressMessage,
	buildTransferMessage,
	buildWithdrawalRequestMessage,
	TransactionType,
} from "@openl2/openl2-messaging";
import { Layer2Address, Layer2Wallet } from "@openl2/wallet-shared";

const testDir = dirname(fileURLToPath(import.meta.url));

const API_SUCCESS = ErrorCodes.SUCCESS;

function getLedgerApi(): Layer2LedgerClient {
	const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
	return createLayer2LedgerClient(apiBase);
}

interface BridgeConfigFile {
	onboarding_signing_private_key: string;
}

function parseBridgeConfigFile(value: unknown): BridgeConfigFile | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const onboardingSigningPrivateKey = Reflect.get(
		value,
		"onboarding_signing_private_key",
	);
	if (
		typeof onboardingSigningPrivateKey !== "string" ||
		onboardingSigningPrivateKey.length === 0
	) {
		return null;
	}

	return { onboarding_signing_private_key: onboardingSigningPrivateKey };
}

let bridgeConfig: BridgeConfigFile | null = null;

export function isLedgerIntegrationEnabled(): boolean {
	const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
	return (
		apiBase.includes("layer2ledgerapihandler") ||
		apiBase.includes("localhost:8000") ||
		apiBase.includes("127.0.0.1:8000")
	);
}

export function getTestHelperBaseUrl(): string {
	return (
		import.meta.env.VITE_TESTHELPER_BASE_URL ??
		"http://layer2ledger-testhelper:8001"
	);
}

function getTestHelperApi(): Layer2TestHelperClient {
	return createLayer2TestHelperClient(getTestHelperBaseUrl());
}

function getRepoBridgeConfigPaths(): string[] {
	const environment =
		process.env.ENVIRONMENT ?? process.env.VITE_ENVIRONMENT ?? "test";
	const configRoot =
		process.env.OPENL2_CONFIG_PATH ?? join(testDir, "../../../../../.config");

	return [
		join(testDir, "test.bridge-config.json"),
		join(configRoot, environment, "layer2ledgerbridge-config.json"),
	];
}

export async function loadBridgeConfig(): Promise<void> {
	if (bridgeConfig) return;

	const envKey = import.meta.env.VITE_TEST_BRIDGE_SIGNING_PRIVATE_KEY;
	if (envKey) {
		bridgeConfig = parseBridgeConfigFile({
			onboarding_signing_private_key: envKey,
		});
		return;
	}

	for (const configPath of getRepoBridgeConfigPaths()) {
		try {
			const raw = await readFile(configPath, "utf-8");
			bridgeConfig = parseBridgeConfigFile(JSON.parse(raw));
			if (bridgeConfig) return;
		} catch {
			// Try the next candidate path.
		}
	}

	const configUrl =
		import.meta.env.VITE_TEST_BRIDGE_CONFIG_URL ??
		"/test/test.bridge-config.json";

	try {
		const response = await fetch(configUrl);
		if (response.ok) {
			bridgeConfig = parseBridgeConfigFile(await response.json());
		}
	} catch {
		// Bridge config is only required for deposit integration tests in Docker.
	}
}

export function getBridgeSigningPrivateKey(): string {
	const key = bridgeConfig?.onboarding_signing_private_key;
	if (!key) {
		throw new Error(
			"Bridge signing key is not configured. Set VITE_TEST_BRIDGE_SIGNING_PRIVATE_KEY, " +
				"place test.bridge-config.json in the test directory, or generate .config/test/ " +
				"(see backend/setup_scripts).",
		);
	}
	return key;
}

export function createRandomWallet(): Layer2Wallet {
	const wallet = new Layer2Wallet();
	wallet.generateNewMnemonic();
	wallet.fromMnemonic(wallet.mnemonic, 1);
	return wallet;
}

export function walletFromMnemonicWords(words: string[]): Layer2Wallet {
	const wallet = new Layer2Wallet();
	wallet.fromMnemonic(words, 1);
	return wallet;
}

function bridgeSigner(privateKeyBase58: string): Layer2Address {
	const address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	address.fromPrivateKeyBase58(privateKeyBase58);
	return address;
}

export async function seedWalletMnemonic(
	mnemonic: string,
	balanceSats: number,
	includeDepositTransaction = false,
): Promise<string> {
	const result = unwrapLayer2TestHelperResponse(
		await getTestHelperApi().testhelper.seed.mnemonic.post({
			mnemonic,
			balance: balanceSats,
			include_deposit_transaction: includeDepositTransaction,
		}),
	);
	return result.address;
}

export async function seedWalletAddress(
	address: string,
	balanceSats: number,
	includeDepositTransaction = false,
): Promise<void> {
	unwrapLayer2TestHelperResponse(
		await getTestHelperApi().testhelper.seed.balance.post({
			address,
			balance: balanceSats,
			include_deposit_transaction: includeDepositTransaction,
		}),
	);
}

export async function getNodeContext(): Promise<NodeInfo> {
	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().info.get_node_info.get(),
	);
	if (response.error_code !== API_SUCCESS) {
		throw new Error(`get_node_info failed: ${response.error_message}`);
	}
	return response.node_info;
}

export async function getTransferFee(): Promise<number> {
	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().explorer.get_fee.post({}),
	);
	if (response.error_code !== API_SUCCESS) {
		throw new Error(`get_fee failed: ${response.error_message}`);
	}
	return response.fee ?? 0;
}

export async function getAddressBalance(publicKey: string): Promise<number> {
	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().explorer.get_balance.post({
			public_keys: [publicKey],
		}),
	);
	if (response.error_code !== API_SUCCESS) {
		throw new Error(`get_balance failed: ${response.error_message}`);
	}
	const entry = response.balance?.find((b) => b.public_key === publicKey);
	return entry?.balance ?? 0;
}

export async function getAddressTransactions(
	publicKey: string,
): Promise<GetTransactionsResponseTransaction[]> {
	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().explorer.get_all_transactions.post({
			public_keys: [publicKey],
		}),
	);
	if (response.error_code !== API_SUCCESS) {
		throw new Error(`get_all_transactions failed: ${response.error_message}`);
	}
	return flattenTransactions(response, publicKey);
}

export function flattenTransactions(
	response: GetTransactionsResponse,
	publicKey: string,
): GetTransactionsResponseTransaction[] {
	const group = response.transaction_groups?.find(
		(g) => g.public_key === publicKey,
	);
	return group?.transactions ?? [];
}

export async function waitForBalance(
	publicKey: string,
	expectedBalance: number,
	timeoutMs = 30_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const balance = await getAddressBalance(publicKey);
		if (balance === expectedBalance) return;
		await sleep(500);
	}
	const finalBalance = await getAddressBalance(publicKey);
	throw new Error(
		`Timed out waiting for balance of ${publicKey}. Expected ${expectedBalance}, got ${finalBalance}`,
	);
}

export async function waitForMinBalance(
	publicKey: string,
	minimumBalance: number,
	timeoutMs = 30_000,
): Promise<number> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const balance = await getAddressBalance(publicKey);
		if (balance >= minimumBalance) return balance;
		await sleep(500);
	}
	const finalBalance = await getAddressBalance(publicKey);
	throw new Error(
		`Timed out waiting for minimum balance on ${publicKey}. Expected >= ${minimumBalance}, got ${finalBalance}`,
	);
}

export async function getDepositAddress(wallet: Layer2Wallet): Promise<string> {
	const mainAddress = wallet.addresses[0];
	const node = await getNodeContext();

	const nonce = crypto.randomUUID();
	const message = buildGetDepositAddressMessage(
		node.node_id,
		node.asset_id,
		mainAddress.public_key_str_base58,
		nonce,
	);
	const signature = await mainAddress.signMessage(message);

	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().deposit.get_deposit_address.post({
			layer2_address_pubkey: mainAddress.public_key_str_base58,
			nonce,
			signature,
		}),
	);

	if (response.error_code !== API_SUCCESS) {
		throw new Error(`get_deposit_address failed: ${response.error_message}`);
	}

	const layer1DepositAddress = response.layer1_deposit_address;
	if (!layer1DepositAddress) {
		throw new Error("get_deposit_address returned no layer1 address");
	}

	return layer1DepositAddress;
}

export async function confirmLayer1Deposit(
	layer1DepositAddress: string,
	amountSats: number,
): Promise<string> {
	await loadBridgeConfig();
	const node = await getNodeContext();

	const layer1TxId = `test-l1-tx-${crypto.randomUUID()}`;
	const confirmNonce = crypto.randomUUID();
	const depositMessage = buildDepositMessage(
		node.node_id,
		layer1TxId,
		0,
		layer1DepositAddress,
		amountSats,
		confirmNonce,
	);
	const bridge = bridgeSigner(getBridgeSigningPrivateKey());
	const depositSignature = await bridge.signMessage(depositMessage);

	const confirmResponse = unwrapLayer2LedgerResponse(
		await getLedgerApi().deposit.deposit_confirmed.post({
			transactions: [
				{
					layer1_transaction_id: layer1TxId,
					layer1_transaction_vout: 0,
					layer1_address: layer1DepositAddress,
					amount: amountSats,
					nonce: confirmNonce,
					signature: depositSignature,
				},
			],
		}),
	);

	if (confirmResponse.error_code !== API_SUCCESS) {
		throw new Error(
			`deposit_confirmed failed: ${confirmResponse.error_message}`,
		);
	}

	return confirmNonce;
}

export async function depositToAddress(
	wallet: Layer2Wallet,
	amountSats: number,
): Promise<string> {
	const layer1DepositAddress = await getDepositAddress(wallet);
	return confirmLayer1Deposit(layer1DepositAddress, amountSats);
}

export async function transferBetweenAddresses(
	source: Layer2Address,
	destinationPublicKey: string,
	amountSats: number,
	feeSats: number,
): Promise<string> {
	const node = await getNodeContext();
	const transactionId = crypto.randomUUID();

	const message = buildTransferMessage(
		node.node_id,
		node.asset_id,
		source.public_key_str_base58,
		destinationPublicKey,
		amountSats,
		feeSats,
		transactionId,
	);
	const signature = await source.signMessage(message);

	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().transfer.push_transaction.post({
			source_address_public_key: source.public_key_str_base58,
			destination_address_public_key: destinationPublicKey,
			amount: amountSats,
			fee: feeSats,
			transaction_id: transactionId,
			signature,
		}),
	);

	if (response.error_code !== API_SUCCESS) {
		throw new Error(`push_transaction failed: ${response.error_message}`);
	}

	return transactionId;
}

export async function withdrawFromAddress(
	source: Layer2Address,
	layer1WithdrawalAddress: string,
	amountSats: number,
): Promise<string> {
	const node = await getNodeContext();
	const transactionId = crypto.randomUUID();

	const message = buildWithdrawalRequestMessage(
		node.node_id,
		node.asset_id,
		source.public_key_str_base58,
		layer1WithdrawalAddress,
		transactionId,
		amountSats,
	);
	const signature = await source.signMessage(message);

	const response = unwrapLayer2LedgerResponse(
		await getLedgerApi().withdrawal.request_withdrawal.post({
			source_address_public_key: source.public_key_str_base58,
			layer1_withdrawal_address: layer1WithdrawalAddress,
			amount: amountSats,
			layer2_transaction_id: transactionId,
			signature,
		}),
	);

	if (response.error_code !== API_SUCCESS) {
		throw new Error(`request_withdrawal failed: ${response.error_message}`);
	}

	return transactionId;
}

export function expectDepositTransaction(
	transactions: GetTransactionsResponseTransaction[],
	amountSats: number,
	destinationPublicKey: string,
): GetTransactionsResponseTransaction {
	const depositTx = transactions.find(
		(tx) =>
			tx.transaction_type === TransactionType.TRX_DEPOSIT &&
			tx.destination_address_pubkey === destinationPublicKey &&
			tx.amount === amountSats,
	);
	if (!depositTx) {
		throw new Error(
			`Expected deposit transaction for ${destinationPublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
		);
	}
	return depositTx;
}

export function expectTransferTransaction(
	transactions: GetTransactionsResponseTransaction[],
	amountSats: number,
	sourcePublicKey: string,
	destinationPublicKey: string,
): GetTransactionsResponseTransaction {
	const transferTx = transactions.find(
		(tx) =>
			tx.transaction_type === TransactionType.TRX_TRANSFER &&
			tx.source_address_pubkey === sourcePublicKey &&
			tx.destination_address_pubkey === destinationPublicKey &&
			tx.amount === amountSats,
	);
	if (!transferTx) {
		throw new Error(
			`Expected transfer ${sourcePublicKey} -> ${destinationPublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
		);
	}
	return transferTx;
}

export function expectWithdrawalTransaction(
	transactions: GetTransactionsResponseTransaction[],
	amountSats: number,
	sourcePublicKey: string,
): GetTransactionsResponseTransaction {
	const withdrawalTx = transactions.find(
		(tx) =>
			tx.transaction_type === TransactionType.TRX_WITHDRAWAL_INITIATED &&
			tx.source_address_pubkey === sourcePublicKey &&
			tx.amount === amountSats,
	);
	if (!withdrawalTx) {
		throw new Error(
			`Expected withdrawal from ${sourcePublicKey} amount ${amountSats}, got: ${JSON.stringify(transactions)}`,
		);
	}
	return withdrawalTx;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
