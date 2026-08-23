import {
	createLayer2LedgerClient,
	ErrorCodes,
	unwrapLayer2LedgerResponse,
} from "@openl2/api-layer2ledger";
import { createOpenL2Logger } from "@openl2/openl2-logger";
import {
	getAddressBalanceCacheStats,
	ProfilerApiName,
	ProfilerSessionReport,
	profilerSessionOutputPath,
	saveProfilerSessionReport,
} from "@openl2/layer2ledger/stress-support";
import {
	computeSuccessRatePct,
	emptyApiErrorCounts,
	LatencyStatsMs,
	RedisDiagPhase,
	STRESS_SUCCESS_RATE_WARNING_PCT,
	StressApiErrorCounts,
	StressApiErrors,
	StressCacheStats,
	StressPhaseTimingsMs,
	StressProfilerSessionSummary,
	StressThroughputResult,
} from "@openl2/stress-results";
import { loadLayer2LedgerCommonConfig } from "@openl2/config-loader";
import {
	mapPool,
	profilerSessionVisualizationUrl,
	sleep,
} from "../common";
import {
	BalanceCacheMode,
	createRedisClients,
	k6SummaryPath,
	ledgerApiUrl,
	type PushStressMeta,
	pushMetaPath,
	resetStressLedgerState,
} from "./prepare-push";
import {
	buildRedisStressDiagnostics,
	captureBothRedisSnapshots,
	loadBaselineSnapshots,
	printRedisDiagnostics,
	redisDiagnosticsPath,
} from "./redis-diagnostics";

const log = createOpenL2Logger({ serviceName: "openl2-stress-finalize" });

interface K6MetricValues {
	count: number | null;
	rate: number | null;
	avg: number | null;
	min: number | null;
	max: number | null;
	med: number | null;
	p90: number | null;
	p95: number | null;
	passes: number | null;
}

interface K6SummaryMetric {
	values: K6MetricValues | null;
}

interface K6Summary {
	metrics: Record<string, K6SummaryMetric>;
}

function asFiniteNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

function parseK6MetricValues(raw: unknown): K6MetricValues | null {
	if (raw === null || typeof raw !== "object") {
		return null;
	}
	const record = raw as Record<string, unknown>;
	return {
		count: asFiniteNumber(record.count),
		rate: asFiniteNumber(record.rate),
		avg: asFiniteNumber(record.avg),
		min: asFiniteNumber(record.min),
		max: asFiniteNumber(record.max),
		med: asFiniteNumber(record.med),
		p90: asFiniteNumber(record["p(90)"]),
		p95: asFiniteNumber(record["p(95)"]),
		passes: asFiniteNumber(record.passes),
	};
}

function parseK6Summary(raw: unknown): K6Summary {
	if (raw === null || typeof raw !== "object") {
		return { metrics: {} };
	}
	const root = raw as Record<string, unknown>;
	const metricsRaw = root.metrics;
	if (metricsRaw === null || typeof metricsRaw !== "object") {
		return { metrics: {} };
	}
	const metrics: Record<string, K6SummaryMetric> = {};
	for (const [name, metricRaw] of Object.entries(
		metricsRaw as Record<string, unknown>,
	)) {
		if (metricRaw === null || typeof metricRaw !== "object") {
			metrics[name] = { values: null };
			continue;
		}
		const metricRecord = metricRaw as Record<string, unknown>;
		metrics[name] = {
			values: parseK6MetricValues(metricRecord.values ?? null),
		};
	}
	return { metrics };
}

function getMetricValues(
	summary: K6Summary,
	metricName: string,
): K6MetricValues | null {
	const metric = summary.metrics[metricName] ?? null;
	if (metric === null) {
		return null;
	}
	return metric.values;
}

function warnIfLowSuccessRate(
	label: string,
	successRatePct: number,
	accepted: number,
	attempted: number,
): void {
	if (successRatePct >= STRESS_SUCCESS_RATE_WARNING_PCT) {
		return;
	}
	console.warn(
		`WARNING low success rate ${label}: ${successRatePct.toFixed(2)}% ` +
			`(${accepted}/${attempted})`,
	);
}

