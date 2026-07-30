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
	type DistributedLock,
	getPendingTransactions,
	getPendingWithdrawals,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../redis/distributed-lock";
import { redisTransactionToInsert, redisWithdrawalRequestToInsert } from "../redis/models";

export interface ProcessPendingBatchContext {
	db: Layer2LedgerDbClient;
	redis: Redis;
	lockManager: DistributedLock;
}

/**
 * Drain pending Redis transfer/withdrawal queues into Postgres and release locks.
 * Used by the dbwriter loop and by functional tests.
 */
export async function processPendingBatch(
	context: ProcessPendingBatchContext,
	currentBatchHeight: number,
): Promise<number> {
	const { db, redis, lockManager } = context;
	const transactionsToProcess = await getPendingTransactions(redis, 0, 999);
	const withdrawalsToProcess = await getPendingWithdrawals(redis, 0, 999);

	if (
		transactionsToProcess.length === 0 &&
		withdrawalsToProcess.length === 0
	) {
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

	await db.transaction(async (tx) => {
		if (newTransactions.length > 0) {
			await tx.insert(transactions).values(newTransactions);
		}
		if (newWithdrawals.length > 0) {
			await tx.insert(withdrawalRequests).values(newWithdrawals);
		}
		if (addressBalances.length > 0) {
			await tx
				.insert(layer2AddressBalance)
				.values(addressBalances)
				.onConflictDoUpdate({
					target: layer2AddressBalance.address,
					set: {
						balance: sql`${layer2AddressBalance.balance} + excluded.balance`,
					},
				});
		}
	});

	if (transactionsToProcess.length > 0) {
		await redis.ltrim(
			PENDING_TRANSACTIONS_LIST_KEY,
			transactionsToProcess.length,
			-1,
		);
	}
	if (withdrawalsToProcess.length > 0) {
		await redis.ltrim(
			PENDING_WITHDRAWALS_LIST_KEY,
			withdrawalsToProcess.length,
			-1,
		);
	}

	for (const pendingTx of transactionsToProcess) {
		if (pendingTx.lock_token) {
			await lockManager.releaseMultiLock(
				pendingTx.addresses_locked,
				pendingTx.lock_token,
			);
		}
	}
	for (const pendingWithdrawal of withdrawalsToProcess) {
		if (pendingWithdrawal.lock_token) {
			await lockManager.releaseMultiLock(
				pendingWithdrawal.addresses_locked,
				pendingWithdrawal.lock_token,
			);
		}
	}

	return nextBatchHeight;
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
