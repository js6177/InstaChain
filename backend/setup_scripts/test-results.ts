import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DockerService, type DockerServiceName } from "@openl2/config-loader";
import {
	StressThroughputResult,
	VerifyTimingResult,
} from "@openl2/stress-results";
import { log } from "./src/logger";

/** Container path where dated host output is mounted. */
export const TEST_OUTPUT_MOUNT = "/test-output";

/** Written by layer2ledger stress.test.ts; summarized at end of run-tests. */
export const STRESS_THROUGHPUT_FILENAME = "test-layer2ledger-stress.throughput.json";

/** Written by layer2ledger verify-timing.test.ts; summarized at end of run-tests. */
export const VERIFY_TIMING_FILENAME = "test-layer2ledger.verify-timing.json";

export {
	LatencyStatsMs,
	StressApiErrorCounts,
	StressApiErrors,
	StressCacheStats,
	StressPhaseTimingsMs,
	StressProfilerSessionSummary,
	StressRoundThroughputResult,
	StressThroughputResult,
	VerifyTimingResult,
} from "@openl2/stress-results";

export interface ServiceTestCounts {
	service: DockerServiceName;
	/** Exit status of the compose run. */
	containerPassed: boolean;
	/** True when a JUnit (or synthetic) result file was written. */
	hasReport: boolean;
	tests: number;
	passed: number;
	failed: number;
	errors: number;
	skipped: number;
}

export enum TestRunnerKind {
	BUN = "bun",
	VITEST = "vitest",
	SYNTHETIC = "synthetic",
}

export interface ServiceTestCommand {
	kind: TestRunnerKind;
	/** Extra args after `docker compose run … SERVICE`. Empty = image CMD. */
	command: string[];
}

/** Format a run folder name as yyyy-mm-dd-HH-mm (local 24-hour clock). */
export function formatTestOutputRunId(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}-${hour}-${minute}`;
}

export function createTestOutputDir(repoRoot: string, runId: string): string {
	const outputDir = join(repoRoot, ".test-output", runId);
	mkdirSync(outputDir, { recursive: true });
	return outputDir;
}

export function containerResultPath(service: DockerServiceName): string {
	return `${TEST_OUTPUT_MOUNT}/${service}`;
}

export function hostResultPath(
	outputDir: string,
	service: DockerServiceName,
): string {
	return join(outputDir, service);
}

/**
 * Command override so reporters write JUnit XML to `/test-output/{service}`.
 * Synthetic services keep the image CMD; the host writes a minimal JUnit file after.
 */
export function getServiceTestCommand(
	service: DockerServiceName,
): ServiceTestCommand {
	const outfile = containerResultPath(service);

	switch (service) {
		case DockerService.TEST_LAYER2LEDGER:
		case DockerService.TEST_LAYER2BRIDGE:
			return {
				kind: TestRunnerKind.BUN,
				command: [
					"bun",
					"test",
					"--reporter=junit",
					`--reporter-outfile=${outfile}`,
				],
			};
		case DockerService.TEST_LAYER2LEDGER_STRESS:
			// Plain `bun` (not `bun test`): stress.test.ts raises
			// BUN_CONFIG_MAX_HTTP_REQUESTS via re-exec. Exit code → synthetic JUnit.
			return {
				kind: TestRunnerKind.SYNTHETIC,
				command: ["bun", "test/stress.test.ts"],
			};
		case DockerService.TEST_BITCOIN_CORE_RPC:
			// Entrypoint writes JUnit when TEST_RESULT_FILE is set.
			return { kind: TestRunnerKind.BUN, command: [] };
		case DockerService.TEST_WALLET_WEB:
			return {
				kind: TestRunnerKind.VITEST,
				command: [
					"bun",
					"run",
					"test",
					"--",
					"run",
					"--reporter=default",
					"--reporter=junit",
					`--outputFile=${outfile}`,
				],
			};
		case DockerService.TEST_LAYER2LEDGER_OAUTH_MANAGER:
		case DockerService.TEST_LAYER2LEDGER_SEED:
			return { kind: TestRunnerKind.SYNTHETIC, command: [] };
		default:
			return { kind: TestRunnerKind.SYNTHETIC, command: [] };
	}
}

/**
 * Minimal JUnit for services that are not bun/vitest (oauth health curl, seed script).
 * bun:test / vitest already write their own reports into the mounted `.test-output` dir;
 */
export function writeSyntheticJunit(
	filePath: string,
	service: DockerServiceName,
	passed: boolean,
	caseName: string,
): void {
	const failures = passed ? 0 : 1;
	const failureXml = passed
		? ""
		: `\n      <failure message="${escapeXml(`${service} failed`)}" type="Error">${escapeXml(
				`${service} exited with a non-zero status`,
			)}</failure>`;

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${escapeXml(service)}" tests="1" failures="${failures}" errors="0" skipped="0" time="0">
  <testsuite name="${escapeXml(service)}" tests="1" failures="${failures}" errors="0" skipped="0" time="0">
    <testcase name="${escapeXml(caseName)}" classname="${escapeXml(service)}" time="0">${failureXml}
    </testcase>
  </testsuite>
</testsuites>
`;
	writeFileSync(filePath, xml, "utf8");
}

