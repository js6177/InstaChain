import { max, sql } from "drizzle-orm";
import type Redis from "ioredis";
import type { Layer2LedgerDbClient } from "../db/client";
import {
	type TransactionInsert,
	type WithdrawalRequestInsert,
	layer2AddressBalance,
	transactions,
	withdrawalRequests,
} from "../db/schema";
import {
	type AddressBalanceCacheOptions,
	setCachedAddressBalances,
} from "../redis/address-balance-cache";
import {
	addAddressesToAddressBalanceBloomFilter,
	persistAddressBalanceBloomFilterSnapshot,
} from "../redis/address-balance-bloom";
import {
	type DistributedLock,
	getPendingTransactions,
	getPendingWithdrawals,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../redis/distributed-lock";
import { setProfilerSessionId } from "@openl2/openl2-logger";
import { log } from "../logger";
import { redisTransactionToInsert, redisWithdrawalRequestToInsert } from "../redis/models";
import {
	getActiveProfilerSession,
	ProfilerApiName,
	recordPushTransactionProfilerDbwriterBatch,
	recordPushTransactionProfilerDbwriterQueueEmpty,
	recordPushTransactionProfilerDbwriterRedisActive,
	recordPushTransactionProfilerDbwriterWriteActive,
} from "../redis/profiler-session";
import {
	addTransactionIdsToBloomFilter,
	persistBloomFilterSnapshot,
} from "../redis/transaction-id-bloom";

/** Max items read from each Redis pending list per Postgres batch insert. */
export const MAXIMUM_BATCH_INSERT_COUNT = 4999;

/** Max idle sleep between dbwriter loops when the pending queue is empty. */
export const PENDING_BATCH_IDLE_SLEEP_MS = 10;

/**
 * Persist a RedisBloom Postgres snapshot every N successful batch writes.
 * BF.MADD stays on the commit path (before unlock) so apihandler duplicate
 * checks cannot false-negative; only the expensive BF.SCANDUMP is deferred.
 */
export const BLOOM_FILTER_SNAPSHOT_EVERY_N_BATCHES = 5;

/** Caller-owned deferred bloom snapshot counters (must outlive a single batch). */
export interface DeferredBloomSnapshotState {
	batchHeight: number;
	batchesSince: number;
}

export function createDeferredBloomSnapshotState(): DeferredBloomSnapshotState {
	return { batchHeight: 0, batchesSince: 0 };
}

export interface ProcessPendingBatchContext {
	db: Layer2LedgerDbClient;
	/** Locks, pending queues, and bloom filters. */
	redisTransaction: Redis;
	/** Address-balance cache only. */
	redisAddressBalance: Redis;
	/** Profiler sessions and related diagnostic keys. */
	redisDiagnostics: Redis;
	lockManager: DistributedLock;
	balanceCache: AddressBalanceCacheOptions;
	deferredBloomSnapshot: DeferredBloomSnapshotState;
}

/** Drop queued bloom snapshot work (test / stress DB resets). */
export function clearDeferredBloomFilterUpdates(
	state: DeferredBloomSnapshotState,
): void {
	state.batchHeight = 0;
	state.batchesSince = 0;
}

/** Persist RedisBloom snapshots to Postgres at the latest deferred batch height. */
export async function flushDeferredBloomFilterUpdates(
	db: Layer2LedgerDbClient,
	redisTransaction: Redis,
	redisAddressBalance: Redis,
	state: DeferredBloomSnapshotState,
): Promise<void> {
	if (state.batchesSince === 0 || state.batchHeight <= 0) {
		return;
	}
	const batchHeight = state.batchHeight;
	await persistBloomFilterSnapshot(db, redisTransaction, batchHeight);
	await persistAddressBalanceBloomFilterSnapshot(
		db,
		redisAddressBalance,
		batchHeight,
	);
	clearDeferredBloomFilterUpdates(state);
}

/**
 * Sleep after a dbwriter loop based on remaining Redis pending depth:
 * - pending > 2 * batch size → 0 (keep draining)
 * - 0 < pending < batch size → proportional to remaining capacity
 *   (e.g. 500 pending ≈ 0.125 * idle sleep)
 * - pending === 0 → full idle sleep
 * - otherwise (full batch waiting) → 0
 */
export function pendingQueueSleepMs(
	pendingCount: number,
	batchSize: number = MAXIMUM_BATCH_INSERT_COUNT,
	idleSleepMs: number = PENDING_BATCH_IDLE_SLEEP_MS,
): number {
	if (pendingCount > 2 * batchSize) {
		return 0;
	}
	if (pendingCount <= 0) {
		return idleSleepMs;
	}
	if (pendingCount < batchSize) {
		return ((batchSize - pendingCount) / batchSize) * idleSleepMs;
	}
	return 0;
}

/**
 * Drain pending Redis transfer/withdrawal queues into Postgres and release locks.
 * Used by the dbwriter loop and by functional tests.
 */
export async function processPendingBatch(
	context: ProcessPendingBatchContext,
	currentBatchHeight: number,
): Promise<number> {
	const startedAt = performance.now();
	const {
		db,
		redisTransaction,
		redisAddressBalance,
		redisDiagnostics,
		lockManager,
		balanceCache,
		deferredBloomSnapshot,
	} = context;
	const transactionsToProcess = await getPendingTransactions(
		redisTransaction,
		0,
		MAXIMUM_BATCH_INSERT_COUNT,
	);
	const withdrawalsToProcess = await getPendingWithdrawals(
		redisTransaction,
		0,
		MAXIMUM_BATCH_INSERT_COUNT,
	);

	if (
		transactionsToProcess.length === 0 &&
		withdrawalsToProcess.length === 0
	) {
		await recordQueueEmpty(redisDiagnostics);
		return currentBatchHeight;
	}

	const nextBatchHeight = currentBatchHeight + 1;
	const newTransactions: TransactionInsert[] = [];
	const newWithdrawals: WithdrawalRequestInsert[] = [];
	const balanceUpdates = new Map<string, number>();

	for (const pendingTx of transactionsToProcess) {
		pendingTx.transaction.batch_height = nextBatchHeight;
		newTransactions.push(redisTransactionToInsert(pendingTx.transaction));

		const source = pendingTx.transaction.source_address_pubkey;
		const dest = pendingTx.transaction.destination_address_pubkey;
		const amount = pendingTx.transaction.amount;
		balanceUpdates.set(source, (balanceUpdates.get(source) ?? 0) - amount);
		balanceUpdates.set(dest, (balanceUpdates.get(dest) ?? 0) + amount);
	}

	for (const pendingWithdrawal of withdrawalsToProcess) {
		pendingWithdrawal.transaction.batch_height = nextBatchHeight;
		pendingWithdrawal.withdrawal_request.batch_height = nextBatchHeight;

		newTransactions.push(
			redisTransactionToInsert(pendingWithdrawal.transaction),
		);
		newWithdrawals.push(
			redisWithdrawalRequestToInsert(pendingWithdrawal.withdrawal_request),
		);

		const source = pendingWithdrawal.transaction.source_address_pubkey;
		const amount = pendingWithdrawal.transaction.amount;
		balanceUpdates.set(source, (balanceUpdates.get(source) ?? 0) - amount);
	}

	const addressBalances = Array.from(balanceUpdates.entries()).map(
		([address, balance]) => ({ address, balance }),
	);

	let absoluteBalances: Array<{ address: string; balance: number }> = [];
	await recordWriteActive(redisDiagnostics, true);
	try {
		await db.transaction(async (tx) => {
			if (newTransactions.length > 0) {
				await tx.insert(transactions).values(newTransactions);
			}
			if (newWithdrawals.length > 0) {
				await tx.insert(withdrawalRequests).values(newWithdrawals);
			}
			if (addressBalances.length > 0) {
				// RETURNING yields post-upsert absolute balances (no extra SELECT).
				absoluteBalances = await tx
					.insert(layer2AddressBalance)
					.values(addressBalances)
					.onConflictDoUpdate({
						target: layer2AddressBalance.address,
						set: {
							balance: sql`${layer2AddressBalance.balance} + excluded.balance`,
						},
					})
					.returning({
						address: layer2AddressBalance.address,
						balance: layer2AddressBalance.balance,
					});
			}
		});
	} finally {
		await recordWriteActive(redisDiagnostics, false);
	}

	await recordRedisActive(redisDiagnostics, true);
	try {
		if (transactionsToProcess.length > 0) {
			await redisTransaction.ltrim(
				PENDING_TRANSACTIONS_LIST_KEY,
				transactionsToProcess.length,
				-1,
			);
		}
		if (withdrawalsToProcess.length > 0) {
			await redisTransaction.ltrim(
				PENDING_WITHDRAWALS_LIST_KEY,
				withdrawalsToProcess.length,
				-1,
			);
		}

		// Keep RedisBloom filters in sync with Postgres before unlocks.
		const committedTransactionIds = newTransactions.map(
			(tx) => tx.layer2TransactionId,
		);
		await addTransactionIdsToBloomFilter(redisTransaction, committedTransactionIds);
		await addAddressesToAddressBalanceBloomFilter(
			redisAddressBalance,
			addressBalances.map((row) => row.address),
		);

		// Unlock ASAP; defer only the expensive BF.SCANDUMP snapshot.
		const locksToRelease: Array<{ userIds: string[]; lockToken: string }> = [];
		for (const pendingTx of transactionsToProcess) {
			if (pendingTx.lock_token) {
				locksToRelease.push({
					userIds: pendingTx.addresses_locked,
					lockToken: pendingTx.lock_token,
				});
			}
		}
		for (const pendingWithdrawal of withdrawalsToProcess) {
			if (pendingWithdrawal.lock_token) {
				locksToRelease.push({
					userIds: pendingWithdrawal.addresses_locked,
					lockToken: pendingWithdrawal.lock_token,
				});
			}
		}
		await lockManager.releaseMultiLocks(locksToRelease);

		deferredBloomSnapshot.batchHeight = nextBatchHeight;
		deferredBloomSnapshot.batchesSince += 1;
		if (
			deferredBloomSnapshot.batchesSince >= BLOOM_FILTER_SNAPSHOT_EVERY_N_BATCHES
		) {
			await flushDeferredBloomFilterUpdates(
				db,
				redisTransaction,
				redisAddressBalance,
				deferredBloomSnapshot,
			);
		}

		if (absoluteBalances.length > 0) {
			await setCachedAddressBalances(
				redisAddressBalance,
				absoluteBalances,
				balanceCache,
			);
		}
	} finally {
		await recordRedisActive(redisDiagnostics, false);
	}

	const totalProcessed =
		transactionsToProcess.length + withdrawalsToProcess.length;
	if (totalProcessed > 0) {
		const elapsedMs = Math.round(performance.now() - startedAt);
		log.info(
			`Processed transactions: total=${totalProcessed} ` +
				`(tx=${transactionsToProcess.length}, withdrawals=${withdrawalsToProcess.length}, ` +
				`batch_height=${nextBatchHeight}, elapsed_ms=${elapsedMs})`,
			{
				transactions_processed: transactionsToProcess.length,
				withdrawals_processed: withdrawalsToProcess.length,
				total_processed: totalProcessed,
				batch_height: nextBatchHeight,
				elapsed_ms: elapsedMs,
			},
		);
		await recordDbWrites(redisDiagnostics, totalProcessed);
	}

	const pendingRemaining = await redisTransaction.llen(PENDING_TRANSACTIONS_LIST_KEY);
	const pendingWithdrawalsRemaining = await redisTransaction.llen(
		PENDING_WITHDRAWALS_LIST_KEY,
	);
	// Only stamp empty after a drain that cleared the queues (not every idle loop),
	// and overwrite so the last drain-to-empty wins.
	if (
		totalProcessed > 0 &&
		pendingRemaining === 0 &&
		pendingWithdrawalsRemaining === 0
	) {
		await recordQueueEmpty(redisDiagnostics);
	}

	return nextBatchHeight;
}

async function recordWriteActive(
	redisTransaction: Redis,
	writing: boolean,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisTransaction);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterWriteActive(
			redisTransaction,
			session.session_id,
			writing,
		);
		log.performance("profiler dbwriter write active", {
			session_id: session.session_id,
			writing: writing ? 1 : 0,
			event: writing ? "dbwriter_write_enter" : "dbwriter_write_exit",
		});
	} catch {
		// Best-effort; never fail the writer loop.
	}
}

