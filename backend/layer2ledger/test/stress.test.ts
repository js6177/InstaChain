import { expect } from "bun:test";
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
import type { Layer2Address } from "@openl2/pubkey-utils";
import { getTableName } from "drizzle-orm";
import Redis from "ioredis";
import { createDatabase } from "../src/db/client";
import { schema } from "../src/db/schema";
import {
	type AddressBalanceCacheOptions,
	clearAddressBalanceCache,
	getAddressBalanceCacheStats,
	resetAddressBalanceCacheStats,
	resolveAddressBalanceCacheOptions,
	setCachedAddressBalances,
} from "../src/redis/address-balance-cache";
import {
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../src/redis/distributed-lock";
import {
	ProfilerApiName,
	ProfilerSessionReport,
	profilerSessionMetaKey,
	profilerSessionOutputPath,
	StartProfilerSession,
} from "../src/redis/profiler-session";
import {
	ensureTransactionIdBloomFilter,
	TRANSACTION_ID_BLOOM_KEY,
} from "../src/redis/transaction-id-bloom";
import { prependGetBalanceStressHistory } from "../src/redis/get-balance-stress-history";
import { profilerInFlightKey } from "../src/transaction-processing/push-transaction-profiler";
import {
	buildGetBalanceStressMatrix,
	computeLatencyStats,
	computeSuccessRatePct,
	DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	DEFAULT_GET_BALANCE_CACHE_PCTS,
	DEFAULT_GET_BALANCE_CALL_COUNTS,
	DEFAULT_GET_BALANCE_NONZERO_PCTS,
	emptyApiErrorCounts,
	emptyApiErrors,
	getBalanceStressHistoryPath,
	GetBalanceStressBatchResult,
	GetBalanceStressHistory,
	GetBalanceStressHistoryEntry,
	GetBalanceStressResult,
	GetBalanceStressVariables,
	HealthStressResult,
	greedyPool,
	mapPool,
	newLayer2Address,
	recordApiError,
	sleep,
	STRESS_SUCCESS_RATE_WARNING_PCT,
	StressCacheStats,
	StressPhaseTimingsMs,
	StressProfilerSessionSummary,
	StressRunResult,
	StressThroughputResult,
	type StressApiErrorCounts,
} from "./common";

enum BalanceCacheMode {
	Cold = "cold",
	Warm = "warm",
}

interface StressVisualizationLink {
	title: string;
	sessionId: string;
	url: string;
}

/**
 * Bun's default in-flight `fetch` cap is 256. `bun test` does not honor raising
 * `BUN_CONFIG_MAX_HTTP_REQUESTS`, so this file re-execs itself under plain `bun`
 * with the limit applied before any stress HTTP starts.
 *
 * Override with STRESS_BUN_MAX_HTTP_REQUESTS (default 1024, max 65535). Push
 * in-flight is capped to this value so the stress client does not oversubscribe
 * Bun's queue.
 */
function resolveStressBunMaxHttpRequests(): number {
	const raw = Number(process.env.STRESS_BUN_MAX_HTTP_REQUESTS ?? "1024");
	if (!Number.isFinite(raw) || raw < 1) {
		return 1024;
	}
	return Math.min(65_535, Math.floor(raw));
}

export const STRESS_BUN_MAX_HTTP_REQUESTS = resolveStressBunMaxHttpRequests();
const STRESS_BUN_HTTP_LIMIT_READY = "STRESS_BUN_HTTP_LIMIT_READY";

const runHttpStress = process.env.RUN_LEDGER_HTTP_STRESS === "1";
const runHealthStress = process.env.RUN_LEDGER_HEALTH_STRESS === "1";
const runGetBalanceStress = process.env.RUN_LEDGER_GET_BALANCE_STRESS === "1";
const isStressRun = runHttpStress || runHealthStress || runGetBalanceStress;

function ensureBunFetchConcurrencyLimit(): void {
	if (process.env[STRESS_BUN_HTTP_LIMIT_READY] === "1") {
		return;
	}
	const result = Bun.spawnSync({
		cmd: [process.execPath, import.meta.path],
		env: {
			...process.env,
			BUN_CONFIG_MAX_HTTP_REQUESTS: String(STRESS_BUN_MAX_HTTP_REQUESTS),
			[STRESS_BUN_HTTP_LIMIT_READY]: "1",
		},
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
	});
	process.exit(result.exitCode ?? 1);
}

/** Cap greedy push fan-out to Bun's HTTP limit (default / override via STRESS_PUSH_MAX_IN_FLIGHT). */
function resolvePushMaxInFlight(transactionCount: number): number {
	const bunCap = STRESS_BUN_MAX_HTTP_REQUESTS;
	const raw = Number(process.env.STRESS_PUSH_MAX_IN_FLIGHT ?? "1024");
	if (Number.isFinite(raw) && raw > 0) {
		return Math.max(1, Math.min(transactionCount, Math.floor(raw), bunCap));
	}
	return Math.max(1, Math.min(transactionCount, bunCap));
}

// Only re-exec / raise Bun's fetch cap for intentional stress runs. Unit
// `bun test` may discover this file; without stress flags we must not take over.
if (isStressRun) {
	ensureBunFetchConcurrencyLimit();
}

const log = createOpenL2Logger({
	serviceName: "layer2ledger-stress",
});

const ledgerApiUrl =
	process.env.LAYER2LEDGER_API_URL ?? "http://layer2ledgerapihandler-nginx:8000";
const testhelperUrl =
	process.env.TESTHELPER_BASE_URL ?? "http://layer2ledger-testhelper:8001";
/** Host-facing wallet origin for profiler session charts (docker publishes :5173). */
const walletWebOrigin = (
	process.env.WALLET_WEB_ORIGIN ??
	process.env.VITE_APP_ORIGIN ??
	"http://localhost:5173"
).replace(/\/$/, "");

/** Default is the ledger health API (proxied through nginx → apihandler). */
const healthPath = process.env.STRESS_HEALTH_PATH ?? "/health";

function profilerSessionVisualizationUrl(sessionId: string): string {
	return `${walletWebOrigin}/explorer/stats/${encodeURIComponent(sessionId)}`;
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

function isTransientGatewayError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("status 502") ||
		message.includes("status 503") ||
		message.includes("status 504") ||
		message.includes("typo in the url or port")
	);
}

