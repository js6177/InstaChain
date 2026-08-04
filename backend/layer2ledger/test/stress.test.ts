import { describe, expect, it } from "bun:test";
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
import Redis from "ioredis";
import {
	clearAddressBalanceCache,
	getAddressBalanceCacheStats,
	getCachedAddressBalance,
	resetAddressBalanceCacheStats,
	resolveAddressBalanceCacheOptions,
	setCachedAddressBalances,
} from "../src/redis/address-balance-cache";
import {
	computeLatencyStats,
	emptyApiErrors,
	mapPool,
	newLayer2Address,
	recordApiError,
	sleep,
	type StressApiErrorCounts,
	type StressRoundThroughputResult,
	type StressRunResult,
	type StressThroughputResult,
} from "./common";

const runHttpStress = process.env.RUN_LEDGER_HTTP_STRESS === "1";

const log = createOpenL2Logger({
	serviceName: "layer2ledger-stress",
});

const ledgerApiUrl =
	process.env.LAYER2LEDGER_API_URL ?? "http://layer2ledgerapihandler-nginx:8000";
const testhelperUrl =
	process.env.TESTHELPER_BASE_URL ?? "http://layer2ledger-testhelper:8001";

function parseAddressOverlapPercent(): number {
	const raw = process.env.STRESS_ADDRESS_OVERLAP_PERCENT ?? "50";
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 0 || value > 100) {
		throw new Error(
			`STRESS_ADDRESS_OVERLAP_PERCENT must be an integer between 0 and 100, got "${raw}"`,
		);
	}
	return value;
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
	/** When set, the first N transfers reuse these source addresses (N = length). */
	reuseSources?: readonly Layer2Address[];
	/**
	 * After seeding, wipe the Redis balance cache so push reads miss and fall
	 * back to Postgres (cold round).
	 */
	clearBalanceCacheBeforePush?: boolean;
	/**
	 * After seeding, wipe the Redis balance cache and re-warm only
	 * `reuseSources`. Needed because testhelper seed also writes Redis, which
	 * would otherwise make the non-overlap half look like cache hits.
	 */
	warmOnlyReuseSources?: boolean;
	redis: Redis;
}

/**
 * Push `transactionCount` transfers through the live Elysia API, wait for the
 * running dbwriter to persist them, and return push client-RTT + phase timings.
 */
