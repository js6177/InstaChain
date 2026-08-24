import {
	getLayer2LedgerPort,
	loadBackendCommonConfig,
	loadLayer2LedgerAPIHandlerConfig,
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import { ProcessDiagnosticsService } from "@openl2/stress-results";
import Redis from "ioredis";
import { createLayer2LedgerApp } from "../api/app";
import { createDatabase, migrateDatabase } from "../db/client";
import { log } from "../logger";
import { resolveAddressBalanceCacheOptions } from "../redis/address-balance-cache";
import { createRedisDiagnosticsClient } from "../redis/diagnostics-client";
import { DistributedLock } from "../redis/distributed-lock";
import { startProcessDiagnosticsSampler } from "../redis/process-diagnostics-sampler";
import { ensureTransactionIdBloomFilter } from "../redis/transaction-id-bloom";
import { ensureAddressBalanceBloomFilter } from "../redis/address-balance-bloom";
import { createRouteHandlers } from "../services/route-handlers";

const commonConfig = loadLayer2LedgerCommonConfig();
const apiHandlerConfig = loadLayer2LedgerAPIHandlerConfig();
const backendCommonConfig = loadBackendCommonConfig();

const directDbSettings = {
	dbUser: commonConfig.database.db_user,
	dbPassword: commonConfig.database.db_password,
	dbHost: commonConfig.database.db_host,
	dbPort: commonConfig.database.db_port,
	dbName: commonConfig.database.db_name,
};

const poolDbSettings = {
	...directDbSettings,
	dbHost: commonConfig.database.db_pool_host ?? commonConfig.database.db_host,
	dbPort: commonConfig.database.db_pool_port ?? commonConfig.database.db_port,
};

const usesPgBouncer =
	poolDbSettings.dbHost !== directDbSettings.dbHost ||
	poolDbSettings.dbPort !== directDbSettings.dbPort;

// Session advisory locks require a direct Postgres connection (not transaction pooling).
const { sql: migrationSql } = createDatabase(directDbSettings, {
	maxConnections: 1,
});
const MIGRATION_LOCK_KEY = 724_310_001;
await migrationSql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
try {
	await migrateDatabase(migrationSql, {
		dropExisting:
			process.env.ENVIRONMENT === "test" &&
			commonConfig.drop_tables_before_test_completed === true,
	});
} finally {
	await migrationSql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
	await migrationSql.end({ timeout: 2 });
}

// Request traffic goes through PgBouncer in transaction mode when configured.
const { db, sql } = createDatabase(poolDbSettings, {
	maxConnections: 10,
	prepare: !usesPgBouncer,
});

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

const handlers = createRouteHandlers({
	db,
	redisTransaction,
	redisAddressBalance,
	redisDiagnostics,
	lockManager,
	settings: apiHandlerConfig,
	messaging: {
		nodeId: backendCommonConfig.node_id,
		layer2BridgeSigningPublicKey:
			backendCommonConfig.layer2bridge_signing_public_key,
	},
	balanceCache: resolveAddressBalanceCacheOptions(
		commonConfig.redis_addressbalance,
	),
});

const host = "0.0.0.0";
const port = getLayer2LedgerPort();

const app = createLayer2LedgerApp(handlers).listen({
	hostname: host,
	port,
});

const stopProcessDiagnostics =
	commonConfig.redis_diagnostics !== null
		? startProcessDiagnosticsSampler({
				service: ProcessDiagnosticsService.Apihandler,
				redisTransaction,
				redisAddressBalance,
				redisDiagnostics,
			})
		: null;

registerProcessShutdown(async () => {
	stopProcessDiagnostics?.();
	app.stop();
	await redisTransaction.quit();
	await redisAddressBalance.quit();
	if (ownsRedisDiagnostics) {
		await redisDiagnostics.quit();
	}
	await sql.end({ timeout: 2 });
});

log.info(
	`layer2ledgerapihandler listening on http://${host}:${port}` +
		(usesPgBouncer
			? ` (db via PgBouncer ${poolDbSettings.dbHost}:${poolDbSettings.dbPort})`
			: " (db direct)"),
);

export type App = typeof app;
