import { and, asc, desc, gt } from "drizzle-orm";
import { Command, type Redis } from "ioredis";
import type { Layer2LedgerDbClient } from "../db/client";
import {
	addressBalanceBloomFilters,
	layer2AddressBalance,
	transactions,
} from "../db/schema";
import {
	decodeBloomFilterDump,
	encodeBloomFilterDump,
} from "./transaction-id-bloom";

/** Run a Redis command preserving Buffer replies (needed for BF.SCANDUMP chunks). */
async function redisCallBinary(
	redis: Redis,
	args: Array<string | Buffer>,
): Promise<unknown> {
	const [name, ...commandArgs] = args;
	if (typeof name !== "string") {
		throw new Error("Redis command name is required");
	}
	const command = new Command(name, commandArgs, {
		replyEncoding: null,
	});
	return redis.sendCommand(command);
}

/** RedisBloom key on `redis-addressbalance` for known layer2 addresses. */
export const ADDRESS_BALANCE_BLOOM_KEY = "Layer2AddressBalances";

/** Initial capacity for a new scaling bloom filter (grows via EXPANSION). */
export const ADDRESS_BALANCE_BLOOM_CAPACITY = 1_000_000;

/** Target false-positive rate for new bloom filters. */
export const ADDRESS_BALANCE_BLOOM_ERROR_RATE = 0.001;

/**
 * Returns false only when the address is definitely absent from the bloom filter.
 * A true result is a maybe (false positive possible) and must be confirmed in Postgres
 * by the caller.
 */
export async function bloomMaybeContainsAddress(
	redis: Redis,
	address: string,
): Promise<boolean> {
	const result = await redis.call(
		"BF.EXISTS",
		ADDRESS_BALANCE_BLOOM_KEY,
		address,
	);
	return Number(result) === 1;
}

export async function addAddressesToAddressBalanceBloomFilter(
	redis: Redis,
	addresses: readonly string[],
): Promise<void> {
	if (addresses.length === 0) {
		return;
	}
	await redis.call("BF.MADD", ADDRESS_BALANCE_BLOOM_KEY, ...addresses);
}

function asRedisInteger(value: unknown): bigint {
	if (typeof value === "bigint") {
		return value;
	}
	if (typeof value === "number") {
		return BigInt(value);
	}
	if (Buffer.isBuffer(value)) {
		return BigInt(value.toString("utf8"));
	}
	if (typeof value === "string") {
		return BigInt(value);
	}
	throw new Error(`Unexpected Redis integer reply: ${typeof value}`);
}

function asRedisBuffer(value: unknown): Buffer | null {
	if (value == null) {
		return null;
	}
	if (Buffer.isBuffer(value)) {
		return value;
	}
	if (typeof value === "string") {
		return Buffer.from(value, "binary");
	}
	throw new Error(`Unexpected Redis bulk reply: ${typeof value}`);
}

export async function dumpAddressBalanceBloomFilterBytes(
	redis: Redis,
): Promise<Buffer> {
	const chunks: Array<{ iterator: number | bigint; data: Buffer }> = [];
	let iterator: number | bigint = 0;
	for (;;) {
		const reply = (await redisCallBinary(redis, [
			"BF.SCANDUMP",
			ADDRESS_BALANCE_BLOOM_KEY,
			String(iterator),
		])) as [unknown, unknown];
		const next = asRedisInteger(reply[0]);
		const data = asRedisBuffer(reply[1]);
		if (next === 0n || data == null) {
			break;
		}
		chunks.push({ iterator: next, data });
		iterator = next;
	}
	return encodeBloomFilterDump(chunks);
}

export async function loadAddressBalanceBloomFilterBytes(
	redis: Redis,
	payload: Buffer,
): Promise<void> {
	await redis.del(ADDRESS_BALANCE_BLOOM_KEY);
	const chunks = decodeBloomFilterDump(payload);
	for (const chunk of chunks) {
		await redisCallBinary(redis, [
			"BF.LOADCHUNK",
			ADDRESS_BALANCE_BLOOM_KEY,
			String(chunk.iterator),
			chunk.data,
		]);
	}
}

