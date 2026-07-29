import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	GetTransactionResult,
	WithdrawalTransactionOutput,
} from "@openl2/bitcoin-core-rpc";
import {
	BridgeKeyValueKey,
	createBridgeDatabase,
	getKeyValue,
	getPendingConfirmedWithdrawalTransactions,
	getPendingWithdrawals,
	insertConfirmedTransaction,
	insertPendingWithdrawal,
	setKeyValue,
} from "../src/db/client";
import {
	ConfirmedTransactionCategory,
	confirmedTransactions,
	Layer2Status,
	PendingWithdrawalStatus,
	pendingWithdrawals,
	SATOSHI_PER_BITCOIN,
} from "../src/db/schema";
import { type BitcoinRpcClient, Layer2Bridge } from "../src/main";

let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "layer2bridge-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function createBridgeWithMocks(): {
	bridge: Layer2Bridge;
	sendWithdrawalBroadcasted: ReturnType<typeof mock>;
} {
	const sendWithdrawalBroadcasted = mock(async () => ({ error_code: 0 }));
	const bridge = new Layer2Bridge();
	bridge.loadConfig("test");
	bridge.bridgeDb = createBridgeDatabase(join(tempDir, "bridge.sqlite"));
	bridge.blockheight = 100;
	bridge.bitcoinRPC = {
		loadWallet: mock(async () => {}),
		getConfirmedTransactions: mock(async () => ({
			lastblock: "blockhash1",
			transactions: [
				{
					txid: "tx1",
					vout: 0,
					category: ConfirmedTransactionCategory.RECEIVE,
					amount: 0.01,
					confirmations: 6,
					time: 1000,
					address: "addr1",
				},
			],
		})),
		getBlockHeader: mock(async () => ({
			hash: "blockhash1",
			confirmations: 1,
			height: 100,
		})),
		getTargetConfirmations: (): number => 3,
		getMinimumTransactionAmount: (): number => 1000,
		broadcastTransaction: mock(async () => "broadcast-tx"),
		getTransaction: mock(async () => ({
			txid: "broadcast-tx",
			amount: -0.0005,
			confirmations: 0,
			time: 2000,
			details: [
				{
					address: "dest1",
					category: ConfirmedTransactionCategory.SEND,
					amount: -0.0005,
					vout: 1,
				},
			],
		})),
		getWithdrawalOutputsFromTransaction: (
			transaction: GetTransactionResult,
		): WithdrawalTransactionOutput[] => {
			const outputs: WithdrawalTransactionOutput[] = [];
			for (const detail of transaction.details) {
				if (!detail.address) {
					continue;
				}
				outputs.push({
					address: detail.address,
					vout: detail.vout,
					amountSatoshis: Math.round(
						Math.abs(detail.amount) * SATOSHI_PER_BITCOIN,
					),
				});
			}
			return outputs;
		},
		getAddressGroupings: mock(async () => []),
	} satisfies BitcoinRpcClient;
	bridge.layer2Interface = {
		getWithdrawalRequests: mock(async () => ({
			error_code: 0,
			withdrawal_requests: [
				{
					layer2_withdrawal_id: "w1",
					amount: 50_000,
					layer1_address: "dest1",
					withdrawal_requested_timestamp: 2000,
				},
			],
		})),
		sendConfirmDeposit: mock(async () => ({
			error_code: 0,
			transactions: [
				{
					layer1_transaction_id: "tx1",
					layer1_transaction_vout: 0,
					error_code: 0,
				},
			],
		})),
		sendConfirmWithdrawal: mock(async () => ({
			error_code: 0,
			transactions: [],
		})),
		sendWithdrawalBroadcasted,
	} as never;
	return { bridge, sendWithdrawalBroadcasted };
}

