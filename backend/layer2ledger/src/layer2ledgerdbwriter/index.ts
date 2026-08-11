import {
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import { createOpenL2Logger, setProfilerSessionId } from "@openl2/openl2-logger";
import Redis from "ioredis";
import { createDatabase, migrateDatabase } from "../db/client";
import { resolveAddressBalanceCacheOptions } from "../redis/address-balance-cache";
import {
	DistributedLock,
	PENDING_TRANSACTIONS_LIST_KEY,
} from "../redis/distributed-lock";
import {
	getActiveProfilerSession,
	ProfilerApiName,
	recordPushTransactionProfilerDbwriterQueueDepth,
	recordPushTransactionProfilerDbwriterSleepActive,
} from "../redis/profiler-session";
import { ensureTransactionIdBloomFilter } from "../redis/transaction-id-bloom";
import {
	createDeferredBloomSnapshotState,
	flushDeferredBloomFilterUpdates,
	getCurrentBatchHeight,
	pendingQueueSleepMs,
	processPendingBatch,
} from "./process-pending";

const log = createOpenL2Logger({
	serviceName: "layer2ledgerdbwriter",
});

const commonConfig = loadLayer2LedgerCommonConfig();
// Direct Postgres (not PgBouncer): one long-lived connection for the writer loop.
const { db, sql: postgresSql } = createDatabase(
	{
		dbUser: commonConfig.database.db_user,
		dbPassword: commonConfig.database.db_password,
		dbHost: commonConfig.database.db_host,
		dbPort: commonConfig.database.db_port,
		dbName: commonConfig.database.db_name,
	},
	{ maxConnections: 1 },
);

await migrateDatabase(postgresSql);

const redis = new Redis({
	host: commonConfig.redis.host,
	port: commonConfig.redis.port,
	maxRetriesPerRequest: null,
});

const lockManager = new DistributedLock(redis);
await lockManager.setup();
await ensureTransactionIdBloomFilter(db, redis);
const balanceCache = resolveAddressBalanceCacheOptions(commonConfig.redis);

log.info("Starting layer2ledgerdbwriter...");

const deferredBloomSnapshot = createDeferredBloomSnapshotState();

registerProcessShutdown(async () => {
	try {
		await flushDeferredBloomFilterUpdates(db, redis, deferredBloomSnapshot);
	} catch (error) {
		log.exception("Failed to flush deferred bloom filter updates", error);
	}
	await redis.quit();
	await postgresSql.end({ timeout: 2 });
});

let currentBatchHeight = await getCurrentBatchHeight(db);

while (true) {
	try {
		const nextHeight = await processPendingBatch(
			{ db, redis, lockManager, balanceCache, deferredBloomSnapshot },
			currentBatchHeight,
		);
		if (nextHeight !== currentBatchHeight) {
			currentBatchHeight = nextHeight;
		}

		const pendingCount = await redis.llen(PENDING_TRANSACTIONS_LIST_KEY);
		await recordQueueDepth(redis, pendingCount);
		const sleepMs = pendingQueueSleepMs(pendingCount);
		if (sleepMs > 0) {
			await sleepWithProfiler(redis, sleepMs);
		}
		if (pendingCount > 0) {
			log.info(
				`Pending transactions: pending_count=${pendingCount}, batch_height=${currentBatchHeight}`,
				{
					pending_count: pendingCount,
					batch_height: currentBatchHeight,
				},
			);
		}
	} catch (error) {
		log.exception("Error processing transactions", error);
		await sleepWithProfiler(redis, 5000);
	}
}

async function sleepWithProfiler(redis: Redis, sleepMs: number): Promise<void> {
	await recordSleepActive(redis, true);
	try {
		await Bun.sleep(sleepMs);
	} finally {
		await recordSleepActive(redis, false);
	}
}

async function recordSleepActive(
	redis: Redis,
	sleeping: boolean,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redis);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterSleepActive(
			redis,
			session.session_id,
			sleeping,
		);
		log.performance("profiler dbwriter sleep active", {
			session_id: session.session_id,
			sleeping: sleeping ? 1 : 0,
			event: sleeping ? "dbwriter_sleep_enter" : "dbwriter_sleep_exit",
		});
	} catch {
		// Best-effort; never fail the writer loop.
	}
}

async function recordQueueDepth(
	redis: Redis,
	queueDepth: number,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redis);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		await recordPushTransactionProfilerDbwriterQueueDepth(
			redis,
			session.session_id,
			queueDepth,
		);
	} catch {
		// Best-effort; never fail the writer loop.
	}
}
