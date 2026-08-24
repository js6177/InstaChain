import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ErrorCodes } from "../src/api/models/common";
import {
	TransactionType,
	transactions,
} from "../src/db/schema";
import {
	apiHandlerConfig,
	createHandlers,
	db,
	insertAddressBalance,
	insertAddressBalances,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
});

afterAll(async () => {
	await teardownLedgerTests();
});

describe("explorer route handlers", () => {
	it("returns balances for known addresses", async () => {
		const publicKey1 = `pk1-${crypto.randomUUID()}`;
		const publicKey2 = `pk2-${crypto.randomUUID()}`;
		const balance1 = 100;
		const balance2 = 200;
		await insertAddressBalances([
			{ address: publicKey1, balance: balance1 },
			{ address: publicKey2, balance: balance2 },
		]);

		const response = await createHandlers().getBalance({
			public_keys: [publicKey1, publicKey2],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.balance).toHaveLength(2);
		expect(response.balance[0]).toEqual({
			public_key: publicKey1,
			balance: balance1,
			address_found: true,
		});
		expect(response.balance[1]).toEqual({
			public_key: publicKey2,
			balance: balance2,
			address_found: true,
		});
	});

	it("returns zero balance for unknown addresses", async () => {
		const publicKey1 = `pk1-${crypto.randomUUID()}`;
		const unknownKey = `new-${crypto.randomUUID()}`;
		const balance1 = 100;
		await insertAddressBalance(publicKey1, balance1);

		const response = await createHandlers().getBalance({
			public_keys: [publicKey1, unknownKey],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.balance[0]?.address_found).toBe(true);
		expect(response.balance[0]?.balance).toBe(balance1);
		expect(response.balance[1]).toEqual({
			public_key: unknownKey,
			balance: 0,
			address_found: false,
		});
	});

	it("returns a transaction by id", async () => {
		const layer2TransactionId = `tx-${crypto.randomUUID()}`;
		const sender = `sender-${crypto.randomUUID()}`;
		const recipient = `recipient-${crypto.randomUUID()}`;
		const amount = 50;
		const fee = 0;
		const signature = "test_signature";
		const signatureDate = 0;
		const transactionType = TransactionType.TRX_TRANSFER;
		await db.insert(transactions).values({
			layer2TransactionId,
			sourceAddressPubkey: sender,
			destinationAddressPubkey: recipient,
			amount,
			fee,
			signature,
			signatureDate,
			transactionType,
			layer1TransactionId: "",
			layer2WithdrawalId: "",
		});

		const response = await createHandlers().getTransaction({
			layer2_transaction_id: layer2TransactionId,
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.transaction?.layer2_transaction_id).toBe(
			layer2TransactionId,
		);
		expect(response.transaction?.source_address_pubkey).toBe(sender);
		expect(response.transaction?.destination_address_pubkey).toBe(recipient);
		expect(response.transaction?.amount).toBe(amount);
		expect(response.transaction?.signature).toBe(signature);
		expect(response.transaction?.transaction_type).toBe(transactionType);
	});

	it("returns not found for an unknown transaction id", async () => {
		const missingTransactionId = `missing-${crypto.randomUUID()}`;
		const response = await createHandlers().getTransaction({
			layer2_transaction_id: missingTransactionId,
		});

		expect(response.error_code).toBe(ErrorCodes.TRANSACTION_ID_NOT_FOUND);
		expect(response.transaction).toBeNull();
	});

	it("returns all transactions related to the requested public keys", async () => {
		const publicKey1 = `pk1-${crypto.randomUUID()}`;
		const publicKey2 = `pk2-${crypto.randomUUID()}`;
		const publicKey3 = `pk3-${crypto.randomUUID()}`;
		const tx1 = `tx1-${crypto.randomUUID()}`;
		const tx2 = `tx2-${crypto.randomUUID()}`;
		const tx3 = `tx3-${crypto.randomUUID()}`;
		const amount1 = 10;
		const amount2 = 20;
		const amount3 = 30;
		const fee = 0;
		const signature1 = "sig1";
		const signature2 = "sig2";
		const signature3 = "sig3";
		const signatureDate = 0;
		const transactionType = TransactionType.TRX_TRANSFER;

		await db.insert(transactions).values([
			{
				layer2TransactionId: tx1,
				sourceAddressPubkey: publicKey1,
				destinationAddressPubkey: publicKey2,
				amount: amount1,
				fee,
				signature: signature1,
				signatureDate,
				transactionType,
			},
			{
				layer2TransactionId: tx2,
				sourceAddressPubkey: publicKey2,
				destinationAddressPubkey: publicKey3,
				amount: amount2,
				fee,
				signature: signature2,
				signatureDate,
				transactionType,
			},
			{
				layer2TransactionId: tx3,
				sourceAddressPubkey: publicKey1,
				destinationAddressPubkey: publicKey3,
				amount: amount3,
				fee,
				signature: signature3,
				signatureDate,
				transactionType,
			},
		]);

		const requestedPublicKeys = [publicKey1, publicKey2];
		const expectedTxIds = new Set([tx1, tx2, tx3]);
		const response = await createHandlers().getAllTransactions({
			public_keys: requestedPublicKeys,
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.transaction_groups).toHaveLength(
			requestedPublicKeys.length,
		);
		const txIds = new Set<string>();
		for (const group of response.transaction_groups) {
			for (const tx of group.transactions) {
				txIds.add(tx.layer2_transaction_id);
			}
		}
		expect(txIds).toEqual(expectedTxIds);
	});

	it("returns empty transaction groups for unknown public keys", async () => {
		const missingPublicKey = `missing-${crypto.randomUUID()}`;
		const response = await createHandlers().getAllTransactions({
			public_keys: [missingPublicKey],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.transaction_groups).toHaveLength(1);
		expect(response.transaction_groups[0]?.transactions).toHaveLength(0);
	});

	it("returns the configured minimum layer1 fee", async () => {
		const expectedFee = apiHandlerConfig.minimum_layer1_transaction_amount;
		const response = await createHandlers().getFee({});
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.fee).toBe(expectedFee);
	});
});