export async function reserveAddressBalanceBloomFilter(
	redis: Redis,
): Promise<void> {
	await redis.call(
		"BF.RESERVE",
		ADDRESS_BALANCE_BLOOM_KEY,
		String(ADDRESS_BALANCE_BLOOM_ERROR_RATE),
		String(ADDRESS_BALANCE_BLOOM_CAPACITY),
	);
}

export async function persistAddressBalanceBloomFilterSnapshot(
	db: Layer2LedgerDbClient,
	redis: Redis,
	batchHeight: number,
): Promise<void> {
	const bloomFilter = await dumpAddressBalanceBloomFilterBytes(redis);
	await db
		.insert(addressBalanceBloomFilters)
		.values({ batchHeight, bloomFilter })
		.onConflictDoUpdate({
			target: addressBalanceBloomFilters.batchHeight,
			set: { bloomFilter },
		});
}

async function addAddressesFromPostgres(
	db: Layer2LedgerDbClient,
	redis: Redis,
): Promise<void> {
	const pageSize = 2000;
	let lastId = 0;
	for (;;) {
		const filters = [];
		if (lastId > 0) {
			filters.push(gt(layer2AddressBalance.id, lastId));
		}
		const query = db
			.select({
				id: layer2AddressBalance.id,
				address: layer2AddressBalance.address,
			})
			.from(layer2AddressBalance)
			.orderBy(asc(layer2AddressBalance.id))
			.limit(pageSize);
		const rows =
			filters.length > 0 ? await query.where(and(...filters)) : await query;

		if (rows.length === 0) {
			return;
		}
		await addAddressesToAddressBalanceBloomFilter(
			redis,
			rows.map((row) => row.address),
		);
		const last = rows[rows.length - 1];
		if (!last) {
			return;
		}
		lastId = last.id;
		if (rows.length < pageSize) {
			return;
		}
	}
}

/** Catch up addresses touched by batches after a restored snapshot watermark. */
async function addAddressesFromTransactionsAfterBatch(
	db: Layer2LedgerDbClient,
	redis: Redis,
	afterBatchHeight: number,
): Promise<void> {
	const pageSize = 2000;
	let lastId: string | null = null;
	for (;;) {
		const filters = [gt(transactions.batchHeight, afterBatchHeight)];
		if (lastId !== null) {
			filters.push(gt(transactions.layer2TransactionId, lastId));
		}
		const rows = await db
			.select({
				id: transactions.layer2TransactionId,
				source: transactions.sourceAddressPubkey,
				destination: transactions.destinationAddressPubkey,
			})
			.from(transactions)
			.where(and(...filters))
			.orderBy(asc(transactions.layer2TransactionId))
			.limit(pageSize);

		if (rows.length === 0) {
			return;
		}
		const addresses = new Set<string>();
		for (const row of rows) {
			addresses.add(row.source);
			addresses.add(row.destination);
		}
		await addAddressesToAddressBalanceBloomFilter(redis, [...addresses]);
		const last = rows[rows.length - 1];
		if (!last) {
			return;
		}
		lastId = last.id;
		if (rows.length < pageSize) {
			return;
		}
	}
}

/**
 * Ensure the Redis bloom filter exists on `redis-addressbalance`, restoring the
 * latest Postgres snapshot (and catching up newer addresses) when Redis was empty.
 */
export async function ensureAddressBalanceBloomFilter(
	db: Layer2LedgerDbClient,
	redis: Redis,
): Promise<void> {
	const exists = await redis.exists(ADDRESS_BALANCE_BLOOM_KEY);
	if (exists === 1) {
		return;
	}

	const [latest] = await db
		.select()
		.from(addressBalanceBloomFilters)
		.orderBy(desc(addressBalanceBloomFilters.batchHeight))
		.limit(1);

	if (latest) {
		await loadAddressBalanceBloomFilterBytes(redis, latest.bloomFilter);
		await addAddressesFromTransactionsAfterBatch(
			db,
			redis,
			latest.batchHeight,
		);
		return;
	}

	try {
		await reserveAddressBalanceBloomFilter(redis);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.includes("item exists") && !message.includes("exists")) {
			throw error;
		}
	}
	if (process.env.SKIP_BLOOM_PG_REBUILD === "1") {
		return;
	}
	await addAddressesFromPostgres(db, redis);
}
