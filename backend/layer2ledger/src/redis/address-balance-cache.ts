import {
	BalanceCacheEvictionPolicy,
	DEFAULT_BALANCE_CACHE_TTL_SECONDS,
	parseBalanceCacheEvictionPolicy,
} from "@openl2/config-loader";
import type Redis from "ioredis";

/** Redis key prefix for absolute layer2 address balances. */
export const ADDRESS_BALANCE_CACHE_KEY_PREFIX = "Layer2AddressBalance";

/** Shared counters for balance-cache read hits/misses (across apihandler replicas). */
export const ADDRESS_BALANCE_CACHE_HITS_KEY = "Layer2AddressBalanceStats:hits";
export const ADDRESS_BALANCE_CACHE_MISSES_KEY =
	"Layer2AddressBalanceStats:misses";

export interface AddressBalanceCacheOptions {
	evictionPolicy: BalanceCacheEvictionPolicy;
	ttlSeconds: number;
}

export interface AddressBalanceCacheStats {
	hits: number;
	misses: number;
}

export function balanceCacheKey(address: string): string {
	return `${ADDRESS_BALANCE_CACHE_KEY_PREFIX}:${address}`;
}

export function resolveAddressBalanceCacheOptions(redisSettings: {
	balance_cache_eviction_policy?: string;
	balance_cache_ttl_seconds?: number;
}): AddressBalanceCacheOptions {
	const evictionPolicy = parseBalanceCacheEvictionPolicy(
		redisSettings.balance_cache_eviction_policy,
	);
	const ttlSeconds =
		redisSettings.balance_cache_ttl_seconds ?? DEFAULT_BALANCE_CACHE_TTL_SECONDS;
	if (
		evictionPolicy === BalanceCacheEvictionPolicy.Ttl &&
		(!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
	) {
		throw new Error(
			"balance_cache_ttl_seconds must be a positive number when eviction policy is ttl",
		);
	}
	return { evictionPolicy, ttlSeconds };
}

/**
 * Returns the cached absolute balance, or null on cache miss.
 */
export async function getCachedAddressBalance(
	redis: Redis,
	address: string,
): Promise<number | null> {
	const raw = await redis.get(balanceCacheKey(address));
	if (raw === null) {
		return null;
	}
	const balance = Number(raw);
	if (!Number.isFinite(balance)) {
		await redis.del(balanceCacheKey(address));
		return null;
	}
	return balance;
}

/**
 * Write absolute balances into Redis according to the configured eviction policy.
 */
export async function setCachedAddressBalances(
	redis: Redis,
	balances: ReadonlyArray<{ address: string; balance: number }>,
	options: AddressBalanceCacheOptions,
): Promise<void> {
	if (balances.length === 0) {
		return;
	}

	const pipeline = redis.pipeline();
	for (const { address, balance } of balances) {
		const key = balanceCacheKey(address);
		const value = String(balance);
		if (options.evictionPolicy === BalanceCacheEvictionPolicy.Ttl) {
			pipeline.set(key, value, "EX", options.ttlSeconds);
		} else {
			pipeline.set(key, value);
		}
	}
	await pipeline.exec();
}

export async function setCachedAddressBalance(
	redis: Redis,
	address: string,
	balance: number,
	options: AddressBalanceCacheOptions,
): Promise<void> {
	await setCachedAddressBalances(redis, [{ address, balance }], options);
}

/** Best-effort clear of balance cache keys (tests / maintenance). */
export async function clearAddressBalanceCache(redis: Redis): Promise<void> {
	const pattern = `${ADDRESS_BALANCE_CACHE_KEY_PREFIX}:*`;
	let cursor = "0";
	do {
		const [nextCursor, keys] = await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			500,
		);
		cursor = nextCursor;
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	} while (cursor !== "0");
}

export async function recordAddressBalanceCacheHit(redis: Redis): Promise<void> {
	await redis.incr(ADDRESS_BALANCE_CACHE_HITS_KEY);
}

export async function recordAddressBalanceCacheMiss(
	redis: Redis,
): Promise<void> {
	await redis.incr(ADDRESS_BALANCE_CACHE_MISSES_KEY);
}

export async function resetAddressBalanceCacheStats(
	redis: Redis,
): Promise<void> {
	await redis.mset(
		ADDRESS_BALANCE_CACHE_HITS_KEY,
		"0",
		ADDRESS_BALANCE_CACHE_MISSES_KEY,
		"0",
	);
}

export async function getAddressBalanceCacheStats(
	redis: Redis,
): Promise<AddressBalanceCacheStats> {
	const [hitsRaw, missesRaw] = await redis.mget(
		ADDRESS_BALANCE_CACHE_HITS_KEY,
		ADDRESS_BALANCE_CACHE_MISSES_KEY,
	);
	return {
		hits: Number(hitsRaw ?? 0) || 0,
		misses: Number(missesRaw ?? 0) || 0,
	};
}