export function ensureServiceResultFile(
	outputDir: string,
	service: DockerServiceName,
	containerPassed: boolean,
	kind: TestRunnerKind,
): void {
	if (kind !== TestRunnerKind.SYNTHETIC) {
		return;
	}

	const filePath = hostResultPath(outputDir, service);
	if (existsSync(filePath)) {
		return;
	}

	const caseName =
		service === DockerService.TEST_LAYER2LEDGER_OAUTH_MANAGER
			? "health"
			: service === DockerService.TEST_LAYER2LEDGER_STRESS
				? "stress"
				: "seed";
	writeSyntheticJunit(filePath, service, containerPassed, caseName);
}

export function parseJunitCounts(
	service: DockerServiceName,
	filePath: string,
	containerPassed: boolean,
): ServiceTestCounts {
	if (!existsSync(filePath)) {
		return {
			service,
			containerPassed,
			hasReport: false,
			tests: 0,
			passed: 0,
			failed: containerPassed ? 0 : 1,
			errors: 0,
			skipped: 0,
		};
	}

	const xml = readFileSync(filePath, "utf8");
	const suites = [...xml.matchAll(/<testsuite\b([^>]*)>/g)];
	if (suites.length === 0) {
		const root = xml.match(/<testsuites\b([^>]*)>/);
		if (root) {
			return countsFromAttributes(
				service,
				root[1] ?? "",
				containerPassed,
				true,
			);
		}
		return {
			service,
			containerPassed,
			hasReport: true,
			tests: 0,
			passed: 0,
			failed: containerPassed ? 0 : 1,
			errors: 0,
			skipped: 0,
		};
	}

	let tests = 0;
	let failures = 0;
	let errors = 0;
	let skipped = 0;
	for (const match of suites) {
		const attrs = match[1] ?? "";
		tests += readIntAttr(attrs, "tests");
		failures += readIntAttr(attrs, "failures");
		errors += readIntAttr(attrs, "errors");
		skipped += readIntAttr(attrs, "skipped");
	}

	const failed = failures + errors;
	const passed = Math.max(0, tests - failed - skipped);
	return {
		service,
		containerPassed,
		hasReport: true,
		tests,
		passed,
		failed,
		errors,
		skipped,
	};
}

function countsFromAttributes(
	service: DockerServiceName,
	attrs: string,
	containerPassed: boolean,
	hasReport: boolean,
): ServiceTestCounts {
	const tests = readIntAttr(attrs, "tests");
	const failures = readIntAttr(attrs, "failures");
	const errors = readIntAttr(attrs, "errors");
	const skipped = readIntAttr(attrs, "skipped");
	const failed = failures + errors;
	return {
		service,
		containerPassed,
		hasReport,
		tests,
		passed: Math.max(0, tests - failed - skipped),
		failed,
		errors,
		skipped,
	};
}