function apiErrorReason(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const statusMatch = message.match(/status\s+(\d+)/i);
	if (statusMatch?.[1]) {
		return `http_${statusMatch[1]}`;
	}
	if (message.includes("typo in the url or port")) {
		return "connection_failed";
	}
	const trimmed = message.replace(/\s+/g, " ").trim();
	return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

/** Retry ledger calls that fail through nginx with transient gateway errors. */
async function withGatewayRetry<T>(
	fn: () => Promise<T>,
	options?: { attempts?: number; delayMs?: number },
): Promise<T> {
	const attempts = options?.attempts ?? 8;
	const delayMs = options?.delayMs ?? 250;
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isTransientGatewayError(error) || attempt === attempts) {
				throw error;
			}
			await sleep(delayMs * attempt);
		}
	}
	throw lastError;
}

async function callLedgerApi<T>(
	bucket: StressApiErrorCounts,
	fn: () => Promise<{ error_code: number; error_message?: string } & T>,
	options?: { ignoreErrorCodes?: readonly number[] },
): Promise<({ error_code: number; error_message?: string } & T) | null> {
	const ignoreErrorCodes = new Set(options?.ignoreErrorCodes ?? []);
	try {
		const response = await withGatewayRetry(fn);
		if (
			response.error_code !== ErrorCodes.SUCCESS &&
			!ignoreErrorCodes.has(response.error_code)
		) {
			recordApiError(
				bucket,
				`error_code_${response.error_code}:${response.error_message ?? ""}`,
			);
		}
		return response;
	} catch (error) {
		recordApiError(bucket, apiErrorReason(error));
		return null;
	}
}

interface PreparedTransfer {
	source: Layer2Address;
	dest: Layer2Address;
	transactionId: string;
	signature: string;
}

interface RunPushStressOptions {
	transactionCount: number;
	/**
	 * cold: wipe Redis balance cache after seeding so push reads miss and fall
	 * back to Postgres. warm: fill Redis with each source address balance
	 * before push so get_balance hits the cache.
	 */
	balanceCacheMode: BalanceCacheMode;
	/** Display title stored on the profiler session report / explorer UI. */
	title: string;
	/** Free-form details stored on the profiler session (e.g. stress env). */
	description: string;
	redisTransaction: Redis;
	redisAddressBalance: Redis;
	balanceCache: AddressBalanceCacheOptions;
}

function buildStressProfilerDescription(options: {
	balanceCacheMode: BalanceCacheMode;
	transactionCount: number;
	concurrency: number;
	pushMaxInFlight: number;
	settleConcurrency: number;
	settleTimeoutMs: number;
}): string {
	const lines = [
		`balance_cache_mode=${options.balanceCacheMode}`,
		`push_dispatch=greedy`,
		`push_max_in_flight=${options.pushMaxInFlight}`,
		`STRESS_TX_COUNT=${options.transactionCount}`,
		`STRESS_CONCURRENCY=${options.concurrency}`,
		`STRESS_PUSH_MAX_IN_FLIGHT=${process.env.STRESS_PUSH_MAX_IN_FLIGHT ?? ""}`,
		`STRESS_SETTLE_CONCURRENCY=${options.settleConcurrency}`,
		`STRESS_SETTLE_TIMEOUT_MS=${options.settleTimeoutMs}`,
		`STRESS_BUN_MAX_HTTP_REQUESTS=${STRESS_BUN_MAX_HTTP_REQUESTS}`,
		`BUN_CONFIG_MAX_HTTP_REQUESTS=${process.env.BUN_CONFIG_MAX_HTTP_REQUESTS ?? ""}`,
		`ENVIRONMENT=${process.env.ENVIRONMENT ?? ""}`,
		`LAYER2LEDGER_API_URL=${ledgerApiUrl}`,
	];
	return lines.join("\n");
}

async function deleteRedisKeysByPattern(
	redisTransaction: Redis,
	pattern: string,
): Promise<void> {
	let cursor = "0";
	do {
		const [nextCursor, keys] = await redisTransaction.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			500,
		);
		cursor = nextCursor;
		if (keys.length > 0) {
			await redisTransaction.del(...keys);
		}
	} while (cursor !== "0");
}

/**
 * Stress-only reset of shared Postgres/Redis so cold and warm variants start
 * from the same empty ledger state (bloom, balances, pending queues, locks).
 * Unit tests intentionally skip this between cases for speed.
 */
