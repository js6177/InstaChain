import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { desc } from "drizzle-orm";
import { transactionIdBloomFilters } from "../src/db/schema";
import {
	addTransactionIdsToBloomFilter,
	bloomMaybeContainsTransactionId,
	decodeBloomFilterDump,
	dumpBloomFilterBytes,
	encodeBloomFilterDump,
	ensureTransactionIdBloomFilter,
	loadBloomFilterBytes,
	persistBloomFilterSnapshot,
	TRANSACTION_ID_BLOOM_KEY,
} from "../src/redis/transaction-id-bloom";
import {
	db,
	redisTransaction,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
}, 60_000);

afterAll(async () => {
	await teardownLedgerTests();
});

describe("transaction id bloom filter", () => {
	it("round-trips dump framing bytes", () => {
		const payload = encodeBloomFilterDump([
			{ iterator: 1n, data: Buffer.from([1, 2, 3]) },
			{ iterator: 9n, data: Buffer.from("hello") },
		]);
		const decoded = decodeBloomFilterDump(payload);
		expect(decoded).toHaveLength(2);
		expect(decoded[0]?.iterator).toBe(1n);
		expect(decoded[0]?.data.equals(Buffer.from([1, 2, 3]))).toBe(true);
		expect(decoded[1]?.iterator).toBe(9n);
		expect(decoded[1]?.data.equals(Buffer.from("hello"))).toBe(true);
	});

	it("skips postgres when bloom says absent, and persists restoreable snapshots", async () => {
		await redisTransaction.del(TRANSACTION_ID_BLOOM_KEY);
		await ensureTransactionIdBloomFilter(db, redisTransaction);

		const unknownId = `bloom-absent-${crypto.randomUUID()}`;
		expect(await bloomMaybeContainsTransactionId(redisTransaction, unknownId)).toBe(
			false,
		);

		const knownId = `bloom-present-${crypto.randomUUID()}`;
		await addTransactionIdsToBloomFilter(redisTransaction, [knownId]);
		expect(await bloomMaybeContainsTransactionId(redisTransaction, knownId)).toBe(true);

		const batchHeight = 42_001;
		await persistBloomFilterSnapshot(db, redisTransaction, batchHeight);

		const [stored] = await db
			.select()
			.from(transactionIdBloomFilters)
			.orderBy(desc(transactionIdBloomFilters.batchHeight))
			.limit(1);
		expect(stored?.batchHeight).toBe(batchHeight);
		expect(stored?.bloomFilter.length).toBeGreaterThan(0);

		const dumped = await dumpBloomFilterBytes(redisTransaction);
		await redisTransaction.del(TRANSACTION_ID_BLOOM_KEY);
		await loadBloomFilterBytes(redisTransaction, dumped);
		expect(await bloomMaybeContainsTransactionId(redisTransaction, knownId)).toBe(true);
		expect(await bloomMaybeContainsTransactionId(redisTransaction, unknownId)).toBe(
			false,
		);

		await redisTransaction.del(TRANSACTION_ID_BLOOM_KEY);
		await ensureTransactionIdBloomFilter(db, redisTransaction);
		expect(await bloomMaybeContainsTransactionId(redisTransaction, knownId)).toBe(true);
	});
});
