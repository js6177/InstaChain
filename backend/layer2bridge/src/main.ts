import { join } from "node:path";
import { ErrorCodes } from "@openl2/api-layer2ledger";
import type { BitcoinRpcClient } from "@openl2/bitcoin-core-rpc";
import {
	type EnvironmentName,
	getEnvSpecificOutputDirectory,
	loadBackendCommonConfig,
	loadLayer2BridgeConfig,
	registerProcessShutdown,
	resolveEnvironment,
} from "@openl2/config-loader";
import {
	type AuditDatabase,
	addOrUpdateLayer1Addresses,
	auditAddressFromRpcGrouping,
	createAuditDatabase,
	getLastAuditBlockHeight,
	getLayer1Addresses,
} from "./db/audit-client";
import {
	BridgeKeyValueKey,
	createBridgeDatabase,
	getAllPendingConfirmedTransactions,
	getKeyValue,
	getKeyValueNumber,
	getPendingConfirmedDepositTransactions,
	getPendingConfirmedWithdrawalTransactions,
	getPendingWithdrawals,
	insertConfirmedTransaction,
	insertPendingWithdrawal,
	setKeyValue,
	updateConfirmedTransaction,
	updatePendingWithdrawalBroadcast,
} from "./db/client";
import {
	ConfirmedTransactionCategory,
	type ConfirmedTransactionCategoryValue,
	type ConfirmedTransactionRow,
	Layer2Status,
	type PendingWithdrawalRow,
	PendingWithdrawalStatus,
	SATOSHI_PER_BITCOIN,
} from "./db/schema";
import { BitcoinFullNodeRpc } from "./full-node-interface";
import {
	Layer2Interface,
	successOrDuplicateErrorCode,
	type WithdrawalBroadcastInput,
} from "./layer2-interface";
import { buildConfirmedTransactionKey } from "./utils/keybuilders";

export type {
	BitcoinRpcClient,
	ListSinceBlockResult,
} from "@openl2/bitcoin-core-rpc";

const DEFAULT_AUDIT_DB_NAME = "audit.sqlite";

function log(message: string): void {
	console.log(`${new Date().toISOString()} ${message}`);
}

export class Layer2Bridge {
	bridgeDbPath = "";
	auditDbPath = "";
	bridgeDb = createBridgeDatabase(":memory:");
	auditDb: AuditDatabase | null = null;
	layer2Interface: Layer2Interface | null = null;
	bitcoinRPC: BitcoinRpcClient | null = null;
	lastblockhash = "";
	blockheight = 0;
	confirmedTransactionsDict = new Map<string, ConfirmedTransactionRow>();
	withdrawalTransactionOutputs = new Map<string, PendingWithdrawalRow>();

	loadConfig(environment?: EnvironmentName): void {
		const env = resolveEnvironment(environment);
		const settings = loadLayer2BridgeConfig(env);
		const backendCommon = loadBackendCommonConfig(env);
		this.bridgeDbPath = join(
			getEnvSpecificOutputDirectory(env),
			settings.database_layer2bridge_name,
		);
		this.auditDbPath = join(
			getEnvSpecificOutputDirectory(env),
			settings.database_audit_name ?? DEFAULT_AUDIT_DB_NAME,
		);
		this.bridgeDb = createBridgeDatabase(this.bridgeDbPath);
		this.layer2Interface = new Layer2Interface(
			settings.layer2_node_url,
			settings.onboarding_signing_private_key,
			backendCommon.node_id,
		);
	}

	close(): void {
		this.auditDb = null;
	}

