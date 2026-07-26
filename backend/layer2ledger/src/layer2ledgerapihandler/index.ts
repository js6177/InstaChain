import {
	getLayer2LedgerHost,
	getLayer2LedgerPort,
	loadBackendCommonConfig,
	loadLayer2LedgerAPIHandlerConfig,
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import Redis from "ioredis";
import { createLayer2LedgerApp } from "../api/app";
import { createDatabase, migrateDatabase } from "../db/client";
import { DistributedLock } from "../redis/distributed-lock";
import { createRouteHandlers } from "../services/route-handlers";

const commonConfig = loadLayer2LedgerCommonConfig();
const apiHandlerConfig = loadLayer2LedgerAPIHandlerConfig();
const backendCommonConfig = loadBackendCommonConfig();

const { db, sql } = createDatabase({
	dbUser: commonConfig.database.db_user,
	dbPassword: commonConfig.database.db_password,
	dbHost: commonConfig.database.db_host,
	dbPort: commonConfig.database.db_port,
	dbName: commonConfig.database.db_name,
});

await migrateDatabase(sql, {
	dropExisting:
		process.env.ENVIRONMENT === "test" &&
		commonConfig.drop_tables_before_test_completed === true,
});

const redis = new Redis({
	host: commonConfig.redis.host,
	port: commonConfig.redis.port,
	maxRetriesPerRequest: null,
});

const lockManager = new DistributedLock(redis);
await lockManager.setup();

const handlers = createRouteHandlers({
	db,
	redis,
	lockManager,
	settings: apiHandlerConfig,
	messaging: {
		nodeId: backendCommonConfig.node_id,
		layer2BridgeSigningPublicKey:
			backendCommonConfig.layer2bridge_signing_public_key,
	},
});

const host = "0.0.0.0";
const port = getLayer2LedgerPort();

const app = createLayer2LedgerApp(handlers).listen({
	hostname: host,
	port,
});

registerProcessShutdown(() => app.stop());

console.log(`layer2ledgerapihandler listening on http://${host}:${port}`);

export type App = typeof app;