async function resetStressLedgerState(
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
		// Fresh empty bloom; do not replay truncated (empty) Postgres rows.
		process.env.SKIP_BLOOM_PG_REBUILD = "1";
		await ensureTransactionIdBloomFilter(db, redisTransaction);
		log.info("reset stress ledger state (postgres + redis)");
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/**
 * Push `transactionCount` transfers through the live Elysia API, wait for the
 * running dbwriter to persist them, and return push client-RTT + phase timings.
 */
async function runPushTransactionStress(
	options: RunPushStressOptions,
): Promise<StressRunResult> {
	const {
		transactionCount,
		balanceCacheMode,
		title,
		description,
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	} = options;
	const amount = 100;
	const fee = 10;
	const initialBalance = 1000;
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	/** Settle polling can use a lower fan-out than push (high settle conc amplifies overload). */
	const settleConcurrencyRaw = Number(process.env.STRESS_SETTLE_CONCURRENCY);
	const settleConcurrency =
		Number.isFinite(settleConcurrencyRaw) && settleConcurrencyRaw > 0
			? settleConcurrencyRaw
			: concurrency;
	const settleTimeoutMs = Number(
		process.env.STRESS_SETTLE_TIMEOUT_MS ?? "120000",
	);
	const apiErrors = emptyApiErrors();

	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const testhelper = createLayer2TestHelperClient(testhelperUrl);

	await waitForApiHealth(ledgerApiUrl, 60_000);

	const nodeInfo = unwrapLayer2LedgerResponse(
		await ledger.info.get_node_info.get(),
	);
	expect(nodeInfo.error_code).toBe(ErrorCodes.SUCCESS);
	const nodeId = nodeInfo.node_info.node_id;
	const assetId = nodeInfo.node_info.asset_id || NODE_ASSET_ID_HEX;

	log.info("checked health", { title, balance_cache_mode: balanceCacheMode });
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
	log.info("created unsigned messages");

	const signStartedAt = performance.now();
	const prepared: PreparedTransfer[] = await mapPool(
		unsigned,
		concurrency,
		async ({ source, dest, transactionId, message }) => {
			const signature = await source.signMessage(message);
			return { source, dest, transactionId, signature };
		},
	);
	const signMs = Math.round(performance.now() - signStartedAt);
	log.info("signed messages");

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
			recordApiError(apiErrors.seed, apiErrorReason(error));
		}
	});
	const seedMs = Math.round(performance.now() - seedStartedAt);
	log.info("seeded balances");

	if (balanceCacheMode === BalanceCacheMode.Cold) {
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
	const pushLatenciesMs: number[] = [];
	const acceptedTransactionIds: string[] = [];
	const profilerSessionId = crypto.randomUUID();

	const startSession = unwrapLayer2LedgerResponse(
		await ledger.health.start_profiler_session.post({
			session_id: profilerSessionId,
			title,
			description,
			apis: [ProfilerApiName.PushTransaction, ProfilerApiName.Dbwriter],
		}),
	);
	expect(startSession.error_code).toBe(ErrorCodes.SUCCESS);

	// Keep push fan-out at/under Bun's HTTP in-flight cap so the client does
	// not oversubscribe the fetch queue (default 1024).
	const pushMaxInFlight = resolvePushMaxInFlight(prepared.length);
	log.info("greedy push starting", {
		title,
		description,
		profiler_session_id: profilerSessionId,
		max_in_flight: pushMaxInFlight,
		bun_max_http_requests: STRESS_BUN_MAX_HTTP_REQUESTS,
		transaction_count: prepared.length,
		started_at_unix_ms: startSession.started_at_unix_ms,
	});
	await greedyPool(
		prepared,
		pushMaxInFlight,
		async ({ source, dest, transactionId, signature }) => {
			const startedAt = performance.now();
			const response = await callLedgerApi(apiErrors.push, async () =>
				unwrapLayer2LedgerResponse(
					await ledger.transfer.push_transaction.post({
						amount,
						destination_address_public_key: dest.public_key_str_base58,
						fee,
						signature,
						source_address_public_key: source.public_key_str_base58,
						transaction_id: transactionId,
					}),
				),
			);
			if (response?.error_code === ErrorCodes.SUCCESS) {
				pushLatenciesMs.push(performance.now() - startedAt);
				acceptedTransactionIds.push(transactionId);
			}
		},
	);
	log.info("pushed transactions");
	const acceptedPushes = acceptedTransactionIds.length;
	const cache = await getAddressBalanceCacheStats(redisAddressBalance);

	const pendingIds = new Set(acceptedTransactionIds);
	const deadline = Date.now() + settleTimeoutMs;
	while (pendingIds.size > 0 && Date.now() < deadline) {
		const stillPending = [...pendingIds];
		await mapPool(stillPending, settleConcurrency, async (transactionId) => {
			const response = await callLedgerApi(
				apiErrors.settle,
				async () =>
					unwrapLayer2LedgerResponse(
						await ledger.explorer.get_transaction.post({
							layer2_transaction_id: transactionId,
						}),
					),
				// Not-found is expected until dbwriter catches up.
				{ ignoreErrorCodes: [ErrorCodes.TRANSACTION_ID_NOT_FOUND] },
			);
			if (response?.error_code === ErrorCodes.SUCCESS) {
				pendingIds.delete(transactionId);
			}
		});

		if (pendingIds.size > 0) {
			await sleep(500);
		}
	}
	log.info("settled transactions");

	const stopSession = unwrapLayer2LedgerResponse(
		await ledger.health.stop_profiler_session.post({
			session_id: profilerSessionId,
		}),
	);
	expect(stopSession.error_code).toBe(ErrorCodes.SUCCESS);
	expect(stopSession.session).toBeDefined();
	if (!stopSession.session) {
		throw new Error("stop_profiler_session returned no session report");
	}
	const profilerSession = await persistProfilerSessionReport(
		stopSession.session ?? null,
	);

	return new StressRunResult({
		processedToPostgres: acceptedPushes - pendingIds.size,
		acceptedPushes,
		pushClientRttMs: computeLatencyStats(pushLatenciesMs),
		phaseTimingsMs: new StressPhaseTimingsMs({
			prepareMs,
			signMs,
			seedMs,
			pushMs: profilerSession.pushMs,
			settleMs: profilerSession.settleMs,
			pushToSettleMs: profilerSession.pushToSettleMs,
			totalMs: prepareMs + signMs + seedMs + profilerSession.pushToSettleMs,
		}),
		apiErrors,
		cache: new StressCacheStats(cache),
		profilerSession,
	});
}