	async run(): Promise<void> {
		if (!this.bitcoinRPC || !this.layer2Interface) {
			throw new Error(
				"bitcoinRPC and layer2Interface must be configured before run()",
			);
		}

		this.auditDb = createAuditDatabase(this.auditDbPath);

		await this.bitcoinRPC.loadWallet();

		this.lastblockhash = await getKeyValue(
			this.bridgeDb,
			BridgeKeyValueKey.LAST_CONFIRMED_BLOCK_HASH,
		);

		const pendingConfirmed = await getAllPendingConfirmedTransactions(
			this.bridgeDb,
		);
		for (const trx of pendingConfirmed) {
			this.confirmedTransactionsDict.set(
				buildConfirmedTransactionKey(
					trx.transactionId,
					trx.transactionVout,
					trx.category,
				),
				trx,
			);
		}

		while (true) {
			try {
				await this.getConfirmedTransactionsFromNodeAndSaveToDb();
				await this.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
				await this.getPendingWithdrawalsFromDb();
				await this.sendPendingConfirmedDepositsToLayer2Ledger();
				await this.sendPendingConfirmedWithdrawalsToLayer2Ledger();
				await this.broadcastPendingWithdrawals();
				await this.updateAuditDB();
			} catch (error) {
				log(
					`Bridge loop error: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			await Bun.sleep(60_000);
		}
	}

	async getConfirmedTransactionsFromNodeAndSaveToDb(): Promise<void> {
		if (!this.bitcoinRPC) return;
		try {
			const response = await this.bitcoinRPC.getConfirmedTransactions(
				this.lastblockhash,
			);
			this.lastblockhash = response.lastblock;
			const header = await this.bitcoinRPC.getBlockHeader(this.lastblockhash);
			this.blockheight = header.height;
			log(`Latest blockheight: ${this.blockheight}`);

			for (const confirmedTransaction of response.transactions) {
				if (
					confirmedTransaction.confirmations <
					this.bitcoinRPC.getTargetConfirmations()
				) {
					continue;
				}
				const key = buildConfirmedTransactionKey(
					confirmedTransaction.txid,
					confirmedTransaction.vout,
					confirmedTransaction.category,
				);
				if (this.confirmedTransactionsDict.has(key)) {
					continue;
				}
				const dbObject: ConfirmedTransactionRow = {
					transactionId: confirmedTransaction.txid,
					transactionVout: confirmedTransaction.vout,
					layer2Status: Layer2Status.PENDING,
					amount: Math.round(confirmedTransaction.amount * SATOSHI_PER_BITCOIN),
					fee: 0,
					address: confirmedTransaction.address ?? "",
					category:
						confirmedTransaction.category as ConfirmedTransactionCategoryValue,
					confirmations: confirmedTransaction.confirmations,
					timestamp: confirmedTransaction.time,
				};
				this.confirmedTransactionsDict.set(key, dbObject);
				await insertConfirmedTransaction(this.bridgeDb, dbObject);
			}
			log(`lastblockhash: ${this.lastblockhash}`);
			await setKeyValue(
				this.bridgeDb,
				BridgeKeyValueKey.LAST_CONFIRMED_BLOCK_HASH,
				this.lastblockhash,
			);
		} catch (error) {
			log(
				`Error: Could not get confirmed transactions from node. ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async getPendingWithdrawalsFromLayer2LedgerAndSaveToDb(): Promise<void> {
		if (!this.layer2Interface) return;
		let lastWithdrawalTimestamp = Number(
			await getKeyValue(
				this.bridgeDb,
				BridgeKeyValueKey.LAST_WITHDRAWAL_TIMESTAMP,
			),
		);
		try {
			const response = await this.layer2Interface.getWithdrawalRequests(
				lastWithdrawalTimestamp,
			);
			if (response.error_code !== ErrorCodes.SUCCESS) {
				return;
			}

			for (const wr of response.withdrawal_requests ?? []) {
				await insertPendingWithdrawal(this.bridgeDb, {
					layer2WithdrawalId: wr.layer2_withdrawal_id,
					status: PendingWithdrawalStatus.PENDING,
					transactionId: "",
					amount: wr.amount,
					fee: 0,
					destinationAddress: wr.layer1_address,
					confirmations: 0,
					withdrawalRequestedTimestamp: wr.withdrawal_requested_timestamp,
					dateBroadcasted: 0,
				});
				if (wr.withdrawal_requested_timestamp > lastWithdrawalTimestamp) {
					lastWithdrawalTimestamp = wr.withdrawal_requested_timestamp;
				}
				log(
					`New withdrawal received. address: ${wr.layer1_address} amount: ${wr.amount}`,
				);
			}
			await setKeyValue(
				this.bridgeDb,
				BridgeKeyValueKey.LAST_WITHDRAWAL_TIMESTAMP,
				String(lastWithdrawalTimestamp),
			);
		} catch (error) {
			log(
				`Error getting withdrawal requests: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async getPendingWithdrawalsFromDb(): Promise<void> {
		this.withdrawalTransactionOutputs.clear();
		const pending = await getPendingWithdrawals(this.bridgeDb);
		log(`Fetched ${pending.length} pending withdrawals from db`);
		const minimum = this.bitcoinRPC?.getMinimumTransactionAmount() ?? 1000;
		for (const pendingWithdrawal of pending) {
			if (pendingWithdrawal.amount >= minimum) {
				this.withdrawalTransactionOutputs.set(
					pendingWithdrawal.layer2WithdrawalId,
					pendingWithdrawal,
				);
			} else {
				log(
					`Skipping withdrawal ${pendingWithdrawal.layer2WithdrawalId} with amount ${pendingWithdrawal.amount} (minimum ${minimum} satoshis)`,
				);
			}
		}
	}

	async sendPendingConfirmedDepositsToLayer2Ledger(): Promise<void> {
		if (!this.layer2Interface) return;
		const pending = await getPendingConfirmedDepositTransactions(this.bridgeDb);
		if (pending.length === 0) return;
		try {
			const response = await this.layer2Interface.sendConfirmDeposit(
				pending.map((trx) => ({
					transactionId: trx.transactionId,
					transactionVout: trx.transactionVout,
					address: trx.address,
					amount: trx.amount,
				})),
			);
			if (response.error_code !== ErrorCodes.SUCCESS) return;
			for (const trx of response.transactions ?? []) {
				if (successOrDuplicateErrorCode(trx.error_code)) {
					await updateConfirmedTransaction(
						this.bridgeDb,
						trx.layer1_transaction_id,
						trx.layer1_transaction_vout,
						ConfirmedTransactionCategory.RECEIVE,
						Layer2Status.CONFIRMED,
					);
					log(
						`Deposit confirmation acknowledged by layer2ledger. transaction_id: ${trx.layer1_transaction_id} ${trx.layer1_transaction_vout}`,
					);
				}
			}
		} catch (error) {
			log(
				`Error sending confirmed deposits: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async sendPendingConfirmedWithdrawalsToLayer2Ledger(): Promise<void> {
		if (!this.layer2Interface) return;
		const pending = await getPendingConfirmedWithdrawalTransactions(
			this.bridgeDb,
		);
		if (pending.length === 0) return;
		try {
			const response = await this.layer2Interface.sendConfirmWithdrawal(
				pending.map((trx) => ({
					transactionId: trx.transactionId,
					transactionVout: trx.transactionVout,
					address: trx.address,
					amount: trx.amount,
				})),
			);
			if (response.error_code !== ErrorCodes.SUCCESS) return;
			for (const trx of response.transactions ?? []) {
				if (successOrDuplicateErrorCode(trx.error_code)) {
					await updateConfirmedTransaction(
						this.bridgeDb,
						trx.layer1_transaction_id,
						trx.layer1_transaction_vout,
						ConfirmedTransactionCategory.SEND,
						Layer2Status.CONFIRMED,
					);
					log(
						`Withdrawal confirmed. transaction_id: ${trx.layer1_transaction_id} ${trx.layer1_transaction_vout}`,
					);
				}
			}
		} catch (error) {
			log(
				`Error sending confirmed withdrawals: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async broadcastPendingWithdrawals(): Promise<void> {
		if (!this.bitcoinRPC || !this.layer2Interface) return;
		if (this.withdrawalTransactionOutputs.size === 0) {
			log("No withdrawals to broadcast");
			return;
		}

		const lastBroadcastBlockHeight = await getKeyValueNumber(
			this.bridgeDb,
			BridgeKeyValueKey.LAST_BROADCAST_BLOCK_HEIGHT,
			0,
		);
		const broadcastTransactionBlockDelay = await getKeyValueNumber(
			this.bridgeDb,
			BridgeKeyValueKey.BROADCAST_TRANSACTION_BLOCK_DELAY,
			6,
		);
		const targetBroadcastBlockHeight =
			lastBroadcastBlockHeight + broadcastTransactionBlockDelay;
		log(`lastBroadcastBlockHeight: ${lastBroadcastBlockHeight}`);
		log(`broadcastTransactionBlockDelay: ${broadcastTransactionBlockDelay}`);
		log(`targetBroadcastBlockheight: ${targetBroadcastBlockHeight}`);

		if (this.blockheight < targetBroadcastBlockHeight) {
			log(
				`Batching: waiting for blockheight ${targetBroadcastBlockHeight} to broadcast. Current: ${this.blockheight}`,
			);
			return;
		}

		log(
			`Broadcasting ${this.withdrawalTransactionOutputs.size} withdrawal outputs`,
		);
		try {
			const withdrawalTxId = await this.bitcoinRPC.broadcastTransaction(
				BitcoinFullNodeRpc.toBroadcastInputs(this.withdrawalTransactionOutputs),
			);

			for (const withdrawal of this.withdrawalTransactionOutputs.values()) {
				await updatePendingWithdrawalBroadcast(
					this.bridgeDb,
					withdrawal.layer2WithdrawalId,
					withdrawalTxId,
				);
			}

			const transaction = await this.bitcoinRPC.getTransaction(withdrawalTxId);
			const outputs =
				this.bitcoinRPC.getWithdrawalOutputsFromTransaction(transaction);

			const broadcasted: WithdrawalBroadcastInput[] = [];
			for (const withdrawal of this.withdrawalTransactionOutputs.values()) {
				const output = outputs.find(
					(entry) => entry.address === withdrawal.destinationAddress,
				);
				if (!output) {
					throw new Error(
						`Missing output for withdrawal ${withdrawal.layer2WithdrawalId} address ${withdrawal.destinationAddress}`,
					);
				}
				broadcasted.push({
					layer1_transaction_id: withdrawalTxId,
					layer1_transaction_vout: output.vout,
					layer1_address: withdrawal.destinationAddress,
					amount: withdrawal.amount,
					layer2_withdrawal_id: withdrawal.layer2WithdrawalId,
				});
			}

			await this.layer2Interface.sendWithdrawalBroadcasted(broadcasted);
			await setKeyValue(
				this.bridgeDb,
				BridgeKeyValueKey.LAST_BROADCAST_BLOCK_HEIGHT,
				String(this.blockheight),
			);
		} catch (error) {
			log(
				`Error broadcasting/processing withdrawals: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async updateAuditDB(): Promise<void> {
		if (!this.bitcoinRPC || !this.layer2Interface || !this.auditDb) return;
		if (this.blockheight <= (await getLastAuditBlockHeight(this.auditDb))) {
			return;
		}

		try {
			const addressGroupings = await this.bitcoinRPC.getAddressGroupings();
			const usedLayer1Addresses = addressGroupings.map((entry) =>
				auditAddressFromRpcGrouping(entry),
			);
			await addOrUpdateLayer1Addresses(
				this.auditDb,
				usedLayer1Addresses,
				this.blockheight,
			);

			const layer1Addresses = await getLayer1Addresses(this.auditDb);
			let layer1AddressesBalance = 0;
			for (const layer1AddressRow of layer1Addresses) {
				layer1AddressesBalance += layer1AddressRow.balance;
			}

			const response = await this.layer2Interface.postLayer1AuditReport(
				this.blockheight,
				layer1AddressesBalance,
				layer1Addresses.map((address) => ({
					layer1_address: address.layer1Address,
					balance: address.balance,
				})),
			);
			log(`postLayer1AuditReport: ${response.error_code}`);
		} catch (error) {
			log(
				`Error updating audit DB: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

if (import.meta.main) {
	const bridge = new Layer2Bridge();
	bridge.loadConfig();
	const settings = loadLayer2BridgeConfig();

	bridge.bitcoinRPC = new BitcoinFullNodeRpc(
		settings.rpc_settings,
		settings.wallet_name,
	);

	registerProcessShutdown(() => bridge.close());

	log("layer2bridge started");
	await bridge.run();
}
