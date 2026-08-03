import { and, asc, desc, gt } from "drizzle-orm";
import { Command, type Redis } from "ioredis";
import type { Layer2LedgerDbClient } from "../db/client";
import {
	transactionIdBloomFilters,
	transactions,
} from "../db/schema";

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

/** RedisBloom key holding committed layer2 transaction IDs. */
export const TRANSACTION_ID_BLOOM_KEY = "Layer2TransactionIds";

/** Initial capacity for a new scaling bloom filter (grows via EXPANSION). */
export const TRANSACTION_ID_BLOOM_CAPACITY = 1_000_000;

/** Target false-positive rate for new bloom filters. */
export const TRANSACTION_ID_BLOOM_ERROR_RATE = 0.001;

const DUMP_FORMAT_VERSION = 1;

/**
 * Returns false only when the ID is definitely absent from the bloom filter.
 * A true result is a maybe (false positive possible) and must be confirmed in Postgres
 * by the caller.
 */
export async function bloomMaybeContainsTransactionId(
	redis: Redis,
	layer2TransactionId: string,
): Promise<boolean> {
	const result = await redis.call(
		"BF.EXISTS",
		TRANSACTION_ID_BLOOM_KEY,
		layer2TransactionId,
	);
	return Number(result) === 1;
}

export async function addTransactionIdsToBloomFilter(
	redis: Redis,
	layer2TransactionIds: readonly string[],
): Promise<void> {
	if (layer2TransactionIds.length === 0) {
		return;
	}
	await redis.call(
		"BF.MADD",
		TRANSACTION_ID_BLOOM_KEY,
		...layer2TransactionIds,
	);
}

/**
 * Encode BF.SCANDUMP chunks as a single Buffer payload:
 * version(u32 BE) | count(u32 BE) | repeated { iterator(u64 BE) | len(u32 BE) | data }.
 */
export function encodeBloomFilterDump(
	chunks: ReadonlyArray<{ iterator: number | bigint; data: Buffer }>,
): Buffer {
	const parts: Buffer[] = [];
	const header = Buffer.alloc(8);
	header.writeUInt32BE(DUMP_FORMAT_VERSION, 0);
	header.writeUInt32BE(chunks.length, 4);
	parts.push(header);

	for (const chunk of chunks) {
		const meta = Buffer.alloc(12);
		meta.writeBigUInt64BE(BigInt(chunk.iterator), 0);
		meta.writeUInt32BE(chunk.data.length, 8);
		parts.push(meta, chunk.data);
	}
	return Buffer.concat(parts);
}

export function decodeBloomFilterDump(
	payload: Buffer,
): Array<{ iterator: bigint; data: Buffer }> {
	if (payload.length < 8) {
		throw new Error("Bloom filter dump is truncated");
	}
	const version = payload.readUInt32BE(0);
	if (version !== DUMP_FORMAT_VERSION) {
		throw new Error(`Unsupported bloom filter dump version ${version}`);
	}
	const count = payload.readUInt32BE(4);
	let offset = 8;
	const chunks: Array<{ iterator: bigint; data: Buffer }> = [];
	for (let i = 0; i < count; i += 1) {
		if (offset + 12 > payload.length) {
			throw new Error("Bloom filter dump chunk header is truncated");
		}
		const iterator = payload.readBigUInt64BE(offset);
		const len = payload.readUInt32BE(offset + 8);
		offset += 12;
		if (offset + len > payload.length) {
			throw new Error("Bloom filter dump chunk data is truncated");
		}
		chunks.push({
			iterator,
			data: payload.subarray(offset, offset + len),
		});
		offset += len;
	}
	return chunks;
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

export async function dumpBloomFilterBytes(redis: Redis): Promise<Buffer> {
	const chunks: Array<{ iterator: number | bigint; data: Buffer }> = [];
	let iterator: number | bigint = 0;
	for (;;) {
		const reply = (await redisCallBinary(redis, [
			"BF.SCANDUMP",
			TRANSACTION_ID_BLOOM_KEY,
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

export async function loadBloomFilterBytes(
	redis: Redis,
	payload: Buffer,
): Promise<void> {
	await redis.del(TRANSACTION_ID_BLOOM_KEY);
	const chunks = decodeBloomFilterDump(payload);
	for (const chunk of chunks) {
		await redisCallBinary(redis, [
			"BF.LOADCHUNK",
			TRANSACTION_ID_BLOOM_KEY,
			String(chunk.iterator),
			chunk.data,
		]);
	}
}

export async function reserveTransactionIdBloomFilter(
	redis: Redis,
): Promise<void> {
	await redis.call(
		"BF.RESERVE",
		TRANSACTION_ID_BLOOM_KEY,
		String(TRANSACTION_ID_BLOOM_ERROR_RATE),
		String(TRANSACTION_ID_BLOOM_CAPACITY),
	);
}

export async function persistBloomFilterSnapshot(
	db: Layer2LedgerDbClient,
	redis: Redis,
	batchHeight: number,
): Promise<void> {
	const bloomFilter = await dumpBloomFilterBytes(redis);
	await db
		.insert(transactionIdBloomFilters)
		.values({ batchHeight, bloomFilter })
		.onConflictDoUpdate({
			target: transactionIdBloomFilters.batchHeight,
			set: { bloomFilter },
		});
}

async function addTransactionIdsFromPostgres(
	db: Layer2LedgerDbClient,
	redis: Redis,
	afterBatchHeight: number,
): Promise<void> {
	const pageSize = 2000;
	let lastId: string | null = null;
	for (;;) {
		const filters = [];
		if (afterBatchHeight > 0) {
			filters.push(gt(transactions.batchHeight, afterBatchHeight));
		}
		if (lastId !== null) {
			filters.push(gt(transactions.layer2TransactionId, lastId));
		}
		const query = db
			.select({ id: transactions.layer2TransactionId })
			.from(transactions)
			.orderBy(asc(transactions.layer2TransactionId))
			.limit(pageSize);
		const rows =
			filters.length > 0
				? await query.where(and(...filters))
				: await query;

		if (rows.length === 0) {
			return;
		}
		await addTransactionIdsToBloomFilter(
			redis,
			rows.map((row) => row.id),
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

/**
 * Ensure the Redis bloom filter exists, restoring the latest Postgres snapshot
 * (and catching up any newer committed IDs) when Redis was empty after restart.
 */
export async function ensureTransactionIdBloomFilter(
	db: Layer2LedgerDbClient,
	redis: Redis,
): Promise<void> {
	const exists = await redis.exists(TRANSACTION_ID_BLOOM_KEY);
	if (exists === 1) {
		return;
	}

	const [latest] = await db
		.select()
		.from(transactionIdBloomFilters)
		.orderBy(desc(transactionIdBloomFilters.batchHeight))
		.limit(1);

	if (latest) {
		await loadBloomFilterBytes(redis, latest.bloomFilter);
		await addTransactionIdsFromPostgres(db, redis, latest.batchHeight);
		return;
	}

	try {
		await reserveTransactionIdBloomFilter(redis);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// Concurrent startup may race on BF.RESERVE.
		if (!message.includes("item exists") && !message.includes("exists")) {
			throw error;
		}
	}
	// Unit tests set this to avoid replaying huge leftover datasets into Redis.
	if (process.env.SKIP_BLOOM_PG_REBUILD === "1") {
		return;
	}
	await addTransactionIdsFromPostgres(db, redis, 0);
}