function summarizeProfilerSession(
	report: ProfilerSessionReport,
	outputFile: string | null,
): StressProfilerSessionSummary {
	const pushStats = report.api_stats.find(
		(stats) => stats.api === ProfilerApiName.PushTransaction,
	);
	const pushMs =
		pushStats?.first_start_unix_ms != null &&
		pushStats.last_end_unix_ms != null
			? Math.max(pushStats.last_end_unix_ms - pushStats.first_start_unix_ms, 0)
			: 0;
	const pushToSettleMs =
		report.dbwriter?.throughput_start_ms != null &&
		report.dbwriter.throughput_end_ms != null
			? Math.max(
					report.dbwriter.throughput_end_ms -
						report.dbwriter.throughput_start_ms,
					0,
				)
			: pushMs;
	return new StressProfilerSessionSummary({
		sessionId: report.session_id,
		outputFile,
		pushTxsPerSecond: pushStats?.throughput_per_sec ?? 0,
		settledTxsPerSecond: report.dbwriter?.throughput_per_sec ?? 0,
		pushPeakConcurrent: pushStats?.peak_concurrent ?? 0,
		pushAvgLatencyMs: pushStats?.avg_latency_ms ?? 0,
		pushCount: pushStats?.count ?? 0,
		dbwriterWritesTotal: report.dbwriter?.writes_total ?? 0,
		pushMs,
		pushToSettleMs,
		settleMs: Math.max(pushToSettleMs - pushMs, 0),
	});
}

async function persistProfilerSessionReport(
	report: ProfilerSessionReport | object | null,
): Promise<StressProfilerSessionSummary> {
	// Eden/JSON responses are plain objects — rehydrate before using class methods.
	const parsed = ProfilerSessionReport.parse(report);
	if (!parsed) {
		throw new Error("stop_profiler_session returned an invalid session report");
	}
	const outputDir =
		process.env.PROFILER_SESSION_OUTPUT_DIR ??
		(process.env.STRESS_RESULT_FILE
			? process.env.STRESS_RESULT_FILE.replace(/\/[^/]+$/, "")
			: "/tmp");
	const outputFile = profilerSessionOutputPath(parsed.session_id, outputDir);
	const reportForFile = parsed.withOutputFile(outputFile);
	await Bun.write(outputFile, `${JSON.stringify(reportForFile, null, 2)}\n`);
	const visualizationUrl = profilerSessionVisualizationUrl(parsed.session_id);
	console.log(
		`profiler session report written path=${outputFile} title=${parsed.title}`,
	);
	// Print the URL alone so terminals that auto-linkify can make it clickable.
	console.log("profiler session visualization:");
	console.log(visualizationUrl);
	return summarizeProfilerSession(reportForFile, outputFile);
}

function toThroughputResult(
	transactionCount: number,
	run: StressRunResult,
): StressThroughputResult {
	return new StressThroughputResult({
		transactionCount,
		processedToPostgres: run.processedToPostgres,
		acceptedPushes: run.acceptedPushes,
		elapsedMs: run.profilerSession.pushMs,
		pushTxsPerSecond: run.profilerSession.pushTxsPerSecond,
		settledTxsPerSecond: run.profilerSession.settledTxsPerSecond,
		txsPerSecond: run.profilerSession.pushTxsPerSecond,
		profilerSessionId: run.profilerSession.sessionId,
		pushClientRttMs: run.pushClientRttMs,
		phaseTimingsMs: run.phaseTimingsMs,
		apiErrors: run.apiErrors,
		cache: run.cache,
	});
}

function printThroughputSummary(
	title: string,
	result: StressThroughputResult,
): void {
	const visualizationUrl = profilerSessionVisualizationUrl(
		result.profilerSessionId,
	);
	const line =
		`title=${title} ` +
		`profiler_session=${result.profilerSessionId} ` +
		`push_ms=${result.phaseTimingsMs.pushMs} ` +
		`settle_ms=${result.phaseTimingsMs.settleMs} ` +
		`push_to_settle_ms=${result.phaseTimingsMs.pushToSettleMs} ` +
		`total_ms=${result.phaseTimingsMs.totalMs} ` +
		`push_txs_per_sec=${result.pushTxsPerSecond} ` +
		`settled_txs_per_sec=${result.settledTxsPerSecond} ` +
		`cache_hits=${result.cache.hits} cache_misses=${result.cache.misses}`;
	console.log(line);
	// Print the URL alone so terminals that auto-linkify can make it clickable.
	console.log(visualizationUrl);
	log.info("stress throughput summary", {
		title,
		profiler_session_id: result.profilerSessionId,
		visualization_url: visualizationUrl,
		phase_timings_ms: result.phaseTimingsMs,
		push_txs_per_second: result.pushTxsPerSecond,
		settled_txs_per_second: result.settledTxsPerSecond,
		txs_per_second: result.txsPerSecond,
		cache: result.cache,
	});
}

function printStressVisualizationUrls(
	links: readonly StressVisualizationLink[],
): void {
	console.log("stress profiler visualization urls:");
	for (const link of links) {
		console.log(`${link.title}:`);
		console.log(link.url);
	}
}

function stressResultFileForMode(mode: BalanceCacheMode): string | null {
	const base = process.env.STRESS_RESULT_FILE;
	if (!base) {
		return null;
	}
	if (mode === BalanceCacheMode.Cold) {
		return base;
	}
	return base.replace(/(\.json)?$/i, ".warm-cache.json");
}

async function waitForHealthEndpoint(timeoutMs: number): Promise<void> {
	if (healthPath === "/nginx-health") {
		throw new Error(
			"STRESS_HEALTH_PATH=/nginx-health is not supported; use Eden via /health",
		);
	}
	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = unwrapLayer2LedgerResponse(await ledger.health.get());
			if (response.error_code === ErrorCodes.SUCCESS) {
				return;
			}
		} catch {
			// Retry until timeout.
		}
		await sleep(250);
	}
	throw new Error(`Timed out waiting for health at ${ledgerApiUrl}/health`);
}