async function runPushTransactionStress(
	options: RunPushStressOptions,
): Promise<StressRunResult & { sources: Layer2Address[] }> {
	const {
		transactionCount,
		reuseSources = [],
		clearBalanceCacheBeforePush = false,
		warmOnlyReuseSources = false,
		redis,
	} = options;
	if (clearBalanceCacheBeforePush && warmOnlyReuseSources) {
		throw new Error(
			"clearBalanceCacheBeforePush and warmOnlyReuseSources are mutually exclusive",
		);
	}
	const balanceCache = resolveAddressBalanceCacheOptions(
		loadLayer2LedgerCommonConfig(process.env.ENVIRONMENT ?? "test").redis,
	);
	const amount = 100;
	const fee = 10;
	const initialBalance = 1000;
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "10");
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
	const reusedSourceKeys = new Set(
		reuseSources.map((address) => address.public_key_str_base58),
	);

	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const testhelper = createLayer2TestHelperClient(testhelperUrl);

	await waitForApiHealth(ledgerApiUrl, 60_000);

	const nodeInfo = unwrapLayer2LedgerResponse(
		await ledger.info.get_node_info.get(),
	);
	expect(nodeInfo.error_code).toBe(ErrorCodes.SUCCESS);
	const nodeId = nodeInfo.node_info.node_id;
	const assetId = nodeInfo.node_info.asset_id || NODE_ASSET_ID_HEX;

	log.info("checked health");
	const prepareStartedAt = performance.now();
	const unsigned = await mapPool(
		Array.from({ length: transactionCount }, (_, index) => index),
		concurrency,
		async (index) => {
			const source =
				index < reuseSources.length
					? (reuseSources[index] as Layer2Address)
					: newLayer2Address();
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
		// Reused round-1 sources keep residual balance + cache entry; skip re-seed.
		if (reusedSourceKeys.has(source.public_key_str_base58)) {
			return;
		}
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

	if (clearBalanceCacheBeforePush) {
		await clearAddressBalanceCache(redis);
		log.info("cleared balance cache before push (cold round)");
	} else if (warmOnlyReuseSources) {
		// Seed writes Redis for newly created sources; strip those so only the
		// overlap percent remains warm going into the push wave.
		const warmEntries: Array<{ address: string; balance: number }> = [];
		for (const source of reuseSources) {
			const balance = await getCachedAddressBalance(
				redis,
				source.public_key_str_base58,
			);
			if (balance !== null) {
				warmEntries.push({
					address: source.public_key_str_base58,
					balance,
				});
			}
		}
		await clearAddressBalanceCache(redis);
		await setCachedAddressBalances(redis, warmEntries, balanceCache);
		log.info(
			`warmed overlap-only balance cache entries=${warmEntries.length} ` +
				`of reused_sources=${reuseSources.length}`,
		);
	}

	await resetAddressBalanceCacheStats(redis);
	const pushLatenciesMs: number[] = [];
	const acceptedTransactionIds: string[] = [];
	const pushStartedAt = performance.now();
	await mapPool(
		prepared,
		concurrency,
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
	const pushMs = Math.round(performance.now() - pushStartedAt);
	log.info("pushed transactions");
	const acceptedPushes = acceptedTransactionIds.length;
	const cache = await getAddressBalanceCacheStats(redis);

	const pendingIds = new Set(acceptedTransactionIds);
	const deadline = Date.now() + settleTimeoutMs;

	const settleStartedAt = performance.now();
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
	const settleMs = Math.round(performance.now() - settleStartedAt);
	log.info("settled transactions");

	return {
		processedToPostgres: acceptedPushes - pendingIds.size,
		acceptedPushes,
		pushClientRttMs: computeLatencyStats(pushLatenciesMs),
		phaseTimingsMs: {
			prepareMs,
			signMs,
			seedMs,
			pushMs,
			settleMs,
			totalMs: prepareMs + signMs + seedMs + pushMs + settleMs,
		},
		apiErrors,
		cache,
		sources: prepared.map((item) => item.source),
	};
}

function toRoundResult(
	round: 1 | 2,
	transactionCount: number,
	run: StressRunResult,
	reusedSourceCount: number,
): StressRoundThroughputResult {
	const txsPerSecond = Number(
		((run.acceptedPushes / Math.max(run.phaseTimingsMs.pushMs, 1)) * 1000).toFixed(
			2,
		),
	);
	return {
		round,
		transactionCount,
		processedToPostgres: run.processedToPostgres,
		acceptedPushes: run.acceptedPushes,
		elapsedMs: run.phaseTimingsMs.pushMs,
		txsPerSecond,
		pushClientRttMs: run.pushClientRttMs,
		phaseTimingsMs: run.phaseTimingsMs,
		apiErrors: run.apiErrors,
		cache: run.cache,
		reusedSourceCount,
	};
}

function printRoundSummary(round: StressRoundThroughputResult): void {
	const line =
		`round=${round.round} push_ms=${round.phaseTimingsMs.pushMs} ` +
		`settle_ms=${round.phaseTimingsMs.settleMs} total_ms=${round.phaseTimingsMs.totalMs} ` +
		`txs_per_sec=${round.txsPerSecond} ` +
		`cache_hits=${round.cache.hits} cache_misses=${round.cache.misses} ` +
		`reused_sources=${round.reusedSourceCount}`;
	// Prefer console so the summary is easy to spot; structured fields go to the logger.
	console.log(line);
	log.info("stress round summary", {
		round: round.round,
		phase_timings_ms: round.phaseTimingsMs,
		txs_per_second: round.txsPerSecond,
		cache: round.cache,
		reused_source_count: round.reusedSourceCount,
	});
}

describe.skipIf(!runHttpStress)("pushTransaction HTTP stress", () => {
	it(
		"measures end-to-end throughput for a cold round then a warm overlap round",
		async () => {
			const transactionCount = Number(process.env.STRESS_TX_COUNT ?? "100");
			expect(Number.isFinite(transactionCount) && transactionCount > 0).toBe(
				true,
			);
			const addressOverlapPercent = parseAddressOverlapPercent();
			const reuseCount = Math.round(
				(transactionCount * addressOverlapPercent) / 100,
			);

			const commonConfig = loadLayer2LedgerCommonConfig(
				process.env.ENVIRONMENT ?? "test",
			);
			const redis = new Redis({
				host: commonConfig.redis.host,
				port: commonConfig.redis.port,
				maxRetriesPerRequest: null,
			});

			try {
				const round1Run = await runPushTransactionStress({
					transactionCount,
					clearBalanceCacheBeforePush: true,
					redis,
				});
				const round1 = toRoundResult(1, transactionCount, round1Run, 0);

				const reuseSources = round1Run.sources.slice(0, reuseCount);
				const round2Run = await runPushTransactionStress({
					transactionCount,
					reuseSources,
					warmOnlyReuseSources: true,
					redis,
				});
				const round2 = toRoundResult(
					2,
					transactionCount,
					round2Run,
					reuseSources.length,
				);

				const throughput: StressThroughputResult = {
					transactionCount,
					addressOverlapPercent,
					rounds: [round1, round2],
				};

				console.log(
					`stress two-round summary overlap_percent=${addressOverlapPercent} ` +
						`tx_count=${transactionCount} reused_sources=${reuseSources.length}`,
				);
				printRoundSummary(round1);
				printRoundSummary(round2);

				log.info("pushTransaction two-round stress complete", {
					address_overlap_percent: addressOverlapPercent,
					transaction_count: transactionCount,
					rounds: throughput.rounds,
				});

				const stressResultFile = process.env.STRESS_RESULT_FILE;
				if (stressResultFile) {
					await Bun.write(
						stressResultFile,
						`${JSON.stringify(throughput, null, 2)}\n`,
					);
				}

				expect(round1.processedToPostgres).toBe(round1.acceptedPushes);
				expect(round1.acceptedPushes).toBe(transactionCount);
				expect(round2.processedToPostgres).toBe(round2.acceptedPushes);
				expect(round2.acceptedPushes).toBe(transactionCount);
				expect(round2.reusedSourceCount).toBe(reuseCount);
			} finally {
				await redis.quit();
			}
		},
		{ timeout: 600_000 },
	);
});