async function recordRedisActive(
	redisTransaction: Redis,
	redisActive: boolean,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisTransaction);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterRedisActive(
			redisTransaction,
			session.session_id,
			redisActive,
		);
		log.performance("profiler dbwriter redis active", {
			session_id: session.session_id,
			redis_active: redisActive ? 1 : 0,
			event: redisActive ? "dbwriter_redis_enter" : "dbwriter_redis_exit",
		});
	} catch {
		// Best-effort; never fail the writer loop.
	}
}

async function recordDbWrites(
	redisTransaction: Redis,
	writes: number,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisTransaction);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterBatch(
			redisTransaction,
			session.session_id,
			writes,
		);
		log.performance("profiler dbwriter batch", {
			session_id: session.session_id,
			writes,
			event: "dbwriter_batch",
		});
	} catch {
		// Best-effort; never fail the writer loop.
	}
}

async function recordQueueEmpty(redisTransaction: Redis): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisTransaction);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterQueueEmpty(
			redisTransaction,
			session.session_id,
		);
		log.performance("profiler dbwriter queue empty", {
			session_id: session.session_id,
			event: "dbwriter_queue_empty",
		});
	} catch {
		// Best-effort; never fail the writer loop.
	}
}

export async function getCurrentBatchHeight(
	db: Layer2LedgerDbClient,
): Promise<number> {
	try {
		const [txMax] = await db
			.select({ value: max(transactions.batchHeight) })
			.from(transactions);
		const [wrMax] = await db
			.select({ value: max(withdrawalRequests.batchHeight) })
			.from(withdrawalRequests);
		return Math.max(txMax?.value ?? 0, wrMax?.value ?? 0);
	} catch {
		return 0;
	}
}