function readIntAttr(attrs: string, name: string): number {
	const match = attrs.match(new RegExp(`\\b${name}="(\\d+)"`));
	return match ? Number(match[1]) : 0;
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function printTestResultsSummary(
	outputDir: string,
	results: readonly ServiceTestCounts[],
	repoRoot?: string,
): void {
	const relativeHint = repoRoot ? relative(repoRoot, outputDir) : outputDir;

	log.info(`Test reports (JUnit XML): ${relativeHint}`);
	log.info("Per-service summary:");

	let totalTests = 0;
	let totalPassed = 0;
	let totalFailed = 0;
	let totalSkipped = 0;

	for (const result of results) {
		totalTests += result.tests;
		totalPassed += result.passed;
		totalFailed += result.failed;
		totalSkipped += result.skipped;

		const status =
			result.containerPassed && result.failed === 0 ? "PASSED" : "FAILED";
		const skippedPart = result.skipped > 0 ? `, ${result.skipped} skipped` : "";
		log.info(
			`${result.service}: ${status} — ${result.passed} passed, ${result.failed} failed, ${result.tests} ran${skippedPart}`,
		);
	}

	log.info(
		`Totals: ${totalPassed} passed, ${totalFailed} failed, ${totalTests} ran` +
			(totalSkipped > 0 ? `, ${totalSkipped} skipped` : ""),
	);

	printStressThroughputSummary(outputDir);
	printVerifyTimingSummary(outputDir);
}

export function readStressThroughputResult(
	outputDir: string,
): StressThroughputResult | null {
	const filePath = join(outputDir, STRESS_THROUGHPUT_FILENAME);
	if (!existsSync(filePath)) {
		return null;
	}

	try {
		return StressThroughputResult.fromJsonText(readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

export function printStressThroughputSummary(outputDir: string): void {
	const result = readStressThroughputResult(outputDir);
	if (!result) {
		return;
	}

	for (const round of result.rounds) {
		const phases = round.phaseTimingsMs;
		log.info(
			`pushTransaction stress round=${round.round} ` +
				`push_txs_per_sec=${round.pushTxsPerSecond} ` +
				`settled_txs_per_sec=${round.settledTxsPerSecond} ` +
				`(accepted ${round.acceptedPushes}/${round.transactionCount}, ` +
				`settled ${round.processedToPostgres}/${round.transactionCount}, ` +
				`push_ms=${phases.pushMs}, ` +
				`push_to_settle_ms=${phases.pushToSettleMs})`,
			{
				round: round.round,
				push_txs_per_second: round.pushTxsPerSecond,
				settled_txs_per_second: round.settledTxsPerSecond,
				accepted_pushes: round.acceptedPushes,
				processed_to_postgres: round.processedToPostgres,
				phase_timings_ms: phases,
				cache: round.cache,
				reused_source_count: round.reusedSourceCount,
				profiler_session_id: round.profilerSessionId,
			},
		);
	}
}

export function readVerifyTimingResult(
	outputDir: string,
): VerifyTimingResult | null {
	const filePath = join(outputDir, VERIFY_TIMING_FILENAME);
	if (!existsSync(filePath)) {
		return null;
	}

	try {
		return VerifyTimingResult.fromJsonText(readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

export function printVerifyTimingSummary(outputDir: string): void {
	const result = readVerifyTimingResult(outputDir);
	if (!result) {
		return;
	}

	log.info(
		`openl2 message verification timing: ${result.verifiesPerSecond} verifies/s ` +
			`(messages=${result.messageCount}, ` +
			`avg_sign_ms=${result.signLatencyMs.average}, ` +
			`avg_verify_ms=${result.verifyLatencyMs.average})`,
		{
			message_count: result.messageCount,
			sign_latency_ms: result.signLatencyMs,
			verify_latency_ms: result.verifyLatencyMs,
			verifies_per_second: result.verifiesPerSecond,
		},
	);
}