async function persistProfilerSessionReport(
	report: ProfilerSessionReport,
): Promise<StressProfilerSessionSummary> {
	const outputDir =
		process.env.PROFILER_SESSION_OUTPUT_DIR ??
		(process.env.STRESS_RESULT_FILE
			? process.env.STRESS_RESULT_FILE.replace(/\/[^/]+$/, "")
			: "/stress-data");
	const outputFile = profilerSessionOutputPath(report.session_id, outputDir);
	const reportForFile = report.withOutputFile(outputFile);
	await Bun.write(outputFile, `${JSON.stringify(reportForFile, null, 2)}\n`);
	const visualizationUrl = profilerSessionVisualizationUrl(report.session_id);
	console.log(
		`profiler session report written path=${outputFile} title=${report.title}`,
	);
	console.log("profiler session visualization:");
	console.log(visualizationUrl);

	const pushStats =
		reportForFile.api_stats.find(
			(stats) => stats.api === ProfilerApiName.PushTransaction,
		) ?? null;
	const pushMs =
		pushStats !== null &&
		pushStats.first_start_unix_ms !== null &&
		pushStats.last_end_unix_ms !== null
			? Math.max(pushStats.last_end_unix_ms - pushStats.first_start_unix_ms, 0)
			: 0;
	const dbwriter = reportForFile.dbwriter;
	const pushToSettleMs =
		dbwriter !== null &&
		dbwriter.throughput_start_ms !== null &&
		dbwriter.throughput_end_ms !== null
			? Math.max(
					dbwriter.throughput_end_ms - dbwriter.throughput_start_ms,
					0,
				)
			: pushMs;
	return new StressProfilerSessionSummary({
		sessionId: reportForFile.session_id,
		outputFile,
		pushTxsPerSecond: pushStats !== null ? pushStats.throughput_per_sec : 0,
		settledTxsPerSecond:
			dbwriter !== null ? (dbwriter.throughput_per_sec ?? 0) : 0,
		pushPeakConcurrent: pushStats !== null ? pushStats.peak_concurrent : 0,
		pushAvgLatencyMs:
			pushStats !== null ? (pushStats.avg_latency_ms ?? 0) : 0,
		pushCount: pushStats !== null ? pushStats.count : 0,
		dbwriterWritesTotal: dbwriter !== null ? dbwriter.writes_total : 0,
		pushMs,
		pushToSettleMs,
		settleMs: Math.max(pushToSettleMs - pushMs, 0),
	});
}

function clientRttFromK6(summary: K6Summary): LatencyStatsMs {
	const duration = getMetricValues(summary, "http_req_duration");
	if (duration === null) {
		return new LatencyStatsMs({
			average: 0,
			shortest: 0,
			longest: 0,
			bottomQuartile: 0,
			upperQuartile: 0,
		});
	}
	return new LatencyStatsMs({
		average: duration.avg ?? 0,
		shortest: duration.min ?? 0,
		longest: duration.max ?? 0,
		bottomQuartile: duration.med ?? duration.avg ?? 0,
		upperQuartile: duration.p95 ?? duration.p90 ?? duration.max ?? 0,
	});
}

function acceptedFromK6(summary: K6Summary, fallback: number): number {
	const accepted = getMetricValues(summary, "push_accepted");
	if (accepted !== null && accepted.count !== null) {
		return Math.floor(accepted.count);
	}
	return fallback;
}

function pushErrorsFromK6(
	summary: K6Summary,
	attempted: number,
	accepted: number,
): StressApiErrorCounts {
	const errors = emptyApiErrorCounts();
	const failed = Math.max(attempted - accepted, 0);
	if (failed > 0) {
		errors.total = failed;
		errors.byReason.k6_push_failed = failed;
	}
	const httpFailed = getMetricValues(summary, "http_req_failed");
	if (httpFailed !== null && httpFailed.passes !== null && httpFailed.passes > 0) {
		errors.byReason.http_req_failed = Math.floor(httpFailed.passes);
	}
	return errors;
}

function stressResultFileForMode(mode: BalanceCacheMode): string | null {
	const base = process.env.STRESS_RESULT_FILE ?? null;
	if (base === null) {
		return null;
	}
	if (mode === BalanceCacheMode.Cold) {
		return base;
	}
	return base.replace(/(\.json)?$/i, ".warm-cache.json");
}

