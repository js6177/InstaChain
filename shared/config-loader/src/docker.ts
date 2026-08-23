import { Environment, type EnvironmentName } from "./services";

/** Top-level docker/podman compose files in the repo root. */
export const DockerComposeFile = {
	BASE: "docker-compose.yml",
	DEV: "docker-compose.dev.yml",
	TEST: "docker-compose.test.yml",
	SIGNOZ: "docker-compose.signoz.yml",
	/** Remaps otel-agent mounts for rootless Podman (use with {@link SIGNOZ}). */
	SIGNOZ_PODMAN: "docker-compose.signoz-podman.yml",
} as const;

export type DockerComposeFileName =
	(typeof DockerComposeFile)[keyof typeof DockerComposeFile];

/** Compose profile name used for one-shot / optional test services. */
export const DockerComposeProfile = {
	TEST: "test",
} as const;

export type DockerComposeProfileName =
	(typeof DockerComposeProfile)[keyof typeof DockerComposeProfile];

/**
 * Compose service names (container IDs in `podman/docker compose` commands).
 * These are distinct from {@link Services} config-file identifiers.
 */
export const DockerService = {
	LAYER2LEDGER_POSTGRES: "layer2ledger-postgres",
	LAYER2LEDGER_PGBOUNCER: "layer2ledger-pgbouncer",
	REDIS_TRANSACTIONS: "redis-transactions",
	REDIS_ADDRESSBALANCE: "redis-addressbalance",
	LAYER2LEDGER_MONGODB: "layer2ledger-mongodb",
	LAYER2LEDGER_APIHANDLER: "layer2ledgerapihandler",
	LAYER2LEDGER_APIHANDLER_NGINX: "layer2ledgerapihandler-nginx",
	LAYER2LEDGER_DBWRITER: "layer2ledgerdbwriter",
	LAYER2LEDGER_OAUTH_MANAGER: "layer2ledgeroauthmanager",
	LAYER2LEDGER_TESTHELPER: "layer2ledger-testhelper",
	LAYER2BRIDGE: "layer2bridge",
	BITCOIN_CORE: "bitcoin-core",
	WALLET_WEB: "wallet-web",
	TEST_LAYER2LEDGER: "test-layer2ledger",
	TEST_LAYER2LEDGER_STRESS: "test-layer2ledger-stress",
	TEST_STRESS_LAYER2LEDGER: "test-stress-layer2ledger",
	TEST_STRESS_K6: "test-stress-k6",
	TEST_LAYER2BRIDGE: "test-layer2bridge",
	TEST_BITCOIN_CORE_RPC: "test-bitcoin-core-rpc",
	TEST_LAYER2LEDGER_OAUTH_MANAGER: "test-layer2ledgeroauthmanager",
	TEST_LAYER2LEDGER_SEED: "test-layer2ledger-seed",
	TEST_WALLET_WEB: "test-wallet-web",
} as const;

export type DockerServiceName =
	(typeof DockerService)[keyof typeof DockerService];

/** Infrastructure dependencies shared by backend services. */
export const DOCKER_INFRA_SERVICES = [
	DockerService.LAYER2LEDGER_POSTGRES,
	DockerService.LAYER2LEDGER_PGBOUNCER,
	DockerService.REDIS_TRANSACTIONS,
	DockerService.REDIS_ADDRESSBALANCE,
	DockerService.LAYER2LEDGER_MONGODB,
] as const satisfies readonly DockerServiceName[];

/** Long-running application services (excluding wallet-web / bitcoin-core). */
export const DOCKER_APP_SERVICES = [
	DockerService.LAYER2LEDGER_APIHANDLER,
	DockerService.LAYER2LEDGER_APIHANDLER_NGINX,
	DockerService.LAYER2LEDGER_DBWRITER,
	DockerService.LAYER2LEDGER_OAUTH_MANAGER,
	DockerService.LAYER2BRIDGE,
] as const satisfies readonly DockerServiceName[];

/** One-shot test runner containers under the test compose profile (CI / test:docker). */
export const DOCKER_TEST_SERVICES = [
	DockerService.TEST_LAYER2LEDGER,
	DockerService.TEST_LAYER2BRIDGE,
	DockerService.TEST_BITCOIN_CORE_RPC,
	DockerService.TEST_LAYER2LEDGER_OAUTH_MANAGER,
	DockerService.TEST_LAYER2LEDGER_SEED,
	DockerService.TEST_WALLET_WEB,
] as const satisfies readonly DockerServiceName[];

/**
 * Throughput stress runners — not part of {@link DOCKER_TEST_SERVICES}.
 * Run separately via `make stress-test` / `make stress-test-health`.
 */
export const DOCKER_STRESS_TEST_SERVICES = [
	DockerService.TEST_STRESS_LAYER2LEDGER,
	DockerService.TEST_STRESS_K6,
	DockerService.TEST_LAYER2LEDGER_STRESS,
] as const satisfies readonly DockerServiceName[];

/** Unit-test containers that should run without live app services. */
export const DOCKER_UNIT_TEST_SERVICES = [
	DockerService.TEST_LAYER2LEDGER,
] as const satisfies readonly DockerServiceName[];

/** Integration-test containers that need live app services. */
export const DOCKER_INTEGRATION_TEST_SERVICES = [
	DockerService.TEST_LAYER2BRIDGE,
	DockerService.TEST_BITCOIN_CORE_RPC,
	DockerService.TEST_LAYER2LEDGER_OAUTH_MANAGER,
	DockerService.TEST_LAYER2LEDGER_SEED,
	DockerService.TEST_WALLET_WEB,
] as const satisfies readonly DockerServiceName[];

/**
 * Long-running services gated by the test compose profile
 * (started as dependencies of `compose run`, not stopped when the one-shot exits).
 */
export const DOCKER_TEST_PROFILE_BACKGROUND_SERVICES = [
	DockerService.LAYER2LEDGER_TESTHELPER,
] as const satisfies readonly DockerServiceName[];

/**
 * Default buildable images for `ensure-compose-build` (test + stress stacks).
 * Pull-only services (postgres/redis/nginx/…) are omitted.
 */
export const DOCKER_DEFAULT_TEST_BUILD_SERVICES = [
	DockerService.LAYER2LEDGER_APIHANDLER,
	DockerService.LAYER2LEDGER_DBWRITER,
	DockerService.LAYER2LEDGER_OAUTH_MANAGER,
	DockerService.LAYER2BRIDGE,
	...DOCKER_TEST_PROFILE_BACKGROUND_SERVICES,
	...DOCKER_TEST_SERVICES,
	...DOCKER_STRESS_TEST_SERVICES,
] as const satisfies readonly DockerServiceName[];

/** Compose files used when running the full docker test suite. */
export const DOCKER_TEST_COMPOSE_FILES = [
	DockerComposeFile.BASE,
	DockerComposeFile.TEST,
] as const satisfies readonly DockerComposeFileName[];

/** Named volume that stores Bitcoin Core chain data (must not be wiped for wallet reset). */
export const BITCOIN_CORE_DATA_VOLUME = "openl2-bitcoin-core-data";

/** Compose files for a given application environment. */
export function composeFilesForEnvironment(
	environment: EnvironmentName,
): readonly DockerComposeFileName[] {
	switch (environment) {
		case Environment.DEV:
			return [DockerComposeFile.BASE, DockerComposeFile.DEV];
		case Environment.TEST:
			return [DockerComposeFile.BASE, DockerComposeFile.TEST];
		case Environment.PROD:
		default:
			return [DockerComposeFile.BASE];
	}
}
