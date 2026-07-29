import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	buildWithdrawalBroadcastedMessage,
	buildWithdrawalConfirmedMessage,
	buildWithdrawalRequestMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import { eq, inArray } from "drizzle-orm";
import { ErrorCodes } from "../src/api/models/common";
import {
	confirmedWithdrawals,
	layer2AddressBalance,
	WithdrawalStatus,
	withdrawalRequests,
} from "../src/db/schema";
import { getPendingWithdrawals } from "../src/redis/distributed-lock";
import {
	backendCommon,
	bridgeSigningAddress,
	createHandlers,
	db,
	drainPendingQueues,
	newLayer2Address,
	redis,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

const LAYER1_ADDRESS = "tb1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

beforeAll(async () => {
	await setupLedgerTests();
});

afterAll(async () => {
	await teardownLedgerTests();
});

describe("withdrawal route handlers", () => {
	it("completes request → dbwriter → ack → broadcast → confirm", async () => {
		const source = newLayer2Address();
		const bridge = bridgeSigningAddress();
		const handlers = createHandlers();
		const amount = 100;
		const initialBalance = 1000;

		await db.insert(layer2AddressBalance).values({
			address: source.public_key_str_base58,
			balance: initialBalance,
		});

		const transactionId = crypto.randomUUID();
		const message = buildWithdrawalRequestMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			source.public_key_str_base58,
			LAYER1_ADDRESS,
			transactionId,
			amount,
		);
		const signature = await source.signMessage(message);
		const requestResponse = await handlers.requestWithdrawal({
			amount,
			layer1_withdrawal_address: LAYER1_ADDRESS,
			layer2_transaction_id: transactionId,
			signature,
			source_address_public_key: source.public_key_str_base58,
		});
		expect(requestResponse.error_code).toBe(ErrorCodes.SUCCESS);

		const pending = await getPendingWithdrawals(redis, 0, -1);
		expect(pending).toHaveLength(1);
		const layer2WithdrawalId =
			pending[0]!.withdrawal_request.layer2_withdrawal_id;
		expect(pending[0]?.transaction.amount).toBe(amount);
		expect(pending[0]?.transaction.source_address_pubkey).toBe(
			source.public_key_str_base58,
		);
		expect(pending[0]?.withdrawal_request.layer1_address).toBe(LAYER1_ADDRESS);
		expect(layer2WithdrawalId.startsWith("w_")).toBe(true);

		await drainPendingQueues();

		const getRequests = await handlers.getWithdrawalRequests({
			latest_timestamp: 0,
		});
		expect(getRequests.error_code).toBe(ErrorCodes.SUCCESS);
		expect(getRequests.withdrawal_requests).toHaveLength(1);
		expect(getRequests.withdrawal_requests[0]?.layer2_withdrawal_id).toBe(
			layer2WithdrawalId,
		);

		const acknowledged = await db
			.select()
			.from(withdrawalRequests)
			.where(eq(withdrawalRequests.layer2WithdrawalId, layer2WithdrawalId))
			.limit(1);
		expect(acknowledged[0]?.status).toBe(
			WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED,
		);

		const layer1TransactionId = "l1_tx_id_123";
		const layer1TransactionVout = 0;
		const broadcastMessage = buildWithdrawalBroadcastedMessage(
			backendCommon.node_id,
			layer1TransactionId,
			layer1TransactionVout,
			LAYER1_ADDRESS,
			amount,
			layer2WithdrawalId,
		);
		const broadcastSignature = await bridge.signMessage(broadcastMessage);
		const broadcastResponse = await handlers.withdrawalBroadcasted({
			transactions: [
				{
					layer1_transaction_id: layer1TransactionId,
					layer1_transaction_vout: layer1TransactionVout,
					layer1_address: LAYER1_ADDRESS,
					amount,
					layer2_withdrawal_id: layer2WithdrawalId,
					signature: broadcastSignature,
				},
			],
		});
		expect(broadcastResponse.error_code).toBe(ErrorCodes.SUCCESS);
		expect(broadcastResponse.transactions[0]?.error_code).toBe(
			ErrorCodes.SUCCESS,
		);

		const confirmedMessage = buildWithdrawalConfirmedMessage(
			backendCommon.node_id,
			layer1TransactionId,
			layer1TransactionVout,
			LAYER1_ADDRESS,
			amount,
		);
		const confirmedSignature = await bridge.signMessage(confirmedMessage);
		const confirmedResponse = await handlers.withdrawalConfirmed({
			transactions: [
				{
					layer1_transaction_id: layer1TransactionId,
					layer1_transaction_vout: layer1TransactionVout,
					layer1_address: LAYER1_ADDRESS,
					amount,
					signature: confirmedSignature,
				},
			],
		});
		expect(confirmedResponse.error_code).toBe(ErrorCodes.SUCCESS);
		expect(confirmedResponse.transactions[0]?.error_code).toBe(
			ErrorCodes.SUCCESS,
		);

		const withdrawalReq = await db
			.select()
			.from(withdrawalRequests)
			.where(eq(withdrawalRequests.layer2WithdrawalId, layer2WithdrawalId))
			.limit(1);
		expect(withdrawalReq[0]?.status).toBe(
			WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED,
		);

		const confirmed = await db
			.select()
			.from(confirmedWithdrawals)
			.where(eq(confirmedWithdrawals.layer2WithdrawalId, layer2WithdrawalId))
			.limit(1);
		expect(confirmed[0]?.confirmed).toBe(true);
	});

	it("batches multiple withdrawals from one address to the same layer1 address", async () => {
		const numWithdrawals = 3;
		const source = newLayer2Address();
		const bridge = bridgeSigningAddress();
		const handlers = createHandlers();
		const withdrawalAmounts = Array.from(
			{ length: numWithdrawals },
			(_, i) => 100 * (i + 1),
		);
		const totalAmount = withdrawalAmounts.reduce((a, b) => a + b, 0);
		const initialBalance = totalAmount + 1000;

		await db.insert(layer2AddressBalance).values({
			address: source.public_key_str_base58,
			balance: initialBalance,
		});

		for (const amount of withdrawalAmounts) {
			const transactionId = crypto.randomUUID();
			const message = buildWithdrawalRequestMessage(
				backendCommon.node_id,
				NODE_ASSET_ID_HEX,
				source.public_key_str_base58,
				LAYER1_ADDRESS,
				transactionId,
				amount,
			);
			const signature = await source.signMessage(message);
			const response = await handlers.requestWithdrawal({
				amount,
				layer1_withdrawal_address: LAYER1_ADDRESS,
				layer2_transaction_id: transactionId,
				signature,
				source_address_public_key: source.public_key_str_base58,
			});
			expect(response.error_code).toBe(ErrorCodes.SUCCESS);
			await drainPendingQueues();
		}

		const getRequests = await handlers.getWithdrawalRequests({
			latest_timestamp: 0,
		});
		expect(getRequests.error_code).toBe(ErrorCodes.SUCCESS);
		expect(getRequests.withdrawal_requests).toHaveLength(numWithdrawals);

		const reqMap = new Map(
			getRequests.withdrawal_requests.map((req) => [
				req.amount,
				req.layer2_withdrawal_id,
			]),
		);
		const layer2WithdrawalIds = withdrawalAmounts.map(
			(amount) => reqMap.get(amount)!,
		);

		const layer1TransactionId = `l1_tx_batched_${crypto.randomUUID()}`;
		const layer1TransactionVout = 0;
		const broadcastedTxs = [];
		for (let i = 0; i < numWithdrawals; i++) {
			const amount = withdrawalAmounts[i]!;
			const withdrawalId = layer2WithdrawalIds[i]!;
			const broadcastMessage = buildWithdrawalBroadcastedMessage(
				backendCommon.node_id,
				layer1TransactionId,
				layer1TransactionVout,
				LAYER1_ADDRESS,
				amount,
				withdrawalId,
			);
			broadcastedTxs.push({
				layer1_transaction_id: layer1TransactionId,
				layer1_transaction_vout: layer1TransactionVout,
				layer1_address: LAYER1_ADDRESS,
				amount,
				layer2_withdrawal_id: withdrawalId,
				signature: await bridge.signMessage(broadcastMessage),
			});
		}

		const broadcastResponse = await handlers.withdrawalBroadcasted({
			transactions: broadcastedTxs,
		});
		expect(broadcastResponse.error_code).toBe(ErrorCodes.SUCCESS);
		expect(broadcastResponse.transactions).toHaveLength(numWithdrawals);

		const confirmedMessage = buildWithdrawalConfirmedMessage(
			backendCommon.node_id,
			layer1TransactionId,
			layer1TransactionVout,
			LAYER1_ADDRESS,
			totalAmount,
		);
		const confirmedResponse = await handlers.withdrawalConfirmed({
			transactions: [
				{
					layer1_transaction_id: layer1TransactionId,
					layer1_transaction_vout: layer1TransactionVout,
					layer1_address: LAYER1_ADDRESS,
					amount: totalAmount,
					signature: await bridge.signMessage(confirmedMessage),
				},
			],
		});
		expect(confirmedResponse.error_code).toBe(ErrorCodes.SUCCESS);

		const withdrawalReqs = await db
			.select()
			.from(withdrawalRequests)
			.where(
				inArray(withdrawalRequests.layer2WithdrawalId, layer2WithdrawalIds),
			);
		expect(withdrawalReqs).toHaveLength(numWithdrawals);
		for (const req of withdrawalReqs) {
			expect(req.status).toBe(WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED);
		}

		const confirmedRows = await db
			.select()
			.from(confirmedWithdrawals)
			.where(
				inArray(confirmedWithdrawals.layer2WithdrawalId, layer2WithdrawalIds),
			);
		expect(confirmedRows).toHaveLength(numWithdrawals);
		for (const row of confirmedRows) {
			expect(row.confirmed).toBe(true);
			expect(row.layer1TransactionId).toBe(layer1TransactionId);
		}
	});

	it("batches withdrawals from different layer2 addresses to one layer1 address", async () => {
		const numWithdrawals = 3;
		const bridge = bridgeSigningAddress();
		const handlers = createHandlers();
		const sources = Array.from({ length: numWithdrawals }, () =>
			newLayer2Address(),
		);
		const withdrawalAmounts = Array.from(
			{ length: numWithdrawals },
			(_, i) => 100 * (i + 1),
		);
		const totalAmount = withdrawalAmounts.reduce((a, b) => a + b, 0);

		for (const source of sources) {
			await db.insert(layer2AddressBalance).values({
				address: source.public_key_str_base58,
				balance: 1000,
			});
		}

		for (let i = 0; i < numWithdrawals; i++) {
			const source = sources[i]!;
			const amount = withdrawalAmounts[i]!;
			const transactionId = crypto.randomUUID();
			const message = buildWithdrawalRequestMessage(
				backendCommon.node_id,
				NODE_ASSET_ID_HEX,
				source.public_key_str_base58,
				LAYER1_ADDRESS,
				transactionId,
				amount,
			);
			const signature = await source.signMessage(message);
			const response = await handlers.requestWithdrawal({
				amount,
				layer1_withdrawal_address: LAYER1_ADDRESS,
				layer2_transaction_id: transactionId,
				signature,
				source_address_public_key: source.public_key_str_base58,
			});
			expect(response.error_code).toBe(ErrorCodes.SUCCESS);
			await drainPendingQueues();
		}

		const getRequests = await handlers.getWithdrawalRequests({
			latest_timestamp: 0,
		});
		expect(getRequests.withdrawal_requests).toHaveLength(numWithdrawals);
		const reqMap = new Map(
			getRequests.withdrawal_requests.map((req) => [
				req.amount,
				req.layer2_withdrawal_id,
			]),
		);
		const layer2WithdrawalIds = withdrawalAmounts.map(
			(amount) => reqMap.get(amount)!,
		);

		const layer1TransactionId = `l1_tx_multi_src_${crypto.randomUUID()}`;
		const layer1TransactionVout = 0;
		const broadcastedTxs = [];
		for (let i = 0; i < numWithdrawals; i++) {
			const amount = withdrawalAmounts[i]!;
			const withdrawalId = layer2WithdrawalIds[i]!;
			const broadcastMessage = buildWithdrawalBroadcastedMessage(
				backendCommon.node_id,
				layer1TransactionId,
				layer1TransactionVout,
				LAYER1_ADDRESS,
				amount,
				withdrawalId,
			);
			broadcastedTxs.push({
				layer1_transaction_id: layer1TransactionId,
				layer1_transaction_vout: layer1TransactionVout,
				layer1_address: LAYER1_ADDRESS,
				amount,
				layer2_withdrawal_id: withdrawalId,
				signature: await bridge.signMessage(broadcastMessage),
			});
		}

		const broadcastResponse = await handlers.withdrawalBroadcasted({
			transactions: broadcastedTxs,
		});
		expect(broadcastResponse.error_code).toBe(ErrorCodes.SUCCESS);

		const confirmedMessage = buildWithdrawalConfirmedMessage(
			backendCommon.node_id,
			layer1TransactionId,
			layer1TransactionVout,
			LAYER1_ADDRESS,
			totalAmount,
		);
		const confirmedResponse = await handlers.withdrawalConfirmed({
			transactions: [
				{
					layer1_transaction_id: layer1TransactionId,
					layer1_transaction_vout: layer1TransactionVout,
					layer1_address: LAYER1_ADDRESS,
					amount: totalAmount,
					signature: await bridge.signMessage(confirmedMessage),
				},
			],
		});
		expect(confirmedResponse.error_code).toBe(ErrorCodes.SUCCESS);

		const withdrawalReqs = await db
			.select()
			.from(withdrawalRequests)
			.where(
				inArray(withdrawalRequests.layer2WithdrawalId, layer2WithdrawalIds),
			);
		expect(withdrawalReqs).toHaveLength(numWithdrawals);
		for (const req of withdrawalReqs) {
			expect(req.status).toBe(WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED);
		}
	});
});