async function runHealthHttpStress(): Promise<void> {
	const requestCount = Number(
		process.env.STRESS_REQUEST_COUNT ??
			process.env.STRESS_TX_COUNT ??
			"10000",
	);
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	expect(Number.isFinite(requestCount) && requestCount > 0).toBe(true);
	expect(Number.isFinite(concurrency) && concurrency > 0).toBe(true);

	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	await waitForHealthEndpoint(60_000);
	log.info(`health stress starting path=/health url=${ledgerApiUrl}/health`);

	const apiErrors = emptyApiErrorCounts();
	const latenciesMs: number[] = [];
	let accepted = 0;

	const startedAt = performance.now();
	await mapPool(
		Array.from({ length: requestCount }, (_, index) => index),
		concurrency,
		async () => {
			const reqStarted = performance.now();
			try {
				const body = unwrapLayer2LedgerResponse(await ledger.health.get());
				if (body.error_code !== ErrorCodes.SUCCESS) {
					recordApiError(
						apiErrors,
						`error_code_${body.error_code}:${body.error_message ?? ""}`,
					);
					return;
				}
				accepted += 1;
				latenciesMs.push(performance.now() - reqStarted);
			} catch (error) {
				recordApiError(apiErrors, apiErrorReason(error));
			}
		},
	);
	const elapsedMs = Math.round(performance.now() - startedAt);
	const requestsPerSecond = Number(
		((accepted / Math.max(elapsedMs, 1)) * 1000).toFixed(2),
	);
	const clientRttMs = computeLatencyStats(latenciesMs);

	const result = new HealthStressResult({
		path: "/health",
		requestCount,
		concurrency,
		accepted,
		elapsedMs,
		requestsPerSecond,
		clientRttMs,
		apiErrors,
	});

	const successRatePct = computeSuccessRatePct(accepted, requestCount);
	warnIfLowSuccessRate("health stress", successRatePct, accepted, requestCount);

	const summary =
		`health_stress path=/health requests=${requestCount} ` +
		`concurrency=${concurrency} accepted=${accepted} ` +
		`success_rate_pct=${successRatePct} ` +
		`elapsed_ms=${elapsedMs} reqs_per_sec=${requestsPerSecond} ` +
		`rtt_avg_ms=${clientRttMs.average} rtt_p25=${clientRttMs.bottomQuartile} ` +
		`rtt_p75=${clientRttMs.upperQuartile} errors=${apiErrors.total}`;
	console.log(summary);
	log.info("health stress complete", {
		path: "/health",
		request_count: requestCount,
		concurrency,
		accepted,
		success_rate_pct: successRatePct,
		elapsed_ms: elapsedMs,
		requests_per_second: requestsPerSecond,
		client_rtt_ms: clientRttMs,
		api_errors: apiErrors,
	});

	const resultFile =
		process.env.STRESS_HEALTH_RESULT_FILE ?? process.env.STRESS_RESULT_FILE;
	if (resultFile) {
		await Bun.write(resultFile, `${JSON.stringify(result, null, 2)}\n`);
	}
}

async function runPushTransactionStressVariant(
	options: {
		transactionCount: number;
		balanceCacheMode: BalanceCacheMode;
		title: string;
		redisTransaction: Redis;
		redisAddressBalance: Redis;
		balanceCache: AddressBalanceCacheOptions;
	},
): Promise<StressVisualizationLink> {
	const {
		transactionCount,
		balanceCacheMode,
		title,
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	} = options;
	await resetStressLedgerState(redisTransaction, redisAddressBalance);
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	const settleConcurrencyRaw = Number(process.env.STRESS_SETTLE_CONCURRENCY);
	const settleConcurrency =
		Number.isFinite(settleConcurrencyRaw) && settleConcurrencyRaw > 0
			? settleConcurrencyRaw
			: concurrency;
	const settleTimeoutMs = Number(
		process.env.STRESS_SETTLE_TIMEOUT_MS ?? "120000",
	);
	const pushMaxInFlight = resolvePushMaxInFlight(transactionCount);
	const description = buildStressProfilerDescription({
		balanceCacheMode,
		transactionCount,
		concurrency,
		pushMaxInFlight,
		settleConcurrency,
		settleTimeoutMs,
	});
	const run = await runPushTransactionStress({
		transactionCount,
		balanceCacheMode,
		title: `${title} (in_flight=${pushMaxInFlight})`,
		description,
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	});
	const throughput = toThroughputResult(transactionCount, run);

	console.log(
		`stress ${balanceCacheMode}-cache summary title=${title} tx_count=${transactionCount} push_max_in_flight=${pushMaxInFlight}`,
	);
	printThroughputSummary(title, throughput);

	log.info(`pushTransaction ${balanceCacheMode}-cache stress complete`, {
		title,
		description,
		transaction_count: transactionCount,
		throughput,
	});

	const pushSuccessRatePct = computeSuccessRatePct(
		throughput.acceptedPushes,
		transactionCount,
	);
	const settleSuccessRatePct = computeSuccessRatePct(
		throughput.processedToPostgres,
		Math.max(throughput.acceptedPushes, 1),
	);
	warnIfLowSuccessRate(
		`pushTransaction ${balanceCacheMode}-cache push`,
		pushSuccessRatePct,
		throughput.acceptedPushes,
		transactionCount,
	);
	warnIfLowSuccessRate(
		`pushTransaction ${balanceCacheMode}-cache settle`,
		settleSuccessRatePct,
		throughput.processedToPostgres,
		throughput.acceptedPushes,
	);

	const stressResultFile = stressResultFileForMode(balanceCacheMode);
	if (stressResultFile) {
		await Bun.write(
			stressResultFile,
			`${JSON.stringify(throughput, null, 2)}\n`,
		);
	}

	await resetStressLedgerState(redisTransaction, redisAddressBalance);

	return {
		title,
		sessionId: throughput.profilerSessionId,
		url: profilerSessionVisualizationUrl(throughput.profilerSessionId),
	};
}

