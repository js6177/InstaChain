import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { desc } from "drizzle-orm";
import { ErrorCodes } from "../src/api/models/common";
import { addressBalanceBloomFilters } from "../src/db/schema";
import {
	addAddressesToAddressBalanceBloomFilter,
	ADDRESS_BALANCE_BLOOM_KEY,
	bloomMaybeContainsAddress,
	dumpAddressBalanceBloomFilterBytes,
	ensureAddressBalanceBloomFilter,
	loadAddressBalanceBloomFilterBytes,
	persistAddressBalanceBloomFilterSnapshot,
} from "../src/redis/address-balance-bloom";
import {
	createHandlers,
	db,
	insertAddressBalance,
	newLayer2Address,
	redisAddressBalance,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
}, 60_000);

afterAll(async () => {
	await teardownLedgerTests();
});

describe("address balance bloom filter", () => {
	it("skips postgres when bloom says absent, and persists restoreable snapshots", async () => {
		await redisAddressBalance.del(ADDRESS_BALANCE_BLOOM_KEY);
		await ensureAddressBalanceBloomFilter(db, redisAddressBalance);

		const unknown = newLayer2Address().public_key_str_base58;
		expect(await bloomMaybeContainsAddress(redisAddressBalance, unknown)).toBe(
			false,
		);

		const known = newLayer2Address().public_key_str_base58;
		await addAddressesToAddressBalanceBloomFilter(redisAddressBalance, [
			known,
		]);
		expect(await bloomMaybeContainsAddress(redisAddressBalance, known)).toBe(
			true,
		);

		const batchHeight = 42;
		await persistAddressBalanceBloomFilterSnapshot(
			db,
			redisAddressBalance,
			batchHeight,
		);
		const [stored] = await db
			.select()
			.from(addressBalanceBloomFilters)
			.orderBy(desc(addressBalanceBloomFilters.batchHeight))
			.limit(1);
		expect(stored?.batchHeight).toBe(batchHeight);
		expect(stored?.bloomFilter.length).toBeGreaterThan(0);

		const dumped = await dumpAddressBalanceBloomFilterBytes(
			redisAddressBalance,
		);
		await redisAddressBalance.del(ADDRESS_BALANCE_BLOOM_KEY);
		await loadAddressBalanceBloomFilterBytes(redisAddressBalance, dumped);
		expect(await bloomMaybeContainsAddress(redisAddressBalance, known)).toBe(
			true,
		);
		expect(await bloomMaybeContainsAddress(redisAddressBalance, unknown)).toBe(
			false,
		);

		await redisAddressBalance.del(ADDRESS_BALANCE_BLOOM_KEY);
		await ensureAddressBalanceBloomFilter(db, redisAddressBalance);
		expect(await bloomMaybeContainsAddress(redisAddressBalance, known)).toBe(
			true,
		);
	});

	it("getBalance reports address_found=false without seeding when bloom says absent", async () => {
		const missing = newLayer2Address().public_key_str_base58;
		const response = await createHandlers().getBalance({
			public_keys: [missing],
		});
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.balance?.[0]?.address_found).toBe(false);
		expect(response.balance?.[0]?.balance).toBe(0);
	});

	it("getBalance finds seeded addresses after bloom registration", async () => {
		const address = newLayer2Address().public_key_str_base58;
		await insertAddressBalance(address, 1234);
		const response = await createHandlers().getBalance({
			public_keys: [address],
		});
		expect(response.balance?.[0]?.address_found).toBe(true);
		expect(response.balance?.[0]?.balance).toBe(1234);
	});
});
