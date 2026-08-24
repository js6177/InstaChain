import {
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import { createOpenL2Logger, setProfilerSessionId } from "@openl2/openl2-logger";
import { ProcessDiagnosticsService } from "@openl2/stress-results";
import Redis from "ioredis";
import { createDatabase, migrateDatabase } from "../db/client";
import { resolveAddressBalanceCacheOptions } from "../redis/address-balance-cache";
import { createRedisDiagnosticsClient } from "../redis/diagnostics-client";
import {
	DistributedLock,
	PENDING_TRANSACTIONS_LIST_KEY,
} from "../redis/distributed-lock";
import { startProcessDiagnosticsSampler } from "../redis/process-diagnostics-sampler";
import {
	getActiveProfilerSession,
	ProfilerApiName,
	recordPushTransactionProfilerDbwriterQueueDepth,
	recordPushTransactionProfilerDbwriterSleepActive,
} from "../redis/profiler-session";
import { ensureAddressBalanceBloomFilter } from "../redis/address-balance-bloom";
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

const redisTransaction = new Redis({
	host: commonConfig.redis_transactions.host,
	port: commonConfig.redis_transactions.port,
	maxRetriesPerRequest: null,
});
const redisAddressBalance = new Redis({
	host: commonConfig.redis_addressbalance.host,
	port: commonConfig.redis_addressbalance.port,
	maxRetriesPerRequest: null,
});
const { redisDiagnostics, ownsConnection: ownsRedisDiagnostics } =
	createRedisDiagnosticsClient(commonConfig, redisTransaction);

const lockManager = new DistributedLock(redisTransaction);
await lockManager.setup();
await ensureTransactionIdBloomFilter(db, redisTransaction);
await ensureAddressBalanceBloomFilter(db, redisAddressBalance);
const balanceCache = resolveAddressBalanceCacheOptions(
	commonConfig.redis_addressbalance,
);

log.info("Starting layer2ledgerdbwriter...");

const deferredBloomSnapshot = createDeferredBloomSnapshotState();

const stopProcessDiagnostics =
	commonConfig.redis_diagnostics !== null
		? startProcessDiagnosticsSampler({
				service: ProcessDiagnosticsService.Dbwriter,
				redisTransaction,
				redisAddressBalance,
				redisDiagnostics,
			})
		: null;

registerProcessShutdown(async () => {
	stopProcessDiagnostics?.();
	try {
		await flushDeferredBloomFilterUpdates(
			db,
			redisTransaction,
			redisAddressBalance,
			deferredBloomSnapshot,
		);
	} catch (error) {
		log.exception("Failed to flush deferred bloom filter updates", error);
	}
	await redisTransaction.quit();
	await redisAddressBalance.quit();
	if (ownsRedisDiagnostics) {
		await redisDiagnostics.quit();
	}
	await postgresSql.end({ timeout: 2 });
});

let currentBatchHeight = await getCurrentBatchHeight(db);

while (true) {
	try {
		const nextHeight = await processPendingBatch(
			{
				db,
				redisTransaction,
				redisAddressBalance,
				redisDiagnostics,
				lockManager,
				balanceCache,
				deferredBloomSnapshot,
			},
			currentBatchHeight,
		);
		if (nextHeight !== currentBatchHeight) {
			currentBatchHeight = nextHeight;
		}

		const pendingCount = await redisTransaction.llen(PENDING_TRANSACTIONS_LIST_KEY);
		await recordQueueDepth(redisDiagnostics, pendingCount);
		const sleepMs = pendingQueueSleepMs(pendingCount);
		if (sleepMs > 0) {
			await sleepWithProfiler(redisDiagnostics, sleepMs);
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
		await sleepWithProfiler(redisDiagnostics, 5000);
	}
}

async function sleepWithProfiler(redisDiagnostics: Redis, sleepMs: number): Promise<void> {
	await recordSleepActive(redisDiagnostics, true);
	try {
		await Bun.sleep(sleepMs);
	} finally {
		await recordSleepActive(redisDiagnostics, false);
	}
}

async function recordSleepActive(
	redisDiagnostics: Redis,
	sleeping: boolean,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisDiagnostics);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		setProfilerSessionId(session.session_id);
		await recordPushTransactionProfilerDbwriterSleepActive(
			redisDiagnostics,
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
	redisDiagnostics: Redis,
	queueDepth: number,
): Promise<void> {
	try {
		const session = await getActiveProfilerSession(redisDiagnostics);
		if (!session?.apis.includes(ProfilerApiName.Dbwriter)) {
			return;
		}
		await recordPushTransactionProfilerDbwriterQueueDepth(
			redisDiagnostics,
			session.session_id,
			queueDepth,
		);
	} catch {
		// Best-effort; never fail the writer loop.
	}
}
