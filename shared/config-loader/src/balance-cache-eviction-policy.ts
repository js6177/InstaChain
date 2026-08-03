/**
 * Application-level eviction policy for Redis-cached layer2 address balances.
 * Controls per-key lifetime (not Redis server maxmemory-policy).
 */
export enum BalanceCacheEvictionPolicy {
	/** Keep balance keys until overwritten; never expire. */
	None = "none",
	/** Expire each balance key after {@link RedisSettings.balance_cache_ttl_seconds}. */
	Ttl = "ttl",
}

export function parseBalanceCacheEvictionPolicy(
	value: string | undefined,
): BalanceCacheEvictionPolicy {
	if (value === undefined || value === "") {
		return BalanceCacheEvictionPolicy.None;
	}
	const policies = Object.values(BalanceCacheEvictionPolicy) as string[];
	if (!policies.includes(value)) {
		throw new Error(
			`Unknown balance_cache_eviction_policy "${value}". ` +
				`Expected one of: ${policies.join(", ")}`,
		);
	}
	return value as BalanceCacheEvictionPolicy;
}

/** Default TTL when policy is {@link BalanceCacheEvictionPolicy.Ttl}. */
export const DEFAULT_BALANCE_CACHE_TTL_SECONDS = 3600;
