#!/usr/bin/env bun
/**
 * Run backend and frontend tests inside Docker containers.
 *
 * - Starts infrastructure with ENVIRONMENT=test
 * - Runs layer2ledger unit tests before apihandler/dbwriter (avoids DB/Redis lock contention)
 * - Starts application services, then runs integration test containers (including wallet vitest)
 * - Leaves a running healthy bitcoin-core container untouched
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = import.meta.dir;

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.test.yml'] as const;

const INFRA_SERVICES = [
  'layer2ledger-postgres',
  'layer2ledger-redis',
  'layer2ledger-mongodb',
] as const;

const APP_SERVICES = [
  'layer2ledgerapihandler',
  'layer2ledgerdbwriter',
  'layer2ledgeroauthmanager',
  'layer2bridge',
] as const;

const TEST_SERVICES = [
  'test-layer2ledger',
  'test-layer2bridge',
  'test-bitcoin-core-rpc',
  'test-layer2ledgeroauthmanager',
  'test-layer2ledger-seed',
  'test-wallet-web',
] as const;

const UNIT_TEST_SERVICES = ['test-layer2ledger'] as const;

const INTEGRATION_TEST_SERVICES = [
  'test-layer2bridge',
  'test-bitcoin-core-rpc',
  'test-layer2ledgeroauthmanager',
  'test-layer2ledger-seed',
  'test-wallet-web',
] as const;

/** Long-running services in the "test" compose profile. */
const PROFILE_BACKGROUND_SERVICES = ['layer2ledger-testhelper'] as const;

const SETUP_BUN_IMAGE = process.env.SETUP_BUN_IMAGE ?? 'oven/bun:1.3';

const CONFIG_MARKER = join(ROOT, '.config/test/layer2ledger-common-config.json');
const ENV_TEST = join(ROOT, 'backend/layer2ledger/.env.test');

function log(message: string): void {
  console.log(`==> ${message}`);
}

function loadEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
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

  constructor(private readonly root: string) {
    this.env = { ...process.env, ENVIRONMENT: 'test' } as Record<string, string>;
    this.compose = ['docker', 'compose', '--progress', 'quiet'];
    for (const composeFile of COMPOSE_FILES) {
      this.compose.push('-f', composeFile);
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
      stdout: captureOutput ? 'pipe' : 'inherit',
      stderr: captureOutput ? 'pipe' : 'inherit',
    });

    const stdout = captureOutput ? await new Response(proc.stdout).text() : '';
    const stderr = captureOutput ? await new Response(proc.stderr).text() : '';
    const exitCode = await proc.exited;

    if (check && exitCode !== 0) {
      throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`);
    }

    return { exitCode, stdout, stderr };
  }

  private async runQuiet(args: string[]): Promise<boolean> {
    const result = await this.run(args, { check: false });
    return result.exitCode === 0;
  }

  private async dockerRun(args: string[], check = true): Promise<void> {
    const proc = Bun.spawn(args, {
      cwd: this.root,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await proc.exited;
    if (check && exitCode !== 0) {
      throw new Error(`Command failed (${exitCode}): ${args.join(' ')}`);
    }
  }

  private async runSetupScripts(...scriptArgs: string[]): Promise<void> {
    const setupDir = join(this.root, 'backend/setup_scripts');
    const env = {
      ...this.env,
      OPENL2_CONFIG_PATH: join(this.root, '.config'),
    };

    if (Bun.which('bun')) {
      const proc = Bun.spawn(['bun', 'run', 'src/main.ts', ...scriptArgs], {
        cwd: setupDir,
        env,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`Setup scripts failed with exit code ${exitCode}`);
      }
      return;
    }

    log(`bun not found on host — running setup scripts in Docker (${SETUP_BUN_IMAGE})...`);
    await this.dockerRun([
      'docker',
      'run',
      '--rm',
      '-v',
      `${this.root}:/workspace`,
      '-w',
      '/workspace/backend/setup_scripts',
      '-e',
      `OPENL2_CONFIG_PATH=${env.OPENL2_CONFIG_PATH}`,
      SETUP_BUN_IMAGE,
      'bun',
      'run',
      'src/main.ts',
      ...scriptArgs,
    ]);
  }

  private async ensureTestConfig(): Promise<void> {
    if (existsSync(CONFIG_MARKER)) {
      log(`Test config found at ${CONFIG_MARKER.slice(this.root.length + 1)}`);
      return;
    }

    log('Generating test config (.config/test/)...');
    await this.runSetupScripts(
      '-env',
      'test',
      '-containered',
      'true',
      '-generate-keys',
      '-generate-oauth-config',
    );
  }

  private async ensureTestPostgresDatabase(): Promise<void> {
    const dbName = loadEnvFile(ENV_TEST).POSTGRES_DB;
    if (!dbName) {
      throw new Error(`POSTGRES_DB missing from ${ENV_TEST}`);
    }
    log(`Ensuring PostgreSQL database exists: ${dbName}`);

    const result = await this.run(
      [
        'exec',
        '-T',
        'layer2ledger-postgres',
        'psql',
        '-U',
        'postgres',
        '-tc',
        `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
      ],
      { check: true, captureOutput: true },
    );

    if (result.stdout.includes('1')) {
      log(`PostgreSQL database ${dbName} already exists`);
      return;
    }

    await this.run(
      [
        'exec',
        '-T',
        'layer2ledger-postgres',
        'psql',
        '-U',
        'postgres',
        '-c',
        `CREATE DATABASE ${dbName};`,
      ],
      { check: true },
    );
    log(`Created PostgreSQL database ${dbName}`);
  }

  private async containerId(service: string): Promise<string> {
    const result = await this.run(['ps', '-q', service], {
      check: false,
      captureOutput: true,
    });
    return result.stdout.trim();
  }

  private async containerHealth(containerId: string): Promise<string> {
    if (!containerId) {
      return 'missing';
    }

    const proc = Bun.spawn(['docker', 'inspect', containerId], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return 'unknown';
    }

    const inspected = JSON.parse(stdout) as Array<{ State: InspectState }>;
    const state = inspected[0]?.State;
    if (!state) {
      return 'unknown';
    }
    if (state.Health?.Status) {
      return state.Health.Status;
    }
    return state.Status ?? 'unknown';
  }

  private async waitForHealthy(service: string, timeoutSec = 180): Promise<void> {
    let waited = 0;
    while (waited < timeoutSec) {
      const health = await this.containerHealth(await this.containerId(service));
      if (health === 'healthy') {
        log(`${service} is healthy`);
        return;
      }
      await Bun.sleep(2000);
      waited += 2;
    }

    log(`ERROR: timed out waiting for ${service} to become healthy`);
    await this.run(['ps'], { check: false });
    throw new Error(`Timed out waiting for ${service}`);
  }

  private async ensureBitcoinCore(): Promise<void> {
    const id = await this.containerId('bitcoin-core');
    if (id) {
      const health = await this.containerHealth(id);
      if (health !== 'healthy') {
        log(`ERROR: bitcoin-core is running but not healthy (status: ${health}).`);
        log('Fix bitcoin-core manually. This script will not restart or recreate it.');
        throw new Error('bitcoin-core unhealthy');
      }
      log('bitcoin-core already running and healthy — leaving unchanged');
      return;
    }

    log('bitcoin-core is not running — starting it (first-time only)...');
    await this.run(['up', '-d', 'bitcoin-core'], { check: true });
    await this.waitForHealthy('bitcoin-core', 600);
  }

  private async startInfraServices(): Promise<void> {
    log('Starting infrastructure for test (ENVIRONMENT=test)...');
    await this.run(['up', '-d', '--build', '--force-recreate', ...INFRA_SERVICES], {
      check: true,
    });
    for (const service of INFRA_SERVICES) {
      await this.waitForHealthy(service);
    }
    await this.ensureTestPostgresDatabase();
  }

  private async stopAppServices(): Promise<void> {
    log('Stopping application services so unit tests can use Postgres/Redis exclusively...');
    await this.runQuiet(['stop', ...APP_SERVICES]);
  }

  private async startAppServices(): Promise<void> {
    log('Starting backend application services for test (ENVIRONMENT=test)...');
    await this.run(['up', '-d', '--build', '--force-recreate', ...APP_SERVICES], {
      check: true,
    });
    for (const service of APP_SERVICES) {
      await this.waitForHealthy(service);
    }
  }

  private async ensureTesthelper(): Promise<void> {
    log('Building and starting layer2ledger-testhelper (force-recreate)...');
    await this.run(
      [
        '--profile',
        'test',
        'up',
        '-d',
        '--build',
        '--force-recreate',
        'layer2ledger-testhelper',
      ],
      { check: true },
    );
    await this.waitForHealthy('layer2ledger-testhelper');
  }

  private async runTestServices(services: readonly string[]): Promise<boolean> {
    let failed = false;
    for (const testService of services) {
      log(`Running ${testService}...`);
      if (await this.runQuiet(['--profile', 'test', 'run', '--rm', '--build', testService])) {
        log(`PASSED: ${testService}`);
      } else {
        log(`FAILED: ${testService}`);
        failed = true;
      }
    }
    return failed;
  }

  private async stopTestProfileServices(): Promise<void> {
    log('Stopping test-profile background services...');
    await this.runQuiet(['--profile', 'test', 'stop', ...PROFILE_BACKGROUND_SERVICES]);
  }

  private async cleanupTestContainers(): Promise<void> {
    await this.stopTestProfileServices();
    log('Removing stopped test containers (if any)...');
    await this.runQuiet(['--profile', 'test', 'rm', '-sf', ...TEST_SERVICES]);
  }

  async main(): Promise<number> {
    await this.ensureTestConfig();
    await this.ensureBitcoinCore();
    await this.startInfraServices();
    await this.stopAppServices();

    let exitCode = 0;

    log('Running layer2ledger unit tests (no live apihandler/dbwriter)...');
    if (await this.runTestServices(UNIT_TEST_SERVICES)) {
      exitCode = 1;
    }

    await this.startAppServices();
    await this.ensureTesthelper();

    log('Running integration test containers...');
    if (await this.runTestServices(INTEGRATION_TEST_SERVICES)) {
      exitCode = 1;
    }

    await this.cleanupTestContainers();

    if (exitCode === 0) {
      log('All test containers passed');
    } else {
      log('One or more test containers failed');
    }

    return exitCode;
  }
}

const runner = new DockerComposeTestRunner(ROOT);
process.exit(await runner.main());
