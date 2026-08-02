#!/usr/bin/env bun
/**
 * Run backend and frontend tests inside Docker containers.
 *
 * - Starts infrastructure with ENVIRONMENT=test
 * - Runs layer2ledger unit tests before apihandler/dbwriter (avoids DB/Redis lock contention)
 * - Starts application services, then runs integration test containers (including wallet vitest)
 * - Leaves a running healthy bitcoin-core container untouched
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	DOCKER_APP_SERVICES,
	DOCKER_INFRA_SERVICES,
	DOCKER_INTEGRATION_TEST_SERVICES,
	DOCKER_TEST_COMPOSE_FILES,
	DOCKER_TEST_PROFILE_BACKGROUND_SERVICES,
	DOCKER_TEST_SERVICES,
	DOCKER_UNIT_TEST_SERVICES,
	DockerComposeProfile,
	DockerService,
	type DockerServiceName,
	Environment,
	getProjectRoot,
	requireBun,
} from "@openl2/config-loader";
import { log } from "./src/logger";
import {
	containerResultPath,
	createTestOutputDir,
	ensureServiceResultFile,
	formatTestOutputRunId,
	getServiceTestCommand,
	parseJunitCounts,
	printTestResultsSummary,
	type ServiceTestCounts,
	STRESS_THROUGHPUT_FILENAME,
	TEST_OUTPUT_MOUNT,
} from "./test-results";

const ROOT = getProjectRoot(import.meta.dir);

const CONFIG_MARKER = join(
	ROOT,
	".config/test/layer2ledger-common-config.json",
);
const ENV_TEST = join(ROOT, "backend/layer2ledger/.env.test");

function loadEnvFile(path: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const line of readFileSync(path, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
			continue;
		}
		const separatorIndex = trimmed.indexOf("=");
		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		values[key] = value;
	}
	return values;
}

interface InspectState {
	Status?: string;
	Health?: { Status?: string };
}

class DockerComposeTestRunner {
	private readonly env: Record<string, string>;
	private readonly compose: string[];
	private readonly bunPath: string;

	constructor(private readonly root: string) {
		this.bunPath = requireBun();
		this.env = { ...process.env, ENVIRONMENT: Environment.TEST } as Record<
			string,
			string
		>;
		this.compose = ["docker", "compose", "--progress", "quiet"];
		for (const composeFile of DOCKER_TEST_COMPOSE_FILES) {
			this.compose.push("-f", composeFile);
		}
	}

	private async run(
		args: string[],
		options?: { check?: boolean; captureOutput?: boolean },
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const check = options?.check ?? true;
		const captureOutput = options?.captureOutput ?? false;
		const command = [...this.compose, ...args];

		const proc = Bun.spawn(command, {
			cwd: this.root,
			env: this.env,
			stdout: captureOutput ? "pipe" : "inherit",
			stderr: captureOutput ? "pipe" : "inherit",
		});

		const stdout = captureOutput ? await new Response(proc.stdout).text() : "";
		const stderr = captureOutput ? await new Response(proc.stderr).text() : "";
		const exitCode = await proc.exited;

		if (check && exitCode !== 0) {
			throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
		}

		return { exitCode, stdout, stderr };
	}

	private async runQuiet(args: string[]): Promise<boolean> {
		const result = await this.run(args, { check: false });
		return result.exitCode === 0;
	}

	private async runSetupScripts(...scriptArgs: string[]): Promise<void> {
		const setupDir = join(this.root, "backend/setup_scripts");
		const env = {
			...this.env,
			OPENL2_CONFIG_PATH: join(this.root, ".config"),
		};

		const proc = Bun.spawn(
			[this.bunPath, "run", "src/main.ts", ...scriptArgs],
			{
				cwd: setupDir,
				env,
				stdout: "inherit",
				stderr: "inherit",
			},
		);
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			throw new Error(`Setup scripts failed with exit code ${exitCode}`);
		}
	}

	private async ensureTestConfig(): Promise<void> {
		if (existsSync(CONFIG_MARKER)) {
			log.info(`Test config found at ${CONFIG_MARKER.slice(this.root.length + 1)}`);
			return;
		}

		log.info("Generating test config (.config/test/)...");
		await this.runSetupScripts(
			"-env",
			Environment.TEST,
			"-containered",
			"true",
			"-generate-keys",
			"-generate-oauth-config",
		);
	}

	private async ensureTestPostgresDatabase(): Promise<void> {
		const dbName = loadEnvFile(ENV_TEST).POSTGRES_DB;
		if (!dbName) {
			throw new Error(`POSTGRES_DB missing from ${ENV_TEST}`);
		}
		log.info(`Ensuring PostgreSQL database exists: ${dbName}`);

		const result = await this.run(
			[
				"exec",
				"-T",
				DockerService.LAYER2LEDGER_POSTGRES,
				"psql",
				"-U",
				"postgres",
				"-tc",
				`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
			],
			{ check: true, captureOutput: true },
		);

		if (result.stdout.includes("1")) {
			log.info(`PostgreSQL database ${dbName} already exists`);
			return;
		}

		await this.run(
			[
				"exec",
				"-T",
				DockerService.LAYER2LEDGER_POSTGRES,
				"psql",
				"-U",
				"postgres",
				"-c",
				`CREATE DATABASE ${dbName};`,
			],
			{ check: true },
		);
		log.info(`Created PostgreSQL database ${dbName}`);
	}

	private async containerId(service: DockerServiceName): Promise<string> {
		const result = await this.run(["ps", "-q", service], {
			check: false,
			captureOutput: true,
		});
		return result.stdout.trim();
	}

	private async containerHealth(containerId: string): Promise<string> {
		if (!containerId) {
			return "missing";
		}

		const proc = Bun.spawn(["docker", "inspect", containerId], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return "unknown";
		}

		const inspected = JSON.parse(stdout) as Array<{ State: InspectState }>;
		const state = inspected[0]?.State;
		if (!state) {
			return "unknown";
		}
		if (state.Health?.Status) {
			return state.Health.Status;
		}
		return state.Status ?? "unknown";
	}

	private async waitForHealthy(
		service: DockerServiceName,
		timeoutSec = 180,
	): Promise<void> {
		let waited = 0;
		while (waited < timeoutSec) {
			const health = await this.containerHealth(
				await this.containerId(service),
			);
			if (health === "healthy") {
				log.info(`${service} is healthy`);
				return;
			}
			await Bun.sleep(2000);
			waited += 2;
		}

		log.error(`timed out waiting for ${service} to become healthy`);
		await this.run(["ps"], { check: false });
		throw new Error(`Timed out waiting for ${service}`);
	}

	private async ensureBitcoinCore(): Promise<void> {
		const id = await this.containerId(DockerService.BITCOIN_CORE);
		if (id) {
			const health = await this.containerHealth(id);
			if (health !== "healthy") {
				log.info(
					`ERROR: ${DockerService.BITCOIN_CORE} is running but not healthy (status: ${health}).`,
				);
				log.info(
					"Fix bitcoin-core manually. This script will not restart or recreate it.",
				);
				throw new Error(`${DockerService.BITCOIN_CORE} unhealthy`);
			}
			log.info(
				`${DockerService.BITCOIN_CORE} already running and healthy — leaving unchanged`,
			);
			return;
		}

		log.info(
			`${DockerService.BITCOIN_CORE} is not running — starting it (first-time only)...`,
		);
		await this.run(["up", "-d", DockerService.BITCOIN_CORE], { check: true });
		await this.waitForHealthy(DockerService.BITCOIN_CORE, 600);
	}

	private async startInfraServices(): Promise<void> {
		log.info("Starting infrastructure for test (ENVIRONMENT=test)...");
		await this.run(
			["up", "-d", "--build", "--force-recreate", ...DOCKER_INFRA_SERVICES],
			{
				check: true,
			},
		);
		for (const service of DOCKER_INFRA_SERVICES) {
			await this.waitForHealthy(service);
		}
		await this.ensureTestPostgresDatabase();
	}

	private async stopAppServices(): Promise<void> {
		log.info(
			"Stopping application services so unit tests can use Postgres/Redis exclusively...",
		);
		await this.runQuiet(["stop", ...DOCKER_APP_SERVICES]);
	}

	private async startAppServices(): Promise<void> {
		log.info("Starting backend application services for test (ENVIRONMENT=test)...");
		const apihandlerReplicas =
			process.env.LAYER2LEDGER_APIHANDLER_REPLICAS ?? "2";
		await this.run(
			[
				"up",
				"-d",
				"--build",
				"--force-recreate",
				"--scale",
				`${DockerService.LAYER2LEDGER_APIHANDLER}=${apihandlerReplicas}`,
				...DOCKER_APP_SERVICES,
			],
			{
				check: true,
			},
		);
		for (const service of DOCKER_APP_SERVICES) {
			await this.waitForHealthy(service);
		}
	}

	private async ensureTesthelper(): Promise<void> {
		log.info(
			`Building and starting ${DockerService.LAYER2LEDGER_TESTHELPER} (force-recreate)...`,
		);
		await this.run(
			[
				"--profile",
				DockerComposeProfile.TEST,
				"up",
				"-d",
				"--build",
				"--force-recreate",
				DockerService.LAYER2LEDGER_TESTHELPER,
			],
			{ check: true },
		);
		await this.waitForHealthy(DockerService.LAYER2LEDGER_TESTHELPER);
	}

	private async runTestServices(
		services: readonly DockerServiceName[],
		outputDir: string,
		results: ServiceTestCounts[],
	): Promise<boolean> {
		let failed = false;
		for (const testService of services) {
			log.info(`Running ${testService}...`);
			const { kind, command } = getServiceTestCommand(testService);
			const composeArgs = [
				"--profile",
				DockerComposeProfile.TEST,
				"run",
				"--rm",
				"--build",
				"-v",
				`${outputDir}:${TEST_OUTPUT_MOUNT}`,
				"-e",
				`TEST_RESULT_FILE=${containerResultPath(testService)}`,
			];
			if (testService === DockerService.TEST_LAYER2LEDGER_STRESS) {
				composeArgs.push(
					"-e",
					`STRESS_RESULT_FILE=${TEST_OUTPUT_MOUNT}/${STRESS_THROUGHPUT_FILENAME}`,
				);
			}
			composeArgs.push(testService, ...command);

			const containerPassed = await this.runQuiet(composeArgs);
			if (containerPassed) {
				log.info(`PASSED: ${testService}`);
			} else {
				log.error(`FAILED: ${testService}`);
				failed = true;
			}

			ensureServiceResultFile(outputDir, testService, containerPassed, kind);
			results.push(
				parseJunitCounts(
					testService,
					join(outputDir, testService),
					containerPassed,
				),
			);
		}
		return failed;
	}

	private async stopTestProfileServices(): Promise<void> {
		log.info("Stopping test-profile background services...");
		await this.runQuiet([
			"--profile",
			DockerComposeProfile.TEST,
			"stop",
			...DOCKER_TEST_PROFILE_BACKGROUND_SERVICES,
		]);
	}

	private async cleanupTestContainers(): Promise<void> {
		await this.stopTestProfileServices();
		log.info("Removing stopped test containers (if any)...");
		await this.runQuiet([
			"--profile",
			DockerComposeProfile.TEST,
			"rm",
			"-sf",
			...DOCKER_TEST_SERVICES,
		]);
	}

	async main(): Promise<number> {
		await this.ensureTestConfig();
		await this.ensureBitcoinCore();
		await this.startInfraServices();
		await this.stopAppServices();

		const runId = formatTestOutputRunId();
		const outputDir = createTestOutputDir(this.root, runId);
		log.info(`Writing test reports to .test-output/${runId}/`);
		const results: ServiceTestCounts[] = [];

		let exitCode = 0;

		log.info("Running layer2ledger unit tests (no live apihandler/dbwriter)...");
		if (
			await this.runTestServices(DOCKER_UNIT_TEST_SERVICES, outputDir, results)
		) {
			exitCode = 1;
		}

		await this.startAppServices();
		await this.ensureTesthelper();

		log.info("Running integration test containers...");
		if (
			await this.runTestServices(
				DOCKER_INTEGRATION_TEST_SERVICES,
				outputDir,
				results,
			)
		) {
			exitCode = 1;
		}

		await this.cleanupTestContainers();

		printTestResultsSummary(outputDir, results, this.root);

		if (exitCode === 0) {
			log.info("All test containers passed");
		} else {
			log.error("One or more test containers failed");
		}

		return exitCode;
	}
}

const runner = new DockerComposeTestRunner(ROOT);
process.exit(await runner.main());
