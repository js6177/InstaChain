import {
	loadLayer2LedgerCommonConfig,
	registerProcessShutdown,
} from "@openl2/config-loader";
import { createOpenL2Logger } from "@openl2/openl2-logger";
import Redis from "ioredis";
import { createDatabase, migrateDatabase } from "../db/client";
import {
	DistributedLock,
	PENDING_TRANSACTIONS_LIST_KEY,
} from "../redis/distributed-lock";
import {
	getCurrentBatchHeight,
	pendingQueueSleepMs,
	processPendingBatch,
} from "./process-pending";

const log = createOpenL2Logger({
	serviceName: "layer2ledgerdbwriter",
});

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

log.info("Starting layer2ledgerdbwriter...");

registerProcessShutdown(async () => {
	await redis.quit();
	await postgresSql.end({ timeout: 2 });
});

let currentBatchHeight = await getCurrentBatchHeight(db);

while (true) {
	try {
		const nextHeight = await processPendingBatch(
			{ db, redis, lockManager },
			currentBatchHeight,
		);
		if (nextHeight !== currentBatchHeight) {
			currentBatchHeight = nextHeight;
		}

		const pendingCount = await redis.llen(PENDING_TRANSACTIONS_LIST_KEY);
		const sleepMs = pendingQueueSleepMs(pendingCount);
		if (sleepMs > 0) {
			await Bun.sleep(sleepMs);
		}
		if(pendingCount > 0) {
			log.info("Pending transactions", {
				pending_count: pendingCount,
				batch_height: currentBatchHeight,
			});
		}
	} catch (error) {
		log.exception("Error processing transactions", error);
		await Bun.sleep(5000);
	}
}
