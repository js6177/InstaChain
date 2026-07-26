import {
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import { max, sql } from "drizzle-orm";
import Redis from "ioredis";
import { createDatabase, migrateDatabase } from "../db/client";
import {
	layer2AddressBalance,
	transactions,
	withdrawalRequests,
} from "../db/schema";
import {
	DistributedLock,
	getPendingTransactions,
	getPendingWithdrawals,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../redis/distributed-lock";
import { redisTransactionToInsert } from "../redis/models";

const commonConfig = loadLayer2LedgerCommonConfig();
const { db, sql: postgresSql } = createDatabase({
	dbUser: commonConfig.database.db_user,
	dbPassword: commonConfig.database.db_password,
	dbHost: commonConfig.database.db_host,
	dbPort: commonConfig.database.db_port,
	dbName: commonConfig.database.db_name,
});

await migrateDatabase(postgresSql);

const redis = new Redis({
	host: commonConfig.redis.host,
	port: commonConfig.redis.port,
	maxRetriesPerRequest: null,
});

const lockManager = new DistributedLock(redis);
await lockManager.setup();

console.log("Starting layer2ledgerdbwriter...");

registerProcessShutdown(async () => {
	await redis.quit();
	await postgresSql.end({ timeout: 2 });
});

let currentBatchHeight = await getCurrentBatchHeight();

while (true) {
	try {
		const transactionsToProcess = await getPendingTransactions(redis, 0, 999);
		const withdrawalsToProcess = await getPendingWithdrawals(redis, 0, 999);

		if (
			transactionsToProcess.length === 0 &&
			withdrawalsToProcess.length === 0
		) {
			await Bun.sleep(1000);
			continue;
		}

		currentBatchHeight += 1;
		const balanceUpdates = new Map<string, number>();

		await db.transaction(async (tx) => {
			for (const pendingTx of transactionsToProcess) {
				pendingTx.transaction.batch_height = currentBatchHeight;
				await tx
					.insert(transactions)
					.values(redisTransactionToInsert(pendingTx.transaction));

				const source = pendingTx.transaction.source_address_pubkey;
				const dest = pendingTx.transaction.destination_address_pubkey;
				const amount = pendingTx.transaction.amount;
				balanceUpdates.set(source, (balanceUpdates.get(source) ?? 0) - amount);
				balanceUpdates.set(dest, (balanceUpdates.get(dest) ?? 0) + amount);
			}

			for (const pendingWithdrawal of withdrawalsToProcess) {
				pendingWithdrawal.transaction.batch_height = currentBatchHeight;
				pendingWithdrawal.withdrawal_request.batch_height = currentBatchHeight;

				await tx
					.insert(transactions)
					.values(redisTransactionToInsert(pendingWithdrawal.transaction));
				await tx.insert(withdrawalRequests).values({
					layer1Address: pendingWithdrawal.withdrawal_request.layer1_address,
					layer1TransactionId:
						pendingWithdrawal.withdrawal_request.layer1_transaction_id,
					status: pendingWithdrawal.withdrawal_request.status,
					amount: pendingWithdrawal.withdrawal_request.amount,
					layer2WithdrawalId:
						pendingWithdrawal.withdrawal_request.layer2_withdrawal_id,
					serverSignature:
						pendingWithdrawal.withdrawal_request.server_signature,
					layer2TransactionId:
						pendingWithdrawal.withdrawal_request.layer2_transaction_id,
					withdrawalRequestedTimestamp:
						pendingWithdrawal.withdrawal_request.withdrawal_requested_timestamp,
				});

				const source = pendingWithdrawal.transaction.source_address_pubkey;
				const amount = pendingWithdrawal.transaction.amount;
				balanceUpdates.set(source, (balanceUpdates.get(source) ?? 0) - amount);
			}

			for (const [address, balanceChange] of balanceUpdates.entries()) {
				await tx
					.insert(layer2AddressBalance)
					.values({ address, balance: balanceChange })
					.onConflictDoUpdate({
						target: layer2AddressBalance.address,
						set: {
							balance: sql`${layer2AddressBalance.balance} + ${balanceChange}`,
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
	} catch (error) {
		console.error("Error processing transactions:", error);
		await Bun.sleep(5000);
	}
}

async function getCurrentBatchHeight(): Promise<number> {
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