function printThroughputSummary(
	title: string,
	result: StressThroughputResult,
): void {
	const visualizationUrl = profilerSessionVisualizationUrl(
		result.profilerSessionId,
	);
	const successRatePct = computeSuccessRatePct(
		result.acceptedPushes,
		result.transactionCount,
	);
	const settleSuccessRatePct = computeSuccessRatePct(
		result.processedToPostgres,
		Math.max(result.acceptedPushes, 1),
	);
	console.log(
		`title=${title} ` +
			`profiler_session=${result.profilerSessionId} ` +
			`push_ms=${result.phaseTimingsMs.pushMs} ` +
			`settle_ms=${result.phaseTimingsMs.settleMs} ` +
			`push_to_settle_ms=${result.phaseTimingsMs.pushToSettleMs} ` +
			`total_ms=${result.phaseTimingsMs.totalMs} ` +
			`push_txs_per_sec=${result.pushTxsPerSecond} ` +
			`settled_txs_per_sec=${result.settledTxsPerSecond} ` +
			`push_success_rate_pct=${successRatePct.toFixed(2)} ` +
			`settle_success_rate_pct=${settleSuccessRatePct.toFixed(2)} ` +
			`cache_hits=${result.cache.hits} cache_misses=${result.cache.misses}`,
	);
	console.log(visualizationUrl);
	if (result.redis !== null) {
		printRedisDiagnostics(result.redis);
	}
	log.info("stress throughput summary", {
		title,
		profiler_session_id: result.profilerSessionId,
		visualization_url: visualizationUrl,
		push_txs_per_second: result.pushTxsPerSecond,
		settled_txs_per_second: result.settledTxsPerSecond,
		push_success_rate_pct: successRatePct,
		settle_success_rate_pct: settleSuccessRatePct,
		cache: result.cache,
		redis_findings: result.redis?.interpretation ?? null,
	});
}

/**
 * After k6 finishes: settle accepted txs, stop profiler, write throughput JSON,
 * print visualization URL + success/throughput rates.
 */
