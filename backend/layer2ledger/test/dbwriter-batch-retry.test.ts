import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { TransactionType, transactions } from "../src/db/schema";
import {
	DBWRITER_FAILED_ROW_TTL_SECONDS,
	DbwriterFailedRowKind,
	loadDbwriterFailedRow,
} from "../src/redis/dbwriter-failed-rows";
import {
	PENDING_TRANSACTIONS_LIST_KEY,
} from "../src/redis/distributed-lock";
import {
	createRedisTransaction,
	type PendingTransaction,
} from "../src/redis/models";
import {
	db,
	drainPendingQueues,
	newLayer2Address,
	redisDiagnostics,
	redisTransaction,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

/** Postgres `integer` max; one above this fails the insert. */
const POSTGRES_INTEGER_OVERFLOW = 2_147_483_648;

beforeAll(async () => {
	await setupLedgerTests();
}, 60_000);

afterAll(async () => {
	await teardownLedgerTests();
});

function pendingTransfer(options: {
	amount: number;
	source: string;
	destination: string;
	transactionId: string;
}): PendingTransaction {
	return {
		transaction: createRedisTransaction(
			options.amount,
			0,
			options.source,
			options.destination,
			TransactionType.TRX_TRANSFER,
			options.transactionId,
			"test-signature",
		),
		lock_token: null,
		addresses_locked: [],
	};
}

describe("dbwriter binary batch retry", () => {
	it("commits valid rows, isolates the failing row, and stores it in diagnostics redis", async () => {
		const sourceA = newLayer2Address().public_key_str_base58;
		const destA = newLayer2Address().public_key_str_base58;
		const sourceB = newLayer2Address().public_key_str_base58;
		const destB = newLayer2Address().public_key_str_base58;
		const sourceBad = newLayer2Address().public_key_str_base58;
		const destBad = newLayer2Address().public_key_str_base58;

		const validIdA = `valid-a-${crypto.randomUUID()}`;
		const badId = `bad-${crypto.randomUUID()}`;
		const validIdB = `valid-b-${crypto.randomUUID()}`;

		const pendingRows: PendingTransaction[] = [
			pendingTransfer({
				amount: 100,
				source: sourceA,
				destination: destA,
				transactionId: validIdA,
			}),
			pendingTransfer({
				amount: POSTGRES_INTEGER_OVERFLOW,
				source: sourceBad,
				destination: destBad,
				transactionId: badId,
			}),
			pendingTransfer({
				amount: 250,
				source: sourceB,
				destination: destB,
				transactionId: validIdB,
			}),
		];

		await redisTransaction.rpush(
			PENDING_TRANSACTIONS_LIST_KEY,
			...pendingRows.map((row) => JSON.stringify(row)),
		);
		expect(await redisTransaction.llen(PENDING_TRANSACTIONS_LIST_KEY)).toBe(3);

		await drainPendingQueues();

		expect(await redisTransaction.llen(PENDING_TRANSACTIONS_LIST_KEY)).toBe(0);

		const committedA = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, validIdA))
			.limit(1);
		const committedB = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, validIdB))
			.limit(1);
		const committedBad = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, badId))
			.limit(1);

		expect(committedA).toHaveLength(1);
		expect(committedA[0]?.amount).toBe(100);
		expect(committedB).toHaveLength(1);
		expect(committedB[0]?.amount).toBe(250);
		expect(committedBad).toHaveLength(0);

		const failed = await loadDbwriterFailedRow(redisDiagnostics, badId);
		expect(failed).not.toBeNull();
		expect(failed?.kind).toBe(DbwriterFailedRowKind.Transfer);
		expect(failed?.layer2TransactionId).toBe(badId);
		expect(failed?.errorMessage.length).toBeGreaterThan(0);

		const ttl = await redisDiagnostics.ttl(
			`Layer2Diagnostics:dbwriter_failed_row:${badId}`,
		);
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(DBWRITER_FAILED_ROW_TTL_SECONDS);
	});

	it("with one trailing bad row in a power-of-two batch, successful writes equal log2(n)", async () => {
		const batchSize = 16;
		const expectedSuccessfulWrites = Math.log2(batchSize);
		expect(Number.isInteger(expectedSuccessfulWrites)).toBe(true);

		const pendingRows: PendingTransaction[] = [];
		const validIds: string[] = [];
		for (let i = 0; i < batchSize - 1; i++) {
			const transactionId = `log2-valid-${i}-${crypto.randomUUID()}`;
			validIds.push(transactionId);
			pendingRows.push(
				pendingTransfer({
					amount: 10 + i,
					source: newLayer2Address().public_key_str_base58,
					destination: newLayer2Address().public_key_str_base58,
					transactionId,
				}),
			);
		}
		const badId = `log2-bad-${crypto.randomUUID()}`;
		pendingRows.push(
			pendingTransfer({
				amount: POSTGRES_INTEGER_OVERFLOW,
				source: newLayer2Address().public_key_str_base58,
				destination: newLayer2Address().public_key_str_base58,
				transactionId: badId,
			}),
		);

		await redisTransaction.rpush(
			PENDING_TRANSACTIONS_LIST_KEY,
			...pendingRows.map((row) => JSON.stringify(row)),
		);

		let successfulBatchWrites = 0;
		await drainPendingQueues({
			onSuccessfulBatchWrite: () => {
				successfulBatchWrites += 1;
			},
		});

		expect(successfulBatchWrites).toBe(expectedSuccessfulWrites);
		expect(await redisTransaction.llen(PENDING_TRANSACTIONS_LIST_KEY)).toBe(0);

		for (const validId of validIds) {
			const rows = await db
				.select()
				.from(transactions)
				.where(eq(transactions.layer2TransactionId, validId))
				.limit(1);
			expect(rows).toHaveLength(1);
		}
		const committedBad = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, badId))
			.limit(1);
		expect(committedBad).toHaveLength(0);
		expect(await loadDbwriterFailedRow(redisDiagnostics, badId)).not.toBeNull();
	});
});
