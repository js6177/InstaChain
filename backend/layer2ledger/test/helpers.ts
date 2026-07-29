import {
	loadBackendCommonConfig,
	loadLayer2BridgeConfig,
	loadLayer2LedgerAPIHandlerConfig,
	loadLayer2LedgerCommonConfig,
} from "@openl2/config-loader";
import { Layer2Address } from "@openl2/pubkey-utils";
import Redis from "ioredis";
import type { Layer2LedgerRouteHandlers } from "../src/api/handlers";
import { createDatabase, migrateDatabase } from "../src/db/client";
import {
	getCurrentBatchHeight,
	processPendingBatch,
} from "../src/layer2ledgerdbwriter/process-pending";
import {
	DistributedLock,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../src/redis/distributed-lock";
import { createRouteHandlers } from "../src/services/route-handlers";

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

export const redis = new Redis({
	host: commonConfig.redis.host,
	port: commonConfig.redis.port,
	maxRetriesPerRequest: null,
});

export const lockManager = new DistributedLock(redis);

export function createHandlers(): Layer2LedgerRouteHandlers {
	return createRouteHandlers({
		db,
		redis,
		lockManager,
		settings: apiHandlerConfig,
		messaging: {
			nodeId: backendCommon.node_id,
			layer2BridgeSigningPublicKey:
				backendCommon.layer2bridge_signing_public_key,
		},
	});
}

export function newLayer2Address(): Layer2Address {
	const address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	address.generateNewAddress();
	return address;
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
	await lockManager.setup();
	await redis.del(PENDING_TRANSACTIONS_LIST_KEY, PENDING_WITHDRAWALS_LIST_KEY);
}

export async function teardownLedgerTests(): Promise<void> {
	await clearPendingQueues();
}


export async function clearPendingQueues(): Promise<void> {
	await redis.del(PENDING_TRANSACTIONS_LIST_KEY, PENDING_WITHDRAWALS_LIST_KEY);
}

export async function drainPendingQueues(): Promise<void> {
	const batchHeight = await getCurrentBatchHeight(db);
	await processPendingBatch({ db, redis, lockManager }, batchHeight);
}