/** Cold Redis balance cache: push reads miss and load balances from Postgres. */
async function runColdBalanceCachePushStress(
	transactionCount: number,
	redisTransaction: Redis,
	redisAddressBalance: Redis,
	balanceCache: AddressBalanceCacheOptions,
): Promise<StressVisualizationLink> {
	return runPushTransactionStressVariant({
		transactionCount,
		balanceCacheMode: BalanceCacheMode.Cold,
		title: "pushTransaction cold balance cache",
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	});
}

/** Warm Redis balance cache: source balances are prefilled before push. */
async function runWarmBalanceCachePushStress(
	transactionCount: number,
	redisTransaction: Redis,
	redisAddressBalance: Redis,
	balanceCache: AddressBalanceCacheOptions,
): Promise<StressVisualizationLink> {
	return runPushTransactionStressVariant({
		transactionCount,
		balanceCacheMode: BalanceCacheMode.Warm,
		title: "pushTransaction warm balance cache",
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	});
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(100, Math.max(0, value));
}

/** Parse `1,2,3` env lists; empty/missing → defaults. */
function parsePositiveNumberList(
	raw: string | undefined,
	defaults: readonly number[],
): number[] {
	if (raw === undefined || raw.trim().length === 0) {
		return [...defaults];
	}
	const values = raw
		.split(",")
		.map((part) => Number(part.trim()))
		.filter((value) => Number.isFinite(value) && value > 0);
	return values.length > 0 ? values : [...defaults];
}

function parsePercentList(
	raw: string | undefined,
	defaults: readonly number[],
): number[] {
	if (raw === undefined || raw.trim().length === 0) {
		return [...defaults];
	}
	const values = raw
		.split(",")
		.map((part) => clampPercent(Number(part.trim())))
		.filter((value) => Number.isFinite(value));
	return values.length > 0 ? values : [...defaults];
}

function warnIfLowSuccessRate(
	label: string,
	successRatePct: number,
	accepted: number,
	attempted: number,
): void {
	if (successRatePct < STRESS_SUCCESS_RATE_WARNING_PCT) {
		log.warning(
			`${label}: success rate ${successRatePct}% is below ${STRESS_SUCCESS_RATE_WARNING_PCT}% ` +
				`(${accepted}/${attempted} succeeded)`,
			{
				success_rate_pct: successRatePct,
				accepted,
				attempted,
				warning_threshold_pct: STRESS_SUCCESS_RATE_WARNING_PCT,
			},
		);
	}
}

async function appendProfilerSessionDescription(
	redisTransaction: Redis,
	sessionId: string,
	lines: readonly string[],
): Promise<void> {
	const raw = await redisTransaction.get(profilerSessionMetaKey(sessionId));
	const session = StartProfilerSession.fromJsonText(raw ?? "");
	if (!session) {
		return;
	}
	const updated = new StartProfilerSession({
		session_id: session.session_id,
		title: session.title,
		description: [session.description, ...lines]
			.filter((line) => line.length > 0)
			.join("\n"),
		apis: session.apis,
		started_at_unix_ms: session.started_at_unix_ms,
	});
	await redisTransaction.set(profilerSessionMetaKey(sessionId), JSON.stringify(updated));
}

function printGetBalanceBatchTable(
	batch: GetBalanceStressBatchResult,
): void {
	const headers = [
		"calls",
		"addresses",
		"cache%",
		"nonzero%",
		"success%",
		"reqs/s",
	] as const;
	const rows = batch.runs.map((run) => [
		String(run.variables.callCount),
		String(run.variables.addressCount),
		String(run.variables.cachePct),
		String(run.variables.nonzeroPct),
		String(run.successRatePct),
		String(run.requestsPerSecond),
	]);
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => row[column]!.length)),
	);
	const formatRow = (cells: readonly string[]): string =>
		`| ${cells.map((cell, i) => cell.padEnd(widths[i]!)).join(" | ")} |`;
	const divider = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
	console.log(divider);
	console.log(formatRow([...headers]));
	console.log(divider);
	for (const row of rows) {
		console.log(formatRow(row));
	}
	console.log(divider);
}

function printGetBalanceHistoryTable(
	history: GetBalanceStressHistory,
): void {
	if (history.entries.length === 0) {
		console.log("getBalance stress history: (empty)");
		return;
	}
	const headers = [
		"completed_at",
		"batch_id",
		"cells",
		"concurrency",
		"min_success%",
		"avg_reqs/s",
		"url",
	] as const;
	const rows = history.entries.map((entry) => [
		new Date(entry.completedAtUnixMs).toISOString(),
		entry.batchId,
		String(entry.runCount),
		String(entry.concurrency),
		String(entry.minSuccessRatePct),
		String(entry.avgRequestsPerSecond),
		entry.visualizationUrl,
	]);
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => row[column]!.length)),
	);
	const formatRow = (cells: readonly string[]): string =>
		`| ${cells.map((cell, i) => cell.padEnd(widths[i]!)).join(" | ")} |`;
	const divider = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
	console.log("getBalance stress history:");
	console.log(divider);
	console.log(formatRow([...headers]));
	console.log(divider);
	for (const row of rows) {
		console.log(formatRow(row));
	}
	console.log(divider);
}

async function loadGetBalanceStressHistory(
	historyFile: string,
): Promise<GetBalanceStressHistory> {
	const existing = Bun.file(historyFile);
	if (!(await existing.exists())) {
		return GetBalanceStressHistory.empty();
	}
	try {
		const parsed = GetBalanceStressHistory.fromJsonText(await existing.text());
		return parsed ?? GetBalanceStressHistory.empty();
	} catch {
		return GetBalanceStressHistory.empty();
	}
}

