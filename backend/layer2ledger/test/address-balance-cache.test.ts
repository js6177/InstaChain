import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { BalanceCacheEvictionPolicy } from "@openl2/config-loader";
import { eq } from "drizzle-orm";
import {
	buildTransferMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import { ErrorCodes } from "../src/api/models/common";
import { layer2AddressBalance } from "../src/db/schema";
import {
	balanceCacheKey,
	getCachedAddressBalance,
	setCachedAddressBalance,
} from "../src/redis/address-balance-cache";
import {
	backendCommon,
	balanceCache,
	createHandlers,
	db,
	drainPendingQueues,
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

describe("address balance redis cache", () => {
	it("serves pushTransaction from cache after a cache warm", async () => {
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
		await setCachedAddressBalance(
			redisAddressBalance,
			source.public_key_str_base58,
			initialBalance,
			balanceCache,
		);

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
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(
			await getCachedAddressBalance(
				redisAddressBalance,
				source.public_key_str_base58,
			),
		).toBe(initialBalance);
	});

	it("updates cached absolute balances after dbwriter batch commit", async () => {
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
		const response = await createHandlers().pushTransaction({
			amount,
			destination_address_public_key: dest.public_key_str_base58,
			fee,
			signature,
			source_address_public_key: source.public_key_str_base58,
			transaction_id: transactionId,
		});
		expect(response.error_code).toBe(ErrorCodes.SUCCESS);

		await drainPendingQueues();

		expect(
			await getCachedAddressBalance(
				redisAddressBalance,
				source.public_key_str_base58,
			),
		).toBe(initialBalance - amount);
		expect(
			await getCachedAddressBalance(
				redisAddressBalance,
				dest.public_key_str_base58,
			),
		).toBe(amount);

		const sourceRow = await db
			.select()
			.from(layer2AddressBalance)
			.where(eq(layer2AddressBalance.address, source.public_key_str_base58))
			.limit(1);
		expect(sourceRow[0]?.balance).toBe(initialBalance - amount);
	});

	it("applies TTL eviction policy when configured", async () => {
		const address = newLayer2Address().public_key_str_base58;
		await setCachedAddressBalance(redisAddressBalance, address, 42, {
			evictionPolicy: BalanceCacheEvictionPolicy.Ttl,
			ttlSeconds: 2,
		});
		expect(await getCachedAddressBalance(redisAddressBalance, address)).toBe(
			42,
		);
		const ttl = await redisAddressBalance.ttl(balanceCacheKey(address));
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(2);
	});
});