export async function finalizePushStress(
	mode: BalanceCacheMode,
): Promise<{ title: string; sessionId: string; url: string }> {
	const metaPath = pushMetaPath();
	const meta = (await Bun.file(metaPath).json()) as PushStressMeta;
	if (meta.mode !== mode) {
		throw new Error(
			`push-meta mode=${meta.mode} does not match finalize mode=${mode}`,
		);
	}

	const summaryPath = k6SummaryPath();
	if (!(await Bun.file(summaryPath).exists())) {
		throw new Error(`Missing k6 summary at ${summaryPath}`);
	}
	const k6Summary = parseK6Summary(await Bun.file(summaryPath).json());

	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "2000");
	const settleConcurrencyRaw = Number(
		process.env.STRESS_SETTLE_CONCURRENCY ?? "",
	);
	const settleConcurrency =
		Number.isFinite(settleConcurrencyRaw) && settleConcurrencyRaw > 0
			? settleConcurrencyRaw
			: concurrency;
	const settleTimeoutMs = Number(
		process.env.STRESS_SETTLE_TIMEOUT_MS ?? "600000",
	);

	const acceptedPushes = acceptedFromK6(k6Summary, meta.transaction_count);
	const pushErrors = pushErrorsFromK6(
		k6Summary,
		meta.transaction_count,
		acceptedPushes,
	);
	const apiErrors = new StressApiErrors({
		push: pushErrors,
		seed:
			StressApiErrorCounts.parse(meta.seed_errors) ?? emptyApiErrorCounts(),
	});

	const { redisTransaction, redisAddressBalance } = await createRedisClients();
	try {
		const redisEndpoints = loadLayer2LedgerCommonConfig();
		// Capture immediately after k6 so CLIENT LIST / ops/sec still reflect load.
		const afterLoad = await captureBothRedisSnapshots({
			redisTransaction,
			redisAddressBalance,
			transactionsHost: redisEndpoints.redis_transactions.host,
			transactionsPort: redisEndpoints.redis_transactions.port,
			addressBalanceHost: redisEndpoints.redis_addressbalance.host,
			addressBalancePort: redisEndpoints.redis_addressbalance.port,
			phase: RedisDiagPhase.After,
		});

		const ledger = createLayer2LedgerClient(ledgerApiUrl());
		const pendingIds = new Set(meta.transaction_ids);
		const deadline = Date.now() + settleTimeoutMs;
		while (pendingIds.size > 0 && Date.now() < deadline) {
			const stillPending = [...pendingIds];
			await mapPool(stillPending, settleConcurrency, async (transactionId) => {
				try {
					const response = unwrapLayer2LedgerResponse(
						await ledger.explorer.get_transaction.post({
							layer2_transaction_id: transactionId,
						}),
					);
					if (response.error_code === ErrorCodes.SUCCESS) {
						pendingIds.delete(transactionId);
					}
				} catch {
					// Not found / transient — retry until timeout.
				}
			});
			if (pendingIds.size > 0) {
				await sleep(500);
			}
		}
		log.info("settled transactions", {
			remaining: pendingIds.size,
			accepted_pushes: acceptedPushes,
		});

		const cache = await getAddressBalanceCacheStats(redisAddressBalance);
		const stopSession = unwrapLayer2LedgerResponse(
			await ledger.health.stop_profiler_session.post({
				session_id: meta.session_id,
			}),
		);
		if (
			stopSession.error_code !== ErrorCodes.SUCCESS ||
			stopSession.session == null
		) {
			throw new Error(
				`stop_profiler_session failed: ${stopSession.error_code}`,
			);
		}
		const parsed = ProfilerSessionReport.parse(stopSession.session ?? null);
		if (parsed === null) {
			throw new Error("stop_profiler_session returned an invalid session report");
		}
		const profilerSession = await persistProfilerSessionReport(parsed);

		const settledCount = meta.transaction_ids.length - pendingIds.size;

		const baseline = await loadBaselineSnapshots(mode);
		const redisReport = await buildRedisStressDiagnostics({
			mode,
			baseline,
			after: afterLoad,
		});
		const redisReportPath = redisDiagnosticsPath(mode);
		await Bun.write(
			redisReportPath,
			`${JSON.stringify(redisReport, null, 2)}\n`,
		);

		// Attach Redis diagnostics onto the profiler session so /explorer/stats shows them.
		const reportWithRedis = parsed
			.withOutputFile(profilerSession.outputFile)
			.withRedis(redisReport);
		await saveProfilerSessionReport(redisTransaction, reportWithRedis);
		if (profilerSession.outputFile !== null) {
			await Bun.write(
				profilerSession.outputFile,
				`${JSON.stringify(reportWithRedis, null, 2)}\n`,
			);
		}

		const result = new StressThroughputResult({
			transactionCount: meta.transaction_count,
			processedToPostgres: settledCount,
			acceptedPushes: Math.max(acceptedPushes, settledCount),
			elapsedMs: profilerSession.pushMs,
			pushTxsPerSecond: profilerSession.pushTxsPerSecond,
			settledTxsPerSecond: profilerSession.settledTxsPerSecond,
			txsPerSecond: profilerSession.pushTxsPerSecond,
			profilerSessionId: profilerSession.sessionId,
			pushClientRttMs: clientRttFromK6(k6Summary),
			phaseTimingsMs: new StressPhaseTimingsMs({
				prepareMs: meta.prepare_ms,
				signMs: meta.sign_ms,
				seedMs: meta.seed_ms,
				pushMs: profilerSession.pushMs,
				settleMs: profilerSession.settleMs,
				pushToSettleMs: profilerSession.pushToSettleMs,
				totalMs:
					meta.prepare_ms +
					meta.sign_ms +
					meta.seed_ms +
					profilerSession.pushToSettleMs,
			}),
			apiErrors,
			cache: new StressCacheStats(cache),
			redis: redisReport,
		});

		const pushSuccessRatePct = computeSuccessRatePct(
			result.acceptedPushes,
			result.transactionCount,
		);
		const settleSuccessRatePct = computeSuccessRatePct(
			result.processedToPostgres,
			Math.max(result.acceptedPushes, 1),
		);
		warnIfLowSuccessRate(
			`pushTransaction ${mode}-cache push`,
			pushSuccessRatePct,
			result.acceptedPushes,
			result.transactionCount,
		);
		warnIfLowSuccessRate(
			`pushTransaction ${mode}-cache settle`,
			settleSuccessRatePct,
			result.processedToPostgres,
			result.acceptedPushes,
		);

		console.log(
			`stress ${mode}-cache summary title=${meta.title} tx_count=${meta.transaction_count} vus=${meta.vus}`,
		);
		printThroughputSummary(meta.title, result);

		const stressResultFile = stressResultFileForMode(mode);
		if (stressResultFile !== null) {
			await Bun.write(
				stressResultFile,
				`${JSON.stringify(result, null, 2)}\n`,
			);
		}

		await resetStressLedgerState(redisTransaction, redisAddressBalance);

		return {
			title: meta.title,
			sessionId: result.profilerSessionId,
			url: profilerSessionVisualizationUrl(result.profilerSessionId),
		};
	} finally {
		await redisTransaction.quit();
		await redisAddressBalance.quit();
	}
}
