import {
	createLayer2LedgerClient,
	createLayer2TestHelperClient,
	ErrorCodes,
	unwrapLayer2LedgerResponse,
	unwrapLayer2TestHelperResponse,
} from "@openl2/api-layer2ledger";
import { loadLayer2LedgerCommonConfig } from "@openl2/config-loader";
import { createOpenL2Logger } from "@openl2/openl2-logger";
import {
	buildTransferMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import {
	clearAddressBalanceCache,
	createDatabase,
	ensureTransactionIdBloomFilter,
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
	ProfilerApiName,
	profilerInFlightKey,
	resetAddressBalanceCacheStats,
	resolveAddressBalanceCacheOptions,
	schema,
	setCachedAddressBalances,
	TRANSACTION_ID_BLOOM_KEY,
} from "@openl2/layer2ledger/stress-support";
import {
	emptyApiErrorCounts,
	recordApiError,
	type StressApiErrorCounts,
} from "@openl2/stress-results";
import { getTableName } from "drizzle-orm";
import Redis from "ioredis";
import { join } from "node:path";
import {
	mapPool,
	newLayer2Address,
	sleep,
	stressDataDir,
} from "../common";

export enum BalanceCacheMode {
	Cold = "cold",
	Warm = "warm",
}

export interface PushTransactionBody {
	amount: number;
	destination_address_public_key: string;
	fee: number;
	signature: string;
	source_address_public_key: string;
	transaction_id: string;
}

export interface PushStressMeta {
	service: "layer2ledger";
	api: "push_transaction";
	mode: BalanceCacheMode;
	title: string;
	description: string;
	session_id: string;
	transaction_count: number;
	transaction_ids: string[];
	prepare_ms: number;
	sign_ms: number;
	seed_ms: number;
	seed_errors: StressApiErrorCounts;
	vus: number;
	amount: number;
	fee: number;
	initial_balance: number;
	dataset_file: string;
	started_at_unix_ms: number;
}

const log = createOpenL2Logger({ serviceName: "openl2-stress-prep" });

export const PUSH_DATASET_FILE = "push-requests.json";
export const PUSH_META_FILE = "push-meta.json";
export const K6_SUMMARY_FILE = "k6-summary.json";

export function ledgerApiUrl(): string {
	return (
		process.env.LAYER2LEDGER_API_URL ??
		"http://layer2ledgerapihandler-nginx:8000"
	);
}

export function testhelperUrl(): string {
	return (
		process.env.TESTHELPER_BASE_URL ?? "http://layer2ledger-testhelper:8001"
	);
}

export function resolveVus(): number {
	const raw = Number(
		process.env.STRESS_VUS ?? process.env.STRESS_PUSH_MAX_IN_FLIGHT ?? "1024",
	);
	if (!Number.isFinite(raw) || raw < 1) {
		return 1024;
	}
	return Math.floor(raw);
}

export function pushDatasetPath(): string {
	return join(stressDataDir(), PUSH_DATASET_FILE);
}

export function pushMetaPath(): string {
	return join(stressDataDir(), PUSH_META_FILE);
}

export function k6SummaryPath(): string {
	return join(stressDataDir(), K6_SUMMARY_FILE);
}

function apiErrorReason(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const statusMatch = message.match(/status\s+(\d+)/i);
	const statusCode =
		statusMatch === null ? null : (statusMatch[1] ?? null);
	if (statusCode !== null) {
		return `http_${statusCode}`;
	}
	const trimmed = message.replace(/\s+/g, " ").trim();
	return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

async function deleteRedisKeysByPattern(
	redis: Redis,
	pattern: string,
): Promise<void> {
	let cursor = "0";
	do {
		const [nextCursor, keys] = await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			500,
		);
		cursor = nextCursor;
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	} while (cursor !== "0");
}

export async function createRedisClients(): Promise<{
	redisTransaction: Redis;
	redisAddressBalance: Redis;
	balanceCache: ReturnType<typeof resolveAddressBalanceCacheOptions>;
}> {
	const commonConfig = loadLayer2LedgerCommonConfig();
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
	const balanceCache = resolveAddressBalanceCacheOptions(
		commonConfig.redis_addressbalance,
	);
	return { redisTransaction, redisAddressBalance, balanceCache };
}

export async function resetStressLedgerState(
	redisTransaction: Redis,
	redisAddressBalance: Redis,
): Promise<void> {
	const commonConfig = loadLayer2LedgerCommonConfig();
	const { db, sql } = createDatabase({
		dbUser: commonConfig.database.db_user,
		dbPassword: commonConfig.database.db_password,
		dbHost: commonConfig.database.db_host,
		dbPort: commonConfig.database.db_port,
		dbName: commonConfig.database.db_name,
	});
	try {
		const tableNames = Object.values(schema).map((table) =>
			getTableName(table),
		);
		await sql.unsafe(
			`TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
		);
		await redisTransaction.del(
			PENDING_TRANSACTIONS_LIST_KEY,
			PENDING_WITHDRAWALS_LIST_KEY,
			TRANSACTION_ID_BLOOM_KEY,
			profilerInFlightKey("pushTransaction"),
			profilerInFlightKey(ProfilerApiName.GetBalance),
		);
		await clearAddressBalanceCache(redisAddressBalance);
		await resetAddressBalanceCacheStats(redisAddressBalance);
		await deleteRedisKeysByPattern(redisTransaction, "lock:*");
		process.env.SKIP_BLOOM_PG_REBUILD = "1";
		await ensureTransactionIdBloomFilter(db, redisTransaction);
		log.info("reset stress ledger state (postgres + redis)");
	} finally {
		await sql.end({ timeout: 5 });
	}
}

async function waitForApiHealth(
	baseUrl: string,
	timeoutMs: number,
): Promise<void> {
	const ledger = createLayer2LedgerClient(baseUrl);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = unwrapLayer2LedgerResponse(await ledger.get());
			if (response.error_code === ErrorCodes.SUCCESS) {
				return;
			}
		} catch {
			// Retry until timeout.
		}
		await sleep(500);
	}
	throw new Error(`Timed out waiting for ledger API at ${baseUrl}`);
}

function buildDescription(options: {
	mode: BalanceCacheMode;
	transactionCount: number;
	vus: number;
	concurrency: number;
	settleConcurrency: number;
	settleTimeoutMs: number;
}): string {
	return [
		`balance_cache_mode=${options.mode}`,
		`push_dispatch=k6`,
		`stress_vus=${options.vus}`,
		`STRESS_TX_COUNT=${options.transactionCount}`,
		`STRESS_CONCURRENCY=${options.concurrency}`,
		`STRESS_SETTLE_CONCURRENCY=${options.settleConcurrency}`,
		`STRESS_SETTLE_TIMEOUT_MS=${options.settleTimeoutMs}`,
		`ENVIRONMENT=${process.env.ENVIRONMENT ?? ""}`,
		`LAYER2LEDGER_API_URL=${ledgerApiUrl()}`,
	].join("\n");
}

/**
 * Prepare signed push bodies, seed balances, apply cold/warm cache, start the
 * profiler session, and dump JSON for k6 (`push-requests.json` + `push-meta.json`).
 */
export async function preparePushDataset(
	mode: BalanceCacheMode,
): Promise<PushStressMeta> {
	const transactionCount = Number(process.env.STRESS_TX_COUNT ?? "50000");
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	const settleConcurrencyRaw = Number(process.env.STRESS_SETTLE_CONCURRENCY);
	const settleConcurrency =
		Number.isFinite(settleConcurrencyRaw) && settleConcurrencyRaw > 0
			? settleConcurrencyRaw
			: concurrency;
	const settleTimeoutMs = Number(
		process.env.STRESS_SETTLE_TIMEOUT_MS ?? "600000",
	);
	const vus = resolveVus();
	const amount = 100;
	const fee = 10;
	const initialBalance = 1000;
	const seedErrors = emptyApiErrorCounts();

	if (!Number.isFinite(transactionCount) || transactionCount < 1) {
		throw new Error(`Invalid STRESS_TX_COUNT=${process.env.STRESS_TX_COUNT}`);
	}

	const { redisTransaction, redisAddressBalance, balanceCache } =
		await createRedisClients();
	try {
		await resetStressLedgerState(redisTransaction, redisAddressBalance);
		await waitForApiHealth(ledgerApiUrl(), 60_000);

		const ledger = createLayer2LedgerClient(ledgerApiUrl());
		const testhelper = createLayer2TestHelperClient(testhelperUrl());
		const nodeInfo = unwrapLayer2LedgerResponse(
			await ledger.info.get_node_info.get(),
		);
		if (nodeInfo.error_code !== ErrorCodes.SUCCESS) {
			throw new Error(`get_node_info failed: ${nodeInfo.error_code}`);
		}
		const nodeId = nodeInfo.node_info.node_id;
		const assetId = nodeInfo.node_info.asset_id || NODE_ASSET_ID_HEX;

		const title =
			mode === BalanceCacheMode.Cold
				? "pushTransaction cold balance cache (k6)"
				: "pushTransaction warm balance cache (k6)";
		const description = buildDescription({
			mode,
			transactionCount,
			vus,
			concurrency,
			settleConcurrency,
			settleTimeoutMs,
		});

		log.info("preparing push dataset", {
			mode,
			transaction_count: transactionCount,
			vus,
		});

		const prepareStartedAt = performance.now();
		const unsigned = await mapPool(
			Array.from({ length: transactionCount }, (_, index) => index),
			concurrency,
			async () => {
				const source = newLayer2Address();
				const dest = newLayer2Address();
				const transactionId = crypto.randomUUID();
				const message = buildTransferMessage(
					nodeId,
					assetId,
					source.public_key_str_base58,
					dest.public_key_str_base58,
					amount,
					fee,
					transactionId,
				);
				return { source, dest, transactionId, message };
			},
		);
		const prepareMs = Math.round(performance.now() - prepareStartedAt);

		const signStartedAt = performance.now();
		const prepared = await mapPool(
			unsigned,
			concurrency,
			async ({ source, dest, transactionId, message }) => {
				const signature = await source.signMessage(message);
				return { source, dest, transactionId, signature };
			},
		);
		const signMs = Math.round(performance.now() - signStartedAt);

		const seedStartedAt = performance.now();
		await mapPool(prepared, concurrency, async ({ source }) => {
			try {
				unwrapLayer2TestHelperResponse(
					await testhelper.testhelper.seed.balance.post({
						address: source.public_key_str_base58,
						balance: initialBalance,
						include_deposit_transaction: false,
					}),
				);
			} catch (error) {
				recordApiError(seedErrors, apiErrorReason(error));
			}
		});
		const seedMs = Math.round(performance.now() - seedStartedAt);

		if (mode === BalanceCacheMode.Cold) {
			await clearAddressBalanceCache(redisAddressBalance);
			log.info("cleared balance cache before push (cold cache)");
		} else {
			const cacheEntries = prepared.map(({ source }) => ({
				address: source.public_key_str_base58,
				balance: initialBalance,
			}));
			const cacheChunkSize = 1000;
			for (let i = 0; i < cacheEntries.length; i += cacheChunkSize) {
				await setCachedAddressBalances(
					redisAddressBalance,
					cacheEntries.slice(i, i + cacheChunkSize),
					balanceCache,
				);
			}
			log.info("filled balance cache before push (warm cache)", {
				addresses: cacheEntries.length,
			});
		}

		await resetAddressBalanceCacheStats(redisAddressBalance);
		await redisTransaction.del(profilerInFlightKey("pushTransaction"));

		const bodies: PushTransactionBody[] = prepared.map(
			({ source, dest, transactionId, signature }) => ({
				amount,
				destination_address_public_key: dest.public_key_str_base58,
				fee,
				signature,
				source_address_public_key: source.public_key_str_base58,
				transaction_id: transactionId,
			}),
		);

		const datasetFile = pushDatasetPath();
		await Bun.write(datasetFile, `${JSON.stringify(bodies)}\n`);

		const sessionId = crypto.randomUUID();
		const startSession = unwrapLayer2LedgerResponse(
			await ledger.health.start_profiler_session.post({
				session_id: sessionId,
				title,
				description,
				apis: [ProfilerApiName.PushTransaction, ProfilerApiName.Dbwriter],
			}),
		);
		if (startSession.error_code !== ErrorCodes.SUCCESS) {
			throw new Error(
				`start_profiler_session failed: ${startSession.error_code}`,
			);
		}

		const meta: PushStressMeta = {
			service: "layer2ledger",
			api: "push_transaction",
			mode,
			title,
			description,
			session_id: sessionId,
			transaction_count: transactionCount,
			transaction_ids: bodies.map((body) => body.transaction_id),
			prepare_ms: prepareMs,
			sign_ms: signMs,
			seed_ms: seedMs,
			seed_errors: seedErrors,
			vus,
			amount,
			fee,
			initial_balance: initialBalance,
			dataset_file: datasetFile,
			started_at_unix_ms: startSession.started_at_unix_ms,
		};
		await Bun.write(pushMetaPath(), `${JSON.stringify(meta, null, 2)}\n`);

		log.info("push dataset ready for k6", {
			mode,
			session_id: sessionId,
			dataset_file: datasetFile,
			transaction_count: bodies.length,
			vus,
		});
		console.log(
			`stress prepare ready mode=${mode} session=${sessionId} txs=${bodies.length} vus=${vus} dataset=${datasetFile}`,
		);
		return meta;
	} finally {
		await redisTransaction.quit();
		await redisAddressBalance.quit();
	}
}
