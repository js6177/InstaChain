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
import {
	type PendingTransaction,
	type PendingWithdrawal,
	redisTransactionToInsert,
	redisWithdrawalRequestToInsert,
} from "../redis/models";
import {
	DbwriterFailedRowKind,
	DbwriterFailedRowRecord,
	recordDbwriterFailedRow,
} from "../redis/dbwriter-failed-rows";
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
	/**
	 * Optional hook fired after each successful Postgres batch write attempt
	 * (including binary-retry slices). Used by tests to count write depth.
	 */
	onSuccessfulBatchWrite?: (() => void) | null;
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

enum BatchWriteUnitKind {
	Transfer = "transfer",
	Withdrawal = "withdrawal",
}

interface BatchWriteUnit {
	kind: BatchWriteUnitKind;
	pending: PendingTransaction | PendingWithdrawal;
	transactionInsert: TransactionInsert;
	withdrawalInsert: WithdrawalRequestInsert | null;
	balanceDeltas: ReadonlyArray<{ address: string; delta: number }>;
}

interface BatchWriteSliceResult {
	absoluteBalances: Array<{ address: string; balance: number }>;
	committedTransactionIds: string[];
	committedAddresses: string[];
	failedUnits: BatchWriteUnit[];
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function buildAddressBalances(
	units: readonly BatchWriteUnit[],
): Array<{ address: string; balance: number }> {
	const balanceUpdates = new Map<string, number>();
	for (const unit of units) {
		for (const { address, delta } of unit.balanceDeltas) {
			balanceUpdates.set(address, (balanceUpdates.get(address) ?? 0) + delta);
		}
	}
	return Array.from(balanceUpdates.entries()).map(([address, balance]) => ({
		address,
		balance,
	}));
}

async function attemptBatchWrite(
	db: Layer2LedgerDbClient,
	units: readonly BatchWriteUnit[],
): Promise<Array<{ address: string; balance: number }>> {
	const newTransactions = units.map((unit) => unit.transactionInsert);
	const newWithdrawals = units
		.map((unit) => unit.withdrawalInsert)
		.filter((row): row is WithdrawalRequestInsert => row !== null);
	const addressBalances = buildAddressBalances(units);

	let absoluteBalances: Array<{ address: string; balance: number }> = [];
	await db.transaction(async (tx) => {
		if (newTransactions.length > 0) {
			await tx.insert(transactions).values(newTransactions);
		}
		if (newWithdrawals.length > 0) {
			await tx.insert(withdrawalRequests).values(newWithdrawals);
		}
		if (addressBalances.length > 0) {
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
	return absoluteBalances;
}

async function recordFailedWriteUnit(
	redisDiagnostics: Redis,
	unit: BatchWriteUnit,
	error: unknown,
): Promise<void> {
	const layer2TransactionId = unit.transactionInsert.layer2TransactionId;
	const message = errorMessage(error);
	log.error(
		`dbwriter rejected failing row layer2_transaction_id=${layer2TransactionId} ` +
			`kind=${unit.kind}: ${message}`,
		{
			layer2_transaction_id: layer2TransactionId,
			kind: unit.kind,
			error: message,
			payload: unit.pending,
		},
	);
	try {
		await recordDbwriterFailedRow(
			redisDiagnostics,
			new DbwriterFailedRowRecord({
				failedAtUnixMs: Date.now(),
				kind:
					unit.kind === BatchWriteUnitKind.Withdrawal
						? DbwriterFailedRowKind.Withdrawal
						: DbwriterFailedRowKind.Transfer,
				layer2TransactionId,
				errorMessage: message,
				payload: unit.pending,
			}),
		);
	} catch (diagnosticsError) {
		log.warning("failed to persist dbwriter failed-row diagnostic", {
			layer2_transaction_id: layer2TransactionId,
			error: errorMessage(diagnosticsError),
		});
	}
}

/**
 * Write a batch slice; on failure bisect until the failing row(s) are isolated.
 * Successful slices are committed; failing singletons are logged + stored on
 * redis-diagnostics (24h TTL) and skipped.
 */
async function writeBatchWithBinaryRetry(
	db: Layer2LedgerDbClient,
	redisDiagnostics: Redis,
	units: readonly BatchWriteUnit[],
	onSuccessfulBatchWrite?: (() => void) | null,
): Promise<BatchWriteSliceResult> {
	if (units.length === 0) {
		return {
			absoluteBalances: [],
			committedTransactionIds: [],
			committedAddresses: [],
			failedUnits: [],
		};
	}

	try {
		const absoluteBalances = await attemptBatchWrite(db, units);
		onSuccessfulBatchWrite?.();
		return {
			absoluteBalances,
			committedTransactionIds: units.map(
				(unit) => unit.transactionInsert.layer2TransactionId,
			),
			committedAddresses: buildAddressBalances(units).map((row) => row.address),
			failedUnits: [],
		};
	} catch (error) {
		if (units.length === 1) {
			const unit = units[0];
			if (unit !== undefined) {
				await recordFailedWriteUnit(redisDiagnostics, unit, error);
			}
			return {
				absoluteBalances: [],
				committedTransactionIds: [],
				committedAddresses: [],
				failedUnits: unit !== undefined ? [unit] : [],
			};
		}

		const mid = Math.floor(units.length / 2);
		const left = await writeBatchWithBinaryRetry(
			db,
			redisDiagnostics,
			units.slice(0, mid),
			onSuccessfulBatchWrite,
		);
		const right = await writeBatchWithBinaryRetry(
			db,
			redisDiagnostics,
			units.slice(mid),
			onSuccessfulBatchWrite,
		);
		const absoluteByAddress = new Map<string, number>();
		for (const row of [...left.absoluteBalances, ...right.absoluteBalances]) {
			absoluteByAddress.set(row.address, row.balance);
		}
		return {
			absoluteBalances: Array.from(absoluteByAddress.entries()).map(
				([address, balance]) => ({ address, balance }),
			),
			committedTransactionIds: [
				...left.committedTransactionIds,
				...right.committedTransactionIds,
			],
			committedAddresses: [
				...new Set([
					...left.committedAddresses,
					...right.committedAddresses,
				]),
			],
			failedUnits: [...left.failedUnits, ...right.failedUnits],
		};
	}
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
		onSuccessfulBatchWrite,
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
	const writeUnits: BatchWriteUnit[] = [];

	for (const pendingTx of transactionsToProcess) {
		pendingTx.transaction.batch_height = nextBatchHeight;
		const amount = pendingTx.transaction.amount;
		writeUnits.push({
			kind: BatchWriteUnitKind.Transfer,
			pending: pendingTx,
			transactionInsert: redisTransactionToInsert(pendingTx.transaction),
			withdrawalInsert: null,
			balanceDeltas: [
				{
					address: pendingTx.transaction.source_address_pubkey,
					delta: -amount,
				},
				{
					address: pendingTx.transaction.destination_address_pubkey,
					delta: amount,
				},
			],
		});
	}

	for (const pendingWithdrawal of withdrawalsToProcess) {
		pendingWithdrawal.transaction.batch_height = nextBatchHeight;
		pendingWithdrawal.withdrawal_request.batch_height = nextBatchHeight;
		const amount = pendingWithdrawal.transaction.amount;
		writeUnits.push({
			kind: BatchWriteUnitKind.Withdrawal,
			pending: pendingWithdrawal,
			transactionInsert: redisTransactionToInsert(
				pendingWithdrawal.transaction,
			),
			withdrawalInsert: redisWithdrawalRequestToInsert(
				pendingWithdrawal.withdrawal_request,
			),
			balanceDeltas: [
				{
					address: pendingWithdrawal.transaction.source_address_pubkey,
					delta: -amount,
				},
			],
		});
	}

	let writeResult: BatchWriteSliceResult = {
		absoluteBalances: [],
		committedTransactionIds: [],
		committedAddresses: [],
		failedUnits: [],
	};
	await recordWriteActive(redisDiagnostics, true);
	try {
		writeResult = await writeBatchWithBinaryRetry(
			db,
			redisDiagnostics,
			writeUnits,
			onSuccessfulBatchWrite,
		);
	} finally {
		await recordWriteActive(redisDiagnostics, false);
	}

	const absoluteBalances = writeResult.absoluteBalances;
	const committedTransactionIds = writeResult.committedTransactionIds;
	const committedAddresses = writeResult.committedAddresses;

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
		await addTransactionIdsToBloomFilter(
			redisTransaction,
			committedTransactionIds,
		);
		await addAddressesToAddressBalanceBloomFilter(
			redisAddressBalance,
			committedAddresses,
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
	const committedCount = committedTransactionIds.length;
	const failedCount = writeResult.failedUnits.length;
	if (totalProcessed > 0) {
		const elapsedMs = Math.round(performance.now() - startedAt);
		log.info(
			`Processed transactions: total=${totalProcessed} ` +
				`committed=${committedCount} failed=${failedCount} ` +
				`(tx=${transactionsToProcess.length}, withdrawals=${withdrawalsToProcess.length}, ` +
				`batch_height=${nextBatchHeight}, elapsed_ms=${elapsedMs})`,
			{
				transactions_processed: transactionsToProcess.length,
				withdrawals_processed: withdrawalsToProcess.length,
				total_processed: totalProcessed,
				committed_count: committedCount,
				failed_count: failedCount,
				batch_height: nextBatchHeight,
				elapsed_ms: elapsedMs,
			},
		);
		if (committedCount > 0) {
			await recordDbWrites(redisDiagnostics, committedCount);
		}
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
