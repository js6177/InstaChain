import {
	loadBackendCommonConfig,
	loadLayer2BridgeConfig,
	loadLayer2LedgerAPIHandlerConfig,
	loadLayer2LedgerCommonConfig,
} from "@openl2/config-loader";
import { Layer2Address } from "@openl2/pubkey-utils";
import { getTableName } from "drizzle-orm";
import Redis from "ioredis";
import type { Layer2LedgerRouteHandlers } from "../src/api/handlers";
import { createDatabase, migrateDatabase } from "../src/db/client";
import { schema } from "../src/db/schema";
import {
	clearDeferredBloomFilterUpdates,
	createDeferredBloomSnapshotState,
	getCurrentBatchHeight,
	processPendingBatch,
} from "../src/layer2ledgerdbwriter/process-pending";
import {
	clearAddressBalanceCache,
	resolveAddressBalanceCacheOptions,
} from "../src/redis/address-balance-cache";
import { createRedisDiagnosticsClient } from "../src/redis/diagnostics-client";
import {
	DistributedLock,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../src/redis/distributed-lock";
import {
	ensureTransactionIdBloomFilter,
	TRANSACTION_ID_BLOOM_KEY,
} from "../src/redis/transaction-id-bloom";
import { createRouteHandlers } from "../src/services/route-handlers";
import { newLayer2Address } from "./common";

export { newLayer2Address };

const environment = process.env.ENVIRONMENT ?? "test";

export const commonConfig = loadLayer2LedgerCommonConfig(environment);
export const apiHandlerConfig = loadLayer2LedgerAPIHandlerConfig(environment);
export const backendCommon = loadBackendCommonConfig(environment);
export const bridgeConfig = loadLayer2BridgeConfig(environment);

export const { db, sql } = createDatabase({
	dbUser: commonConfig.database.db_user,
	dbPassword: commonConfig.database.db_password,
	dbHost: commonConfig.database.db_host,
	dbPort: commonConfig.database.db_port,
	dbName: commonConfig.database.db_name,
});

export const redisTransaction = new Redis({
	host: commonConfig.redis_transactions.host,
	port: commonConfig.redis_transactions.port,
	maxRetriesPerRequest: null,
});
export const redisAddressBalance = new Redis({
	host: commonConfig.redis_addressbalance.host,
	port: commonConfig.redis_addressbalance.port,
	maxRetriesPerRequest: null,
});
const { redisDiagnostics: redisDiagnosticsClient } = createRedisDiagnosticsClient(
	commonConfig,
	redisTransaction,
);
export const redisDiagnostics = redisDiagnosticsClient;

export const lockManager = new DistributedLock(redisTransaction);
export const balanceCache = resolveAddressBalanceCacheOptions(
	commonConfig.redis_addressbalance,
);
const deferredBloomSnapshot = createDeferredBloomSnapshotState();

export function createHandlers(): Layer2LedgerRouteHandlers {
	return createRouteHandlers({
		db,
		redisTransaction,
		redisAddressBalance,
		redisDiagnostics,
		lockManager,
		settings: apiHandlerConfig,
		messaging: {
			nodeId: backendCommon.node_id,
			layer2BridgeSigningPublicKey:
				backendCommon.layer2bridge_signing_public_key,
		},
		balanceCache,
	});
}

export function bridgeSigningAddress(): Layer2Address {
	const address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	address.fromPrivateKeyBase58(bridgeConfig.onboarding_signing_private_key);
	return address;
}

export async function setupLedgerTests(): Promise<void> {
	await migrateDatabase(sql);
	// Shared test Postgres accumulates rows across runs; clear ledger tables so
	// queries like getWithdrawalRequests (all PENDING) start from an empty DB.
	const tableNames = Object.values(schema).map((table) => getTableName(table));
	await sql.unsafe(
		`TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
	);
	await lockManager.setup();
	await redisTransaction.del(
		PENDING_TRANSACTIONS_LIST_KEY,
		PENDING_WITHDRAWALS_LIST_KEY,
		TRANSACTION_ID_BLOOM_KEY,
	);
	await clearAddressBalanceCache(redisAddressBalance);
	clearDeferredBloomFilterUpdates(deferredBloomSnapshot);
	// Fresh empty bloom for this process; skip replaying historical Postgres rows.
	process.env.SKIP_BLOOM_PG_REBUILD = "1";
	await ensureTransactionIdBloomFilter(db, redisTransaction);
}

export async function teardownLedgerTests(): Promise<void> {
	await clearPendingQueues();
}


export async function clearPendingQueues(): Promise<void> {
	await redisTransaction.del(PENDING_TRANSACTIONS_LIST_KEY, PENDING_WITHDRAWALS_LIST_KEY);
}

export async function drainPendingQueues(): Promise<void> {
	const batchHeight = await getCurrentBatchHeight(db);
	await processPendingBatch(
		{
			db,
			redisTransaction,
			redisAddressBalance,
			redisDiagnostics,
			lockManager,
			balanceCache,
			deferredBloomSnapshot,
		},
		batchHeight,
	);
}