async function persistGetBalanceStressHistory(options: {
	historyFile: string | null;
	batch: GetBalanceStressBatchResult;
	visualizationUrl: string;
	redisTransaction: Redis;
}): Promise<GetBalanceStressHistory> {
	const { historyFile, batch, visualizationUrl, redisTransaction } = options;
	const entry = GetBalanceStressHistoryEntry.fromBatch({
		batch,
		completedAtUnixMs: Date.now(),
		visualizationUrl,
	});
	await prependGetBalanceStressHistory(redisTransaction, entry.toSummary());
	if (!historyFile) {
		return GetBalanceStressHistory.empty().withEntry(entry);
	}
	const previous = await loadGetBalanceStressHistory(historyFile);
	const next = previous.withEntry(entry);
	await Bun.write(historyFile, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}

/**
 * Run the getBalance stress matrix (default 2×3×3×2 = 36 cells).
 * Each cell gets its own profiler session; Explorer loads siblings via
 * `get_balance_batch_sessions` in the session description.
 */
async function runGetBalanceHttpStress(): Promise<void> {
	const callCounts = parsePositiveNumberList(
		process.env.STRESS_GET_BALANCE_CALL_COUNT ??
			process.env.STRESS_REQUEST_COUNT,
		DEFAULT_GET_BALANCE_CALL_COUNTS,
	);
	const addressCounts = parsePositiveNumberList(
		process.env.STRESS_GET_BALANCE_ADDRESS_COUNT,
		DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	);
	const cachePcts = parsePercentList(
		process.env.STRESS_GET_BALANCE_CACHE_PCT,
		DEFAULT_GET_BALANCE_CACHE_PCTS,
	);
	const nonzeroPcts = parsePercentList(
		process.env.STRESS_GET_BALANCE_NONZERO_PCT,
		DEFAULT_GET_BALANCE_NONZERO_PCTS,
	);
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	expect(Number.isFinite(concurrency) && concurrency > 0).toBe(true);

	const matrix = buildGetBalanceStressMatrix({
		callCounts,
		addressCounts,
		cachePcts,
		nonzeroPcts,
	});
	expect(matrix.length).toBeGreaterThan(0);

	const batchId = crypto.randomUUID();
	// Pre-allocate session ids so every cell's description lists the full batch.
	const batchSessionIds = matrix.map(() => crypto.randomUUID());

	const commonConfig = loadLayer2LedgerCommonConfig();
	const balanceCache = resolveAddressBalanceCacheOptions(
		commonConfig.redis_addressbalance,
	);
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

	const runs: GetBalanceStressResult[] = [];

	try {
		await waitForApiHealth(ledgerApiUrl, 60_000);
		log.info("getBalance stress matrix starting", {
			batch_id: batchId,
			cells: matrix.length,
			call_counts: callCounts,
			address_counts: addressCounts,
			cache_pcts: cachePcts,
			nonzero_pcts: nonzeroPcts,
		});

		for (let index = 0; index < matrix.length; index += 1) {
			const variables = matrix[index]!;
			const sessionId = batchSessionIds[index]!;
			const result = await runOneGetBalanceStressVariantWithSessionId({
				variables,
				batchId,
				batchSessionIds,
				sessionId,
				concurrency,
				redisTransaction,
				redisAddressBalance,
				balanceCache,
			});
			runs.push(result);
			console.log(
				`getBalance matrix cell ${index + 1}/${matrix.length} ` +
					`accepted=${result.accepted}/${variables.callCount} ` +
					`success_rate_pct=${result.successRatePct} ` +
					`elapsed_ms=${result.elapsedMs} reqs_per_sec=${result.requestsPerSecond}`,
			);
		}

		const batch = new GetBalanceStressBatchResult({ batchId, runs });
		const visualizationUrl = profilerSessionVisualizationUrl(
			batch.sessionIds()[0] ?? batchId,
		);
		printGetBalanceBatchTable(batch);
		console.log("getBalance stress profiler visualization:");
		console.log(visualizationUrl);

		const resultFile =
			process.env.STRESS_GET_BALANCE_RESULT_FILE ??
			process.env.STRESS_RESULT_FILE;
		if (resultFile) {
			await Bun.write(resultFile, `${JSON.stringify(batch, null, 2)}\n`);
		}
		const historyFile = resultFile
			? (process.env.STRESS_GET_BALANCE_HISTORY_FILE ??
				getBalanceStressHistoryPath(resultFile))
			: (process.env.STRESS_GET_BALANCE_HISTORY_FILE ?? null);
		const history = await persistGetBalanceStressHistory({
			historyFile,
			batch,
			visualizationUrl,
			redisTransaction,
		});
		printGetBalanceHistoryTable(history);
	} finally {
		await resetStressLedgerState(redisTransaction, redisAddressBalance);
		await redisTransaction.quit();
		await redisAddressBalance.quit();
	}
}

async function runOneGetBalanceStressVariantWithSessionId(options: {
	variables: GetBalanceStressVariables;
	batchId: string;
	batchSessionIds: readonly string[];
	sessionId: string;
	concurrency: number;
	redisTransaction: Redis;
	redisAddressBalance: Redis;
	balanceCache: AddressBalanceCacheOptions;
}): Promise<GetBalanceStressResult> {
	const {
		variables,
		batchId,
		batchSessionIds,
		sessionId,
		concurrency,
		redisTransaction,
		redisAddressBalance,
		balanceCache,
	} = options;
	const { callCount, addressCount, cachePct, nonzeroPct } = variables;
	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const testhelper = createLayer2TestHelperClient(testhelperUrl);
	const apiErrors = emptyApiErrorCounts();
	const latenciesMs: number[] = [];
	let accepted = 0;

	await resetStressLedgerState(redisTransaction, redisAddressBalance);

	try {
		const poolSize = Math.max(addressCount * 4, addressCount, 64);
		const addresses = Array.from({ length: poolSize }, () =>
			newLayer2Address().public_key_str_base58,
		);
		const nonzeroCount = Math.round((poolSize * nonzeroPct) / 100);
		const cachedCount = Math.round((poolSize * cachePct) / 100);

		await mapPool(addresses, concurrency, async (address, index) => {
			const balance = index < nonzeroCount ? 1_000_000 + index : 0;
			try {
				unwrapLayer2TestHelperResponse(
					await testhelper.testhelper.seed.balance.post({
						address,
						balance,
						include_deposit_transaction: false,
					}),
				);
			} catch (error) {
				recordApiError(apiErrors, apiErrorReason(error));
			}
		});

		await clearAddressBalanceCache(redisAddressBalance);
		await setCachedAddressBalances(
			redisAddressBalance,
			addresses.slice(0, cachedCount).map((address, index) => ({
				address,
				balance: index < nonzeroCount ? 1_000_000 + index : 0,
			})),
			balanceCache,
		);
		await resetAddressBalanceCacheStats(redisAddressBalance);

		const title = `getBalance stress calls=${callCount} addrs=${addressCount} cache=${cachePct}% nonzero=${nonzeroPct}%`;
		const description = [
			...variables.toDescriptionLines(),
			`get_balance_batch_id=${batchId}`,
			`get_balance_batch_sessions=${batchSessionIds.join(",")}`,
			`STRESS_CONCURRENCY=${concurrency}`,
			`pool_size=${poolSize}`,
			`LAYER2LEDGER_API_URL=${ledgerApiUrl}`,
		].join("\n");

		await unwrapLayer2LedgerResponse(
			await ledger.health.start_profiler_session.post({
				session_id: sessionId,
				title,
				description,
				apis: [ProfilerApiName.GetBalance],
			}),
		);

		const startedAt = performance.now();
		await greedyPool(
			Array.from({ length: callCount }, (_, index) => index),
			concurrency,
			async (callIndex) => {
				const publicKeys = Array.from({ length: addressCount }, (_, offset) => {
					const index = (callIndex * addressCount + offset) % poolSize;
					return addresses[index]!;
				});
				const reqStarted = performance.now();
				const response = await callLedgerApi(apiErrors, async () =>
					unwrapLayer2LedgerResponse(
						await ledger.explorer.get_balance.post({
							public_keys: publicKeys,
						}),
					),
				);
				if (response?.error_code === ErrorCodes.SUCCESS) {
					accepted += 1;
					latenciesMs.push(performance.now() - reqStarted);
				}
			},
		);
		const elapsedMs = Math.round(performance.now() - startedAt);
		const successRatePct = computeSuccessRatePct(accepted, callCount);
		warnIfLowSuccessRate(
			`getBalance stress calls=${callCount} addrs=${addressCount} cache=${cachePct}% nonzero=${nonzeroPct}%`,
			successRatePct,
			accepted,
			callCount,
		);

		await appendProfilerSessionDescription(redisTransaction, sessionId, [
			`success_rate_pct=${successRatePct}`,
			`accepted=${accepted}`,
			`attempted=${callCount}`,
		]);

		const stopSession = unwrapLayer2LedgerResponse(
			await ledger.health.stop_profiler_session.post({
				session_id: sessionId,
			}),
		);
		const report = ProfilerSessionReport.parse(stopSession.session ?? null);
		expect(report).not.toBeNull();
		const outputFile = profilerSessionOutputPath(
			sessionId,
			process.env.PROFILER_SESSION_OUTPUT_DIR,
		);
		await Bun.write(outputFile, `${JSON.stringify(report, null, 2)}\n`);

		return new GetBalanceStressResult({
			variables,
			concurrency,
			accepted,
			successRatePct,
			elapsedMs,
			requestsPerSecond: Number(
				((accepted / Math.max(elapsedMs, 1)) * 1000).toFixed(2),
			),
			clientRttMs: computeLatencyStats(latenciesMs),
			apiErrors,
			profilerSessionId: sessionId,
			profilerOutputFile: outputFile,
		});
	} finally {
		await resetStressLedgerState(redisTransaction, redisAddressBalance);
	}
}

async function runPushTransactionHttpStress(): Promise<void> {
	const transactionCount = Number(process.env.STRESS_TX_COUNT ?? "50000");
	expect(Number.isFinite(transactionCount) && transactionCount > 0).toBe(true);

	const commonConfig = loadLayer2LedgerCommonConfig();
	const balanceCache = resolveAddressBalanceCacheOptions(
		commonConfig.redis_addressbalance,
	);
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

	const visualizationLinks: StressVisualizationLink[] = [];
	try {
		visualizationLinks.push(
			await runColdBalanceCachePushStress(
				transactionCount,
				redisTransaction,
				redisAddressBalance,
				balanceCache,
			),
		);
		visualizationLinks.push(
			await runWarmBalanceCachePushStress(
				transactionCount,
				redisTransaction,
				redisAddressBalance,
				balanceCache,
			),
		);
	} finally {
		if (visualizationLinks.length > 0) {
			printStressVisualizationUrls(visualizationLinks);
		}
		await redisTransaction.quit();
		await redisAddressBalance.quit();
	}
}

async function main(): Promise<void> {
	console.log(
		`stress runner BUN_CONFIG_MAX_HTTP_REQUESTS=${process.env.BUN_CONFIG_MAX_HTTP_REQUESTS} ` +
			`(target ${STRESS_BUN_MAX_HTTP_REQUESTS})`,
	);
	if (!isStressRun) {
		throw new Error(
			"No stress selected. Set RUN_LEDGER_HTTP_STRESS=1, RUN_LEDGER_HEALTH_STRESS=1, and/or RUN_LEDGER_GET_BALANCE_STRESS=1",
		);
	}
	if (runHealthStress) {
		await runHealthHttpStress();
	}
	if (runGetBalanceStress) {
		await runGetBalanceHttpStress();
	}
	if (runHttpStress) {
		await runPushTransactionHttpStress();
	}
}

if (import.meta.main) {
	if (!isStressRun) {
		// Discovered by `bun test` without stress flags — do not fail the suite.
		console.log(
			"stress.test.ts: skipping (set RUN_LEDGER_HTTP_STRESS=1, RUN_LEDGER_HEALTH_STRESS=1, and/or RUN_LEDGER_GET_BALANCE_STRESS=1)",
		);
	} else {
		await main();
	}
}