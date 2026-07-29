import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ErrorCodes } from "../src/api/models/common";
import {
	layer2AddressBalance,
	TransactionType,
	transactions,
} from "../src/db/schema";
import {
	apiHandlerConfig,
	createHandlers,
	db,
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
		await db.insert(layer2AddressBalance).values([
			{ address: publicKey1, balance: 100 },
			{ address: publicKey2, balance: 200 },
		]);

		const response = await createHandlers().getBalance({
			public_keys: [publicKey1, publicKey2],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.balance).toHaveLength(2);
		expect(response.balance[0]).toEqual({
			public_key: publicKey1,
			balance: 100,
			address_found: true,
		});
		expect(response.balance[1]).toEqual({
			public_key: publicKey2,
			balance: 200,
			address_found: true,
		});
	});

	it("returns zero balance for unknown addresses", async () => {
		const publicKey1 = `pk1-${crypto.randomUUID()}`;
		const unknownKey = `new-${crypto.randomUUID()}`;
		await db.insert(layer2AddressBalance).values({
			address: publicKey1,
			balance: 100,
		});

		const response = await createHandlers().getBalance({
			public_keys: [publicKey1, unknownKey],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.balance[0]?.address_found).toBe(true);
		expect(response.balance[0]?.balance).toBe(100);
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
		await db.insert(transactions).values({
			layer2TransactionId,
			sourceAddressPubkey: sender,
			destinationAddressPubkey: recipient,
			amount: 50,
			fee: 0,
			signature: "test_signature",
			signatureDate: 0,
			transactionType: TransactionType.TRX_TRANSFER,
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
		expect(response.transaction?.amount).toBe(50);
		expect(response.transaction?.signature).toBe("test_signature");
		expect(response.transaction?.transaction_type).toBe(
			TransactionType.TRX_TRANSFER,
		);
	});

	it("returns not found for an unknown transaction id", async () => {
		const response = await createHandlers().getTransaction({
			layer2_transaction_id: `missing-${crypto.randomUUID()}`,
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

		await db.insert(transactions).values([
			{
				layer2TransactionId: tx1,
				sourceAddressPubkey: publicKey1,
				destinationAddressPubkey: publicKey2,
				amount: 10,
				fee: 0,
				signature: "sig1",
				signatureDate: 0,
				transactionType: TransactionType.TRX_TRANSFER,
			},
			{
				layer2TransactionId: tx2,
				sourceAddressPubkey: publicKey2,
				destinationAddressPubkey: publicKey3,
				amount: 20,
				fee: 0,
				signature: "sig2",
				signatureDate: 0,
				transactionType: TransactionType.TRX_TRANSFER,
			},
			{
				layer2TransactionId: tx3,
				sourceAddressPubkey: publicKey1,
				destinationAddressPubkey: publicKey3,
				amount: 30,
				fee: 0,
				signature: "sig3",
				signatureDate: 0,
				transactionType: TransactionType.TRX_TRANSFER,
			},
		]);

		const response = await createHandlers().getAllTransactions({
			public_keys: [publicKey1, publicKey2],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.transaction_groups).toHaveLength(2);
		const txIds = new Set<string>();
		for (const group of response.transaction_groups) {
			for (const tx of group.transactions) {
				txIds.add(tx.layer2_transaction_id);
			}
		}
		expect(txIds).toEqual(new Set([tx1, tx2, tx3]));
	});

	it("returns empty transaction groups for unknown public keys", async () => {
		const response = await createHandlers().getAllTransactions({
			public_keys: [`missing-${crypto.randomUUID()}`],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.transaction_groups).toHaveLength(1);
		expect(response.transaction_groups[0]?.transactions).toHaveLength(0);
	});

	it("returns the configured minimum layer1 fee", async () => {
		const response = await createHandlers().getFee({});
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.fee).toBe(
			apiHandlerConfig.minimum_layer1_transaction_amount,
		);
	});
});