describe("layer2bridge", () => {
	it("stores confirmed transactions from the node", async () => {
		const { bridge } = createBridgeWithMocks();
		await bridge.getConfirmedTransactionsFromNodeAndSaveToDb();
		expect(bridge.lastblockhash).toBe("blockhash1");
		expect(
			await getKeyValue(
				bridge.bridgeDb,
				BridgeKeyValueKey.LAST_CONFIRMED_BLOCK_HASH,
			),
		).toBe("blockhash1");
		const pending = await bridge.bridgeDb.select().from(confirmedTransactions);
		expect(pending[0]?.amount).toBe(0.01 * SATOSHI_PER_BITCOIN);
	});

	it("stores pending withdrawals from layer2ledger", async () => {
		const { bridge } = createBridgeWithMocks();
		await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
		const pending = await getPendingWithdrawals(bridge.bridgeDb);
		expect(pending[0]?.layer2WithdrawalId).toBe("w1");
		expect(
			Number(
				await getKeyValue(
					bridge.bridgeDb,
					BridgeKeyValueKey.LAST_WITHDRAWAL_TIMESTAMP,
				),
			),
		).toBe(2000);
	});

	it("loads pending withdrawals from db into the output map", async () => {
		const { bridge } = createBridgeWithMocks();
		await insertPendingWithdrawal(bridge.bridgeDb, {
			layer2WithdrawalId: "w2",
			status: PendingWithdrawalStatus.PENDING,
			amount: 100_000,
			destinationAddress: "dest2",
			withdrawalRequestedTimestamp: 3000,
		});

		await bridge.getPendingWithdrawalsFromDb();

		const loaded = bridge.withdrawalTransactionOutputs.get("w2");
		expect(loaded).toBeDefined();
		expect(loaded?.amount).toBe(100_000);
		expect(loaded?.destinationAddress).toBe("dest2");
		expect(loaded?.status).toBe(PendingWithdrawalStatus.PENDING);
	});

	it("filters withdrawals below the minimum amount", async () => {
		const { bridge } = createBridgeWithMocks();
		await insertPendingWithdrawal(bridge.bridgeDb, {
			layer2WithdrawalId: "w3",
			status: PendingWithdrawalStatus.PENDING,
			amount: 500,
			destinationAddress: "dest3",
			withdrawalRequestedTimestamp: 4000,
		});

		await bridge.getPendingWithdrawalsFromDb();

		expect(bridge.withdrawalTransactionOutputs.has("w3")).toBe(false);
	});

	it("acknowledges deposit confirmations from layer2ledger", async () => {
		const { bridge } = createBridgeWithMocks();
		await bridge.getConfirmedTransactionsFromNodeAndSaveToDb();
		await bridge.sendPendingConfirmedDepositsToLayer2Ledger();
		const rows = await bridge.bridgeDb.select().from(confirmedTransactions);
		expect(rows[0]?.layer2Status).toBe(Layer2Status.CONFIRMED);
	});

	it("acknowledges withdrawal confirmations from layer2ledger", async () => {
		const { bridge } = createBridgeWithMocks();
		await insertConfirmedTransaction(bridge.bridgeDb, {
			transactionId: "tx_wd1",
			transactionVout: 1,
			layer2Status: Layer2Status.PENDING,
			amount: 50_000,
			address: "addr_wd1",
			category: ConfirmedTransactionCategory.SEND,
			confirmations: 6,
			timestamp: 1000,
		});
		bridge.layer2Interface.sendConfirmWithdrawal = mock(async () => ({
			error_code: 0,
			transactions: [
				{
					layer1_transaction_id: "tx_wd1",
					layer1_transaction_vout: 1,
					error_code: 0,
				},
			],
		}));

		await bridge.sendPendingConfirmedWithdrawalsToLayer2Ledger();

		const pending = await getPendingConfirmedWithdrawalTransactions(
			bridge.bridgeDb,
		);
		expect(pending).toHaveLength(0);
		const rows = await bridge.bridgeDb.select().from(confirmedTransactions);
		expect(rows[0]?.layer2Status).toBe(Layer2Status.CONFIRMED);
	});

	it("batches withdrawals until block height threshold is met", async () => {
		const { bridge } = createBridgeWithMocks();
		await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
		await bridge.getPendingWithdrawalsFromDb();
		await setKeyValue(
			bridge.bridgeDb,
			BridgeKeyValueKey.LAST_BROADCAST_BLOCK_HEIGHT,
			"95",
		);
		await setKeyValue(
			bridge.bridgeDb,
			BridgeKeyValueKey.BROADCAST_TRANSACTION_BLOCK_DELAY,
			"10",
		);
		bridge.blockheight = 100;

		await bridge.broadcastPendingWithdrawals();
		expect(bridge.bitcoinRPC.broadcastTransaction).not.toHaveBeenCalled();
	});

	it("broadcasts withdrawals and notifies layer2ledger with vout from gettransaction", async () => {
		const { bridge, sendWithdrawalBroadcasted } = createBridgeWithMocks();
		await bridge.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb();
		await bridge.getPendingWithdrawalsFromDb();
		bridge.blockheight = 100;

		await bridge.broadcastPendingWithdrawals();

		expect(bridge.bitcoinRPC.broadcastTransaction).toHaveBeenCalled();
		expect(bridge.bitcoinRPC.getTransaction).toHaveBeenCalledWith(
			"broadcast-tx",
		);
		expect(sendWithdrawalBroadcasted).toHaveBeenCalledWith([
			{
				layer1_transaction_id: "broadcast-tx",
				layer1_transaction_vout: 1,
				layer1_address: "dest1",
				amount: 50_000,
				layer2_withdrawal_id: "w1",
			},
		]);
		expect(
			await getKeyValue(
				bridge.bridgeDb,
				BridgeKeyValueKey.LAST_BROADCAST_BLOCK_HEIGHT,
			),
		).toBe("100");

		const pending = await getPendingWithdrawals(bridge.bridgeDb);
		expect(pending).toHaveLength(0);
		const broadcasted = await bridge.bridgeDb.select().from(pendingWithdrawals);
		expect(broadcasted[0]?.status).toBe(PendingWithdrawalStatus.BROADCASTED);
		expect(broadcasted[0]?.transactionId).toBe("broadcast-tx");
	});
});
