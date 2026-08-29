import { expect } from "bun:test";
import {
	createLayer2LedgerClient,
	createLayer2TestHelperClient,
	ErrorCodes,
	unwrapLayer2LedgerResponse,
	unwrapLayer2TestHelperResponse,
} from "../../../shared/api-layer2ledger/index.ts";
import { loadLayer2LedgerCommonConfig } from "@openl2/config-loader";
import { createOpenL2Logger } from "@openl2/openl2-logger";
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
import { createRedisDiagnosticsClient } from "../src/redis/diagnostics-client";
import {
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../src/redis/distributed-lock";
import { prependGetBalanceStressHistory } from "../src/redis/get-balance-stress-history";
import {
	ProfilerApiName,
	ProfilerSessionReport,
	profilerSessionMetaKey,
	profilerSessionOutputPath,
	StartProfilerSession,
} from "../src/redis/profiler-session";
import {
	ensureAddressBalanceBloomFilter,
	ADDRESS_BALANCE_BLOOM_KEY,
} from "../src/redis/address-balance-bloom";
import {
	ensureTransactionIdBloomFilter,
	TRANSACTION_ID_BLOOM_KEY,
} from "../src/redis/transaction-id-bloom";
import { profilerInFlightKey } from "../src/transaction-processing/push-transaction-profiler";
import {
	buildGetBalanceStressMatrix,
	computeLatencyStats,
	computeSuccessRatePct,
	DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	DEFAULT_GET_BALANCE_CACHE_PCTS,
	DEFAULT_GET_BALANCE_CALL_COUNTS,
	DEFAULT_GET_BALANCE_MISSING_POPULATED_ADDRESS_COUNTS,
	DEFAULT_GET_BALANCE_NONZERO_PCTS,
	emptyApiErrorCounts,
	GET_BALANCE_MISSING_ADDRESS_WORST_CASE_CALL_COUNT,
	GET_BALANCE_MISSING_POPULATED_CALL_COUNT,
	GET_BALANCE_MISSING_POPULATED_SEED_COUNT,
	getBalanceStressHistoryPath,
	GetBalanceAddressMode,
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
	type StressApiErrorCounts,
} from "./common";


/**
 * Bun's default in-flight `fetch` cap is 256. `bun test` does not honor raising
 * `BUN_CONFIG_MAX_HTTP_REQUESTS`, so this file re-execs itself under plain `bun`
 * with the limit applied before any stress HTTP starts.
 *
 * Push transaction load tests live in `@openl2/stress-testing` + k6 (`make stress-test`).
 * This file covers health + getBalance stress only.
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

const runHealthStress = process.env.RUN_LEDGER_HEALTH_STRESS === "1";
const runGetBalanceStress = process.env.RUN_LEDGER_GET_BALANCE_STRESS === "1";
const isStressRun = runHealthStress || runGetBalanceStress;

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
	process.exit(result.exitCode === null ? 1 : result.exitCode);
}


// Only re-exec / raise Bun's fetch cap for intentional stress runs.
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
	const statusCode =
		statusMatch === null ? null : (statusMatch[1] ?? null);
	if (statusCode !== null) {
		return `http_${statusCode}`;
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
	options: { attempts: number; delayMs: number } | null = null,
): Promise<T> {
	const attempts = options === null ? 8 : options.attempts;
	const delayMs = options === null ? 250 : options.delayMs;
	let lastError: unknown = null;
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
	fn: () => Promise<{ error_code: number; error_message: string | null } & T>,
	options: { ignoreErrorCodes: readonly number[] } | null = null,
): Promise<({ error_code: number; error_message: string | null } & T) | null> {
	const ignoreErrorCodes = new Set(
		options === null ? [] : options.ignoreErrorCodes,
	);
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


function clampPercent(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(100, Math.max(0, value));
}

/** Parse `1,2,3` env lists; empty/missing → defaults. */
function parsePositiveNumberList(
	raw: string | null,
	defaults: readonly number[],
): number[] {
	if (raw === null || raw.trim().length === 0) {
		return [...defaults];
	}
	const values = raw
		.split(",")
		.map((part) => Number(part.trim()))
		.filter((value) => Number.isFinite(value) && value > 0);
	return values.length > 0 ? values : [...defaults];
}

function parsePercentList(
	raw: string | null,
	defaults: readonly number[],
): number[] {
	if (raw === null || raw.trim().length === 0) {
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
	redisDiagnostics: Redis,
	sessionId: string,
	lines: readonly string[],
): Promise<void> {
	const raw = await redisDiagnostics.get(profilerSessionMetaKey(sessionId));
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
	await redisDiagnostics.set(
		profilerSessionMetaKey(sessionId),
		JSON.stringify(updated),
	);
}

async function resetStressLedgerState(
	redisTransaction: Redis,
	redisAddressBalance: Redis,
	redisDiagnostics: Redis,
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
		);
		await redisAddressBalance.del(ADDRESS_BALANCE_BLOOM_KEY);
		await redisDiagnostics.del(
			profilerInFlightKey("pushTransaction"),
			profilerInFlightKey(ProfilerApiName.GetBalance),
		);
		await clearAddressBalanceCache(redisAddressBalance);
		await resetAddressBalanceCacheStats(redisAddressBalance);
		process.env.SKIP_BLOOM_PG_REBUILD = "1";
		await ensureTransactionIdBloomFilter(db, redisTransaction);
		await ensureAddressBalanceBloomFilter(db, redisAddressBalance);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

function printGetBalanceBatchTable(
	batch: GetBalanceStressBatchResult,
): void {
	const headers = [
		"calls",
		"addresses",
		"cache%",
		"nonzero%",
		"mode",
		"success%",
		"reqs/s",
		"total addr/sec",
	] as const;
	const rows = batch.runs.map((run) => {
		const totalAddrsPerSec = Number(
			(
				run.requestsPerSecond * run.variables.addressCount
			).toFixed(2),
		);
		return [
			String(run.variables.callCount),
			String(run.variables.addressCount),
			String(run.variables.cachePct),
			String(run.variables.nonzeroPct),
			run.variables.addressMode,
			String(run.successRatePct),
			String(run.requestsPerSecond),
			String(totalAddrsPerSec),
		];
	});
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
	redisDiagnostics: Redis;
}): Promise<GetBalanceStressHistory> {
	const { historyFile, batch, visualizationUrl, redisDiagnostics } = options;
	const entry = GetBalanceStressHistoryEntry.fromBatch({
		batch,
		completedAtUnixMs: Date.now(),
		visualizationUrl,
	});
	await prependGetBalanceStressHistory(redisDiagnostics, entry.toSummary());
	if (!historyFile) {
		return GetBalanceStressHistory.empty().withEntry(entry);
	}
	const previous = await loadGetBalanceStressHistory(historyFile);
	const next = previous.withEntry(entry);
	await Bun.write(historyFile, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}

/**
 * Run the getBalance stress matrix (default 2×3×3×2 = 36 seeded cells +
 * empty missing-address worst case + populated missing-address cells).
 * Each cell gets its own profiler session; Explorer loads siblings via
 * `get_balance_batch_sessions` in the session description.
 */
async function runGetBalanceHttpStress(): Promise<void> {
	const callCounts = parsePositiveNumberList(
		process.env.STRESS_GET_BALANCE_CALL_COUNT ??
			process.env.STRESS_REQUEST_COUNT ??
			null,
		DEFAULT_GET_BALANCE_CALL_COUNTS,
	);
	const addressCounts = parsePositiveNumberList(
		process.env.STRESS_GET_BALANCE_ADDRESS_COUNT ?? null,
		DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	);
	const cachePcts = parsePercentList(
		process.env.STRESS_GET_BALANCE_CACHE_PCT ?? null,
		DEFAULT_GET_BALANCE_CACHE_PCTS,
	);
	const nonzeroPcts = parsePercentList(
		process.env.STRESS_GET_BALANCE_NONZERO_PCT ?? null,
		DEFAULT_GET_BALANCE_NONZERO_PCTS,
	);
	const includeMissingAddressWorstCase =
		process.env.STRESS_GET_BALANCE_INCLUDE_MISSING_ADDRESS_WORST_CASE !== "0";
	const missingAddressCallCountRaw =
		process.env.STRESS_GET_BALANCE_MISSING_ADDRESS_CALL_COUNT?.trim() ?? "";
	const missingAddressWorstCaseCallCount =
		missingAddressCallCountRaw.length > 0
			? Number(missingAddressCallCountRaw)
			: GET_BALANCE_MISSING_ADDRESS_WORST_CASE_CALL_COUNT;
	const includeMissingAddressPopulated =
		process.env.STRESS_GET_BALANCE_INCLUDE_MISSING_POPULATED !== "0";
	const missingPopulatedCallCountRaw =
		process.env.STRESS_GET_BALANCE_MISSING_POPULATED_CALL_COUNT?.trim() ?? "";
	const missingAddressPopulatedCallCount =
		missingPopulatedCallCountRaw.length > 0
			? Number(missingPopulatedCallCountRaw)
			: GET_BALANCE_MISSING_POPULATED_CALL_COUNT;
	const missingAddressPopulatedAddressCounts = parsePositiveNumberList(
		process.env.STRESS_GET_BALANCE_MISSING_POPULATED_ADDRESS_COUNT ?? null,
		DEFAULT_GET_BALANCE_MISSING_POPULATED_ADDRESS_COUNTS,
	);
	const missingPopulatedSeedCountRaw =
		process.env.STRESS_GET_BALANCE_MISSING_POPULATED_SEED_COUNT?.trim() ?? "";
	const missingAddressPopulatedSeedCount =
		missingPopulatedSeedCountRaw.length > 0
			? Number(missingPopulatedSeedCountRaw)
			: GET_BALANCE_MISSING_POPULATED_SEED_COUNT;
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	expect(Number.isFinite(concurrency) && concurrency > 0).toBe(true);
	expect(
		Number.isFinite(missingAddressWorstCaseCallCount) &&
			missingAddressWorstCaseCallCount > 0,
	).toBe(true);
	expect(
		Number.isFinite(missingAddressPopulatedCallCount) &&
			missingAddressPopulatedCallCount > 0,
	).toBe(true);
	expect(
		Number.isFinite(missingAddressPopulatedSeedCount) &&
			missingAddressPopulatedSeedCount > 0,
	).toBe(true);

	const matrix = buildGetBalanceStressMatrix({
		callCounts,
		addressCounts,
		cachePcts,
		nonzeroPcts,
		includeMissingAddressWorstCase,
		missingAddressWorstCaseCallCount,
		includeMissingAddressPopulated,
		missingAddressPopulatedCallCount,
		missingAddressPopulatedAddressCounts,
		missingAddressPopulatedSeedCount,
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
	const { redisDiagnostics, ownsConnection: ownsRedisDiagnostics } =
		createRedisDiagnosticsClient(commonConfig, redisTransaction);

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
			include_missing_address_worst_case: includeMissingAddressWorstCase,
			missing_address_worst_case_call_count: missingAddressWorstCaseCallCount,
			include_missing_address_populated: includeMissingAddressPopulated,
			missing_address_populated_call_count: missingAddressPopulatedCallCount,
			missing_address_populated_address_counts:
				missingAddressPopulatedAddressCounts,
			missing_address_populated_seed_count: missingAddressPopulatedSeedCount,
		});

		/** Reuse one populated ledger across consecutive MissingRandomPopulated cells. */
		let populatedLedgerReady = false;

		for (let index = 0; index < matrix.length; index += 1) {
			const variables = matrix[index]!;
			const sessionId = batchSessionIds[index]!;
			const isPopulated =
				variables.addressMode ===
				GetBalanceAddressMode.MissingRandomPopulated;
			const result = await runOneGetBalanceStressVariantWithSessionId({
				variables,
				batchId,
				batchSessionIds,
				sessionId,
				concurrency,
				redisTransaction,
				redisAddressBalance,
				redisDiagnostics,
				balanceCache,
				skipLedgerReset: isPopulated && populatedLedgerReady,
				seedBackgroundLedger: isPopulated && !populatedLedgerReady,
			});
			if (isPopulated) {
				populatedLedgerReady = true;
			} else {
				populatedLedgerReady = false;
			}
			runs.push(result);
			console.log(
				`getBalance matrix cell ${index + 1}/${matrix.length} ` +
					`mode=${variables.addressMode} ` +
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
			redisDiagnostics,
		});
		printGetBalanceHistoryTable(history);
	} finally {
		await resetStressLedgerState(
			redisTransaction,
			redisAddressBalance,
			redisDiagnostics,
		);
		await redisTransaction.quit();
		await redisAddressBalance.quit();
		if (ownsRedisDiagnostics) {
			await redisDiagnostics.quit();
		}
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
	redisDiagnostics: Redis;
	balanceCache: AddressBalanceCacheOptions;
	/** Skip wipe when reusing a populated ledger across consecutive cells. */
	skipLedgerReset?: boolean;
	/** Seed background known addresses/transactions for populated missing mode. */
	seedBackgroundLedger?: boolean;
}): Promise<GetBalanceStressResult> {
	const {
		variables,
		batchId,
		batchSessionIds,
		sessionId,
		concurrency,
		redisTransaction,
		redisAddressBalance,
		redisDiagnostics,
		balanceCache,
		skipLedgerReset = false,
		seedBackgroundLedger = false,
	} = options;
	const {
		callCount,
		addressCount,
		cachePct,
		nonzeroPct,
		addressMode,
		backgroundSeedCount,
	} = variables;
	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const testhelper = createLayer2TestHelperClient(testhelperUrl);
	const apiErrors = emptyApiErrorCounts();
	const latenciesMs: number[] = [];
	let accepted = 0;

	if (!skipLedgerReset) {
		await resetStressLedgerState(
			redisTransaction,
			redisAddressBalance,
			redisDiagnostics,
		);
	}

	try {
		const isMissingRandom =
			addressMode === GetBalanceAddressMode.MissingRandom ||
			addressMode === GetBalanceAddressMode.MissingRandomPopulated;
		const isMissingPopulated =
			addressMode === GetBalanceAddressMode.MissingRandomPopulated;

		/** Per-call address lists; missing modes use unique never-seeded keys. */
		let resolvePublicKeys: (callIndex: number) => string[];
		let poolSize = 0;

		if (isMissingPopulated && seedBackgroundLedger) {
			log.info("getBalance populated missing-address seed starting", {
				background_seed_count: backgroundSeedCount,
			});
			const backgroundAddresses = Array.from(
				{ length: backgroundSeedCount },
				() => newLayer2Address().public_key_str_base58,
			);
			await mapPool(
				backgroundAddresses,
				concurrency,
				async (address, index) => {
					try {
						unwrapLayer2TestHelperResponse(
							await testhelper.testhelper.seed.balance.post({
								address,
								balance: 1_000_000 + index,
								include_deposit_transaction: true,
							}),
						);
					} catch (error) {
						recordApiError(apiErrors, apiErrorReason(error));
					}
				},
			);
			// Keep seeded cache + bloom; only reset hit/miss counters for the wave.
			await resetAddressBalanceCacheStats(redisAddressBalance);
			log.info("getBalance populated missing-address seed finished", {
				background_seed_count: backgroundSeedCount,
			});
		}

		if (isMissingRandom) {
			const totalKeys = callCount * addressCount;
			const addresses = Array.from({ length: totalKeys }, () =>
				newLayer2Address().public_key_str_base58,
			);
			poolSize = addresses.length;
			if (!isMissingPopulated) {
				await clearAddressBalanceCache(redisAddressBalance);
				await resetAddressBalanceCacheStats(redisAddressBalance);
			}
			resolvePublicKeys = (callIndex: number): string[] =>
				addresses.slice(
					callIndex * addressCount,
					callIndex * addressCount + addressCount,
				);
		} else {
			poolSize = Math.max(addressCount * 4, addressCount, 64);
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

			resolvePublicKeys = (callIndex: number): string[] =>
				Array.from({ length: addressCount }, (_, offset) => {
					const index = (callIndex * addressCount + offset) % poolSize;
					const address = addresses[index];
					if (address === undefined) {
						throw new Error("address pool index out of range");
					}
					return address;
				});
		}

		const title = isMissingPopulated
			? `getBalance stress missing-address populated seed=${backgroundSeedCount} calls=${callCount} addrs_per_call=${addressCount}`
			: addressMode === GetBalanceAddressMode.MissingRandom
				? `getBalance stress missing-address worst-case calls=${callCount} addrs_per_call=${addressCount}`
				: `getBalance stress calls=${callCount} addrs=${addressCount} cache=${cachePct}% nonzero=${nonzeroPct}%`;
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
				const publicKeys = resolvePublicKeys(callIndex);
				const reqStarted = performance.now();
				const response = await callLedgerApi(apiErrors, async () => {
					const body = unwrapLayer2LedgerResponse(
						await ledger.explorer.get_balance.post({
							public_keys: publicKeys,
						}),
					);
					return {
						...body,
						error_message: body.error_message ?? null,
					};
				});
				if (response !== null && response.error_code === ErrorCodes.SUCCESS) {
					accepted += 1;
					latenciesMs.push(performance.now() - reqStarted);
				}
			},
		);
		const elapsedMs = Math.round(performance.now() - startedAt);
		const successRatePct = computeSuccessRatePct(accepted, callCount);
		warnIfLowSuccessRate(
			title,
			successRatePct,
			accepted,
			callCount,
		);

		await appendProfilerSessionDescription(redisDiagnostics, sessionId, [
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
		// Keep the populated background ledger for the next MissingRandomPopulated
		// cell; the outer matrix runner resets when the batch finishes.
		if (
			addressMode !== GetBalanceAddressMode.MissingRandomPopulated
		) {
			await resetStressLedgerState(
				redisTransaction,
				redisAddressBalance,
				redisDiagnostics,
			);
		}
	}
}


async function main(): Promise<void> {
	console.log(
		`stress runner BUN_CONFIG_MAX_HTTP_REQUESTS=${process.env.BUN_CONFIG_MAX_HTTP_REQUESTS} ` +
			`(target ${STRESS_BUN_MAX_HTTP_REQUESTS})`,
	);
	if (!isStressRun) {
		throw new Error(
			"No stress selected. Set RUN_LEDGER_HEALTH_STRESS=1 and/or RUN_LEDGER_GET_BALANCE_STRESS=1",
		);
	}
	if (runHealthStress) {
		await runHealthHttpStress();
	}
	if (runGetBalanceStress) {
		await runGetBalanceHttpStress();
	}
}

if (import.meta.main) {
	if (!isStressRun) {
		// Discovered by `bun test` without stress flags — do not fail the suite.
		console.log(
			"stress.ts: skipping (set RUN_LEDGER_HEALTH_STRESS=1 and/or RUN_LEDGER_GET_BALANCE_STRESS=1)",
		);
	} else {
		await main();
	}
}