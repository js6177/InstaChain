import {
	GET_BALANCE_STRESS_HISTORY_LIMIT,
	GetBalanceStressHistorySummary,
} from "@openl2/stress-results";
import type Redis from "ioredis";

/** Newest-first JSON array of getBalance stress history summaries. */
export const GET_BALANCE_STRESS_HISTORY_KEY =
	"Layer2GetBalanceStressHistory";

export async function loadGetBalanceStressHistory(
	redis: Redis,
): Promise<GetBalanceStressHistorySummary[]> {
	const raw = await redis.get(GET_BALANCE_STRESS_HISTORY_KEY);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		const entries: GetBalanceStressHistorySummary[] = [];
		for (const item of parsed) {
			const entry = GetBalanceStressHistorySummary.parse(
				(item ?? null) as GetBalanceStressHistorySummary | null,
			);
			if (entry) {
				entries.push(entry);
			}
		}
		return entries;
	} catch {
		return [];
	}
}

/** Prepend a summary and retain at most {@link GET_BALANCE_STRESS_HISTORY_LIMIT}. */
export async function prependGetBalanceStressHistory(
	redis: Redis,
	entry: GetBalanceStressHistorySummary,
	limit: number = GET_BALANCE_STRESS_HISTORY_LIMIT,
): Promise<GetBalanceStressHistorySummary[]> {
	const previous = await loadGetBalanceStressHistory(redis);
	const withoutDuplicate = previous.filter(
		(existing) => existing.batchId !== entry.batchId,
	);
	const next = [entry, ...withoutDuplicate].slice(0, Math.max(limit, 1));
	await redis.set(GET_BALANCE_STRESS_HISTORY_KEY, JSON.stringify(next));
	return next;
}
