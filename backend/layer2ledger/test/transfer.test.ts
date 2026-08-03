import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	buildTransferMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import { eq } from "drizzle-orm";
import { ErrorCodes } from "../src/api/models/common";
import { layer2AddressBalance, transactions } from "../src/db/schema";
import { getPendingTransactions } from "../src/redis/distributed-lock";
import {
	backendCommon,
	clearPendingQueues,
	createHandlers,
	db,
	drainPendingQueues,
	lockManager,
	newLayer2Address,
	redis,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
});

afterAll(async () => {
	await teardownLedgerTests();
});

describe("transfer route handler", () => {
	it("queues a signed transfer in redis", async () => {
		const source = newLayer2Address();
		const dest = newLayer2Address();
		const initialBalance = 1000;
		const amount = 100;
		const fee = 10;
		const transactionId = crypto.randomUUID();
		await db.insert(layer2AddressBalance).values({
			address: source.public_key_str_base58,
			balance: initialBalance,
		});

		const message = buildTransferMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			source.public_key_str_base58,
			dest.public_key_str_base58,
			amount,
			fee,
			transactionId,
		);
		const signature = await source.signMessage(message);
		const handlers = createHandlers();

		const response = await handlers.pushTransaction({
			amount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: source.public_key_str_base58,
			transaction_id: transactionId,
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);

		const pending = await getPendingTransactions(redis, 0, -1);
		expect(pending).toHaveLength(1);
		expect(pending[0]?.transaction.amount).toBe(amount);
		expect(pending[0]?.transaction.source_address_pubkey).toBe(
			source.public_key_str_base58,
		);
		expect(pending[0]?.transaction.destination_address_pubkey).toBe(
			dest.public_key_str_base58,
		);
		expect(pending[0]?.transaction.layer2_transaction_id).toBe(transactionId);
		await clearPendingQueues();
	});

	it("queues multiple signed transfers in redis", async () => {
		const transferCount = 10;
		const initialBalance = 1000;
		const amount = 100;
		const fee = 10;
		const handlers = createHandlers();

		for (let i = 0; i < transferCount; i++) {
			const source = newLayer2Address();
			const dest = newLayer2Address();
			await db.insert(layer2AddressBalance).values({
				address: source.public_key_str_base58,
				balance: initialBalance,
			});
			const transactionId = crypto.randomUUID();
			const message = buildTransferMessage(
				backendCommon.node_id,
				NODE_ASSET_ID_HEX,
				source.public_key_str_base58,
				dest.public_key_str_base58,
				amount,
				fee,
				transactionId,
			);
			const signature = await source.signMessage(message);
			const response = await handlers.pushTransaction({
				amount,
				destination_address_public_key: dest.public_key_str_base58,
				fee,
				signature,
				source_address_public_key: source.public_key_str_base58,
				transaction_id: transactionId,
			});
			expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		}

		const pending = await getPendingTransactions(redis, 0, -1);
		expect(pending).toHaveLength(transferCount);
		await clearPendingQueues();
	});

	it("rejects transfers with insufficient funds", async () => {
		const source = newLayer2Address();
		const dest = newLayer2Address();
		const initialBalance = 50;
		const amount = 100;
		const fee = 10;
		const transactionId = crypto.randomUUID();
		await db.insert(layer2AddressBalance).values({
			address: source.public_key_str_base58,
			balance: initialBalance,
		});

		const message = buildTransferMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			source.public_key_str_base58,
			dest.public_key_str_base58,
			amount,
			fee,
			transactionId,
		);
		const signature = await source.signMessage(message);
		const response = await createHandlers().pushTransaction({
			amount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: source.public_key_str_base58,
			transaction_id: transactionId,
		});

		expect(response.error_code).toBe(ErrorCodes.INSUFFICIENT_FUNDS);
	});

	it("rejects transfers when the source address is locked", async () => {
		const source = newLayer2Address();
		const dest = newLayer2Address();
		const sourceAddress = source.public_key_str_base58;
		const amount = 100;
		const fee = 10;
		const transactionId = crypto.randomUUID();
		const lockToken = await lockManager.acquireMultiLock([sourceAddress]);
		expect(lockToken).toBeTruthy();

		const message = buildTransferMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			sourceAddress,
			dest.public_key_str_base58,
			amount,
			fee,
			transactionId,
		);
		const signature = await source.signMessage(message);
		const response = await createHandlers().pushTransaction({
			amount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: sourceAddress,
			transaction_id: transactionId,
		});

		expect(response.error_code).toBe(ErrorCodes.ADDRESS_LOCKED);
		await lockManager.releaseMultiLock([sourceAddress], lockToken!);
	});

	it("rejects transfers with an invalid destination address", async () => {
		const source = newLayer2Address();
		const invalidDestinationAddress = "invalid-address";
		const amount = 100;
		const fee = 10;
		const response = await createHandlers().pushTransaction({
			amount,
			destination_address_public_key: invalidDestinationAddress,
			fee,
			signature: "dummy_sig",
			source_address_public_key: source.public_key_str_base58,
			transaction_id: crypto.randomUUID(),
		});

		expect(response.error_code).toBe(ErrorCodes.INVALID_DESTINATION_ADDRESS);
	});

	it("persists a queued transfer into postgres via dbwriter", async () => {
		const source = newLayer2Address();
		const dest = newLayer2Address();
		const initialBalance = 1000;
		const transferAmount = 100;
		const fee = 10;
		const expectedSourceBalance = initialBalance - transferAmount;
		const transactionId = crypto.randomUUID();

		await db.insert(layer2AddressBalance).values({
			address: source.public_key_str_base58,
			balance: initialBalance,
		});

		const message = buildTransferMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			source.public_key_str_base58,
			dest.public_key_str_base58,
			transferAmount,
			fee,
			transactionId,
		);
		const signature = await source.signMessage(message);
		const response = await createHandlers().pushTransaction({
			amount: transferAmount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: source.public_key_str_base58,
			transaction_id: transactionId,
		});
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);

		await drainPendingQueues();

		const inserted = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, transactionId))
			.limit(1);
		expect(inserted).toHaveLength(1);
		expect(inserted[0]?.amount).toBe(transferAmount);

		const sourceBalance = await db
			.select()
			.from(layer2AddressBalance)
			.where(eq(layer2AddressBalance.address, source.public_key_str_base58))
			.limit(1);
		expect(sourceBalance[0]?.balance).toBe(expectedSourceBalance);

		const destBalance = await db
			.select()
			.from(layer2AddressBalance)
			.where(eq(layer2AddressBalance.address, dest.public_key_str_base58))
			.limit(1);
		expect(destBalance[0]?.balance).toBe(transferAmount);

		// After commit, bloom filter should reject the same transaction id without
		// relying on a fresh Postgres hit for the negative (absent) path.
		const duplicate = await createHandlers().pushTransaction({
			amount: transferAmount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: source.public_key_str_base58,
			transaction_id: transactionId,
		});
		expect(duplicate.error_code).toBe(ErrorCodes.CANNOT_DUPLICATE_TRANSACTION);
	});
});
