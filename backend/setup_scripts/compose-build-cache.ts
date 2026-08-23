/**
 * Skip `compose build` per service when that service's inputs are unchanged.
 *
 * Override with FORCE_COMPOSE_BUILD=1 (rebuilds every requested service).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { DockerService } from "@openl2/config-loader";

/** Services that define a `build:` section in compose (not pull-only images). */
export const COMPOSE_BUILDABLE_SERVICES = new Set<string>([
	DockerService.LAYER2LEDGER_APIHANDLER,
	DockerService.LAYER2LEDGER_DBWRITER,
	DockerService.LAYER2LEDGER_OAUTH_MANAGER,
	DockerService.LAYER2LEDGER_TESTHELPER,
	DockerService.LAYER2BRIDGE,
	DockerService.BITCOIN_CORE,
	DockerService.WALLET_WEB,
	DockerService.TEST_LAYER2LEDGER,
	DockerService.TEST_LAYER2LEDGER_STRESS,
	DockerService.TEST_STRESS_LAYER2LEDGER,
	DockerService.TEST_STRESS_K6,
	DockerService.TEST_LAYER2BRIDGE,
	DockerService.TEST_BITCOIN_CORE_RPC,
	DockerService.TEST_LAYER2LEDGER_SEED,
	DockerService.TEST_WALLET_WEB,
]);

const FINGERPRINT_RELATIVE_PATH = ".config/test/.compose-build-fingerprints.json";

const SHARED_MONOREPO_FILES = [
	"package.json",
	"bun.lock",
	"bunfig.toml",
	"turbo.json",
	".dockerignore",
] as const;

/** Workspace trees included by `@openl2/layer2ledger` turbo prune. */
const LAYER2LEDGER_PACKAGE_GLOBS = [
	"backend/layer2ledger/**",
	"backend/packages/openl2-logger/**",
	"shared/config-loader/**",
	"shared/openl2-messaging/**",
	"shared/pubkey-utils/**",
	"shared/stress-results/**",
	"shared/api-layer2ledger/**",
] as const;

/** Workspace trees included by `@openl2/stress-testing` turbo prune. */
const STRESS_PACKAGE_GLOBS = [
	...LAYER2LEDGER_PACKAGE_GLOBS,
	"backend/stress-testing/**",
] as const;

const OAUTH_PACKAGE_GLOBS = [
	"backend/layer2ledgeroauthmanager/**",
	"backend/packages/openl2-logger/**",
	"shared/config-loader/**",
	"shared/pubkey-utils/**",
	"shared/api-layer2oauthmanager/**",
] as const;

const BRIDGE_PACKAGE_GLOBS = [
	"backend/layer2bridge/**",
	"backend/packages/openl2-logger/**",
	"shared/api-layer2ledger/**",
	"shared/bitcoin-core-rpc/**",
	"shared/config-loader/**",
	"shared/openl2-messaging/**",
	"shared/pubkey-utils/**",
] as const;

const BITCOIN_RPC_PACKAGE_GLOBS = [
	"shared/bitcoin-core-rpc/**",
	"shared/pubkey-utils/**",
	"shared/config-loader/**",
] as const;

const WALLET_PACKAGE_GLOBS = [
	"frontend/wallet/**",
	"shared/api-layer2ledger/**",
	"shared/api-layer2oauthmanager/**",
	"shared/config-loader/**",
] as const;

interface ServiceBuildInputs {
	dockerfile: string;
	/** Extra explicit files (in addition to {@link SHARED_MONOREPO_FILES}). */
	files?: readonly string[];
	globs: readonly string[];
}

/**
 * Per-service inputs that affect the image. Scoped to each Dockerfile's
 * turbo prune / COPY set so unrelated packages do not trigger rebuilds.
 */
const SERVICE_BUILD_INPUTS: Record<string, ServiceBuildInputs> = {
	[DockerService.LAYER2LEDGER_APIHANDLER]: {
		dockerfile: "docker/Dockerfile.layer2ledgerapihandler",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.LAYER2LEDGER_DBWRITER]: {
		dockerfile: "docker/Dockerfile.layer2ledgerdbwriter",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.LAYER2LEDGER_TESTHELPER]: {
		dockerfile: "docker/Dockerfile.layer2ledgertesthelper",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.TEST_LAYER2LEDGER]: {
		dockerfile: "docker/Dockerfile.test.layer2ledger",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.TEST_LAYER2LEDGER_STRESS]: {
		dockerfile: "docker/Dockerfile.test.layer2ledger",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.TEST_STRESS_LAYER2LEDGER]: {
		dockerfile: "docker/Dockerfile.stress",
		globs: STRESS_PACKAGE_GLOBS,
	},
	[DockerService.TEST_STRESS_K6]: {
		dockerfile: "docker/Dockerfile.stress-k6",
		files: ["docker/Dockerfile.stress-k6"],
		globs: ["backend/stress-testing/k6/**"],
	},
	[DockerService.TEST_LAYER2LEDGER_SEED]: {
		dockerfile: "docker/Dockerfile.test.layer2ledger-seed",
		globs: LAYER2LEDGER_PACKAGE_GLOBS,
	},
	[DockerService.LAYER2LEDGER_OAUTH_MANAGER]: {
		dockerfile: "docker/Dockerfile.layer2ledgeroauthmanager",
		globs: OAUTH_PACKAGE_GLOBS,
	},
	[DockerService.LAYER2BRIDGE]: {
		dockerfile: "docker/Dockerfile.layer2bridge",
		globs: BRIDGE_PACKAGE_GLOBS,
	},
	[DockerService.TEST_LAYER2BRIDGE]: {
		dockerfile: "docker/Dockerfile.test.layer2bridge",
		globs: BRIDGE_PACKAGE_GLOBS,
	},
	[DockerService.BITCOIN_CORE]: {
		dockerfile: "docker/Dockerfile.bitcoin-core",
		files: [
			"docker/bitcoin_core_common.py",
			"docker/bitcoin-core-entrypoint.py",
			"docker/bitcoin-core-healthcheck.py",
		],
		globs: [],
	},
	[DockerService.TEST_BITCOIN_CORE_RPC]: {
		dockerfile: "docker/Dockerfile.test.bitcoin-core-rpc",
		files: ["docker/test_bitcoin_core_rpc_entrypoint.ts"],
		globs: BITCOIN_RPC_PACKAGE_GLOBS,
	},
	[DockerService.WALLET_WEB]: {
		dockerfile: "docker/Dockerfile.wallet-web",
		files: [
			"docker/nginx.wallet-web.conf",
			"frontend/wallet/.env.docker",
		],
		globs: WALLET_PACKAGE_GLOBS,
	},
	[DockerService.TEST_WALLET_WEB]: {
		dockerfile: "docker/Dockerfile.test.wallet-web",
		files: ["frontend/wallet/.env.test.docker"],
		globs: WALLET_PACKAGE_GLOBS,
	},
};

const FINGERPRINT_EXCLUDE_SUBSTRINGS = [
	"/node_modules/",
	"/.turbo/",
	"/dist/",
	"/.next/",
	"/build/",
	"/.test-output/",
	"/.config/",
	"/.git/",
	"/coverage/",
	"/.vitest/",
	"/agent-transcripts/",
	"/.cursor/",
	"/.vscode/",
	"/.idea/",
	"/tmp/",
	"/temp/",
	"/backend/setup_scripts/",
] as const;

interface StoredFingerprints {
	version: 1;
	services: Record<string, string>;
}

function shouldExcludePath(relativePath: string): boolean {
	const normalized = `/${relativePath.replaceAll("\\", "/")}`;
	if (
		FINGERPRINT_EXCLUDE_SUBSTRINGS.some((part) => normalized.includes(part))
	) {
		return true;
	}
	if (relativePath.endsWith(".md") || relativePath.endsWith(".log")) {
		return true;
	}
	if (relativePath.endsWith(".tsbuildinfo")) {
		return true;
	}
	return false;
}

export function filterBuildableServices(
	services: readonly string[],
): string[] {
	return services.filter((service) => COMPOSE_BUILDABLE_SERVICES.has(service));
}

export function composeBuildFingerprintPath(root: string): string {
	return join(root, FINGERPRINT_RELATIVE_PATH);
}

/** Relative path helper for logs. */
export function fingerprintLogPath(root: string): string {
	return relative(root, composeBuildFingerprintPath(root));
}

export function forceComposeBuildRequested(): boolean {
	const value = process.env.FORCE_COMPOSE_BUILD?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

async function collectGlobFiles(
	root: string,
	globs: readonly string[],
): Promise<string[]> {
	const files = new Set<string>();
	for (const pattern of globs) {
		const glob = new Bun.Glob(pattern);
		for await (const match of glob.scan({
			cwd: root,
			onlyFiles: true,
			followSymlinks: false,
		})) {
			if (shouldExcludePath(match)) {
				continue;
			}
			files.add(match);
		}
	}
	return [...files].sort();
}

async function hashRelativeFiles(
	root: string,
	relativePaths: readonly string[],
): Promise<string> {
	const hasher = createHash("sha256");
	for (const relativePath of relativePaths) {
		const absolutePath = join(root, relativePath);
		if (!existsSync(absolutePath)) {
			hasher.update(`${relativePath}\0MISSING\n`);
			continue;
		}
		const bytes = await Bun.file(absolutePath).arrayBuffer();
		hasher.update(relativePath);
		hasher.update("\0");
		hasher.update(new Uint8Array(bytes));
		hasher.update("\n");
	}
	hasher.update(`fileCount=${relativePaths.length}\n`);
	return hasher.digest("hex");
}

export async function computeServiceBuildFingerprint(
	root: string,
	service: string,
): Promise<string> {
	const inputs = SERVICE_BUILD_INPUTS[service];
	if (!inputs) {
		// Unknown buildable service: hash a sentinel so FORCE / missing still work.
		return createHash("sha256").update(`unknown:${service}`).digest("hex");
	}

	const files = new Set<string>([
		...SHARED_MONOREPO_FILES,
		inputs.dockerfile,
		...(inputs.files ?? []),
	]);
	for (const match of await collectGlobFiles(root, inputs.globs)) {
		files.add(match);
	}
	return hashRelativeFiles(root, [...files].sort());
}

function readStoredFingerprints(root: string): StoredFingerprints {
	const path = composeBuildFingerprintPath(root);
	if (!existsSync(path)) {
		return { version: 1, services: {} };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as StoredFingerprints;
		if (parsed?.version === 1 && parsed.services && typeof parsed.services === "object") {
			return { version: 1, services: { ...parsed.services } };
		}
	} catch {
		// Corrupt / legacy single-hash file — treat as empty and rebuild.
	}
	return { version: 1, services: {} };
}

export function writeStoredServiceFingerprints(
	root: string,
	updated: Record<string, string>,
): void {
	const current = readStoredFingerprints(root);
	const merged: StoredFingerprints = {
		version: 1,
		services: { ...current.services, ...updated },
	};
	mkdirSync(join(root, ".config/test"), { recursive: true });
	writeFileSync(
		composeBuildFingerprintPath(root),
		`${JSON.stringify(merged, null, 2)}\n`,
		"utf-8",
	);
}

export interface ServicesNeedingBuildResult {
	toBuild: string[];
	/** Fresh fingerprints for every requested service (for persist-after-build). */
	fingerprints: Record<string, string>;
	reasons: Record<string, string>;
}

/**
 * Decide which of `services` need a compose build based on per-service
 * source fingerprints (and optional FORCE_COMPOSE_BUILD).
 */
export async function selectServicesNeedingBuild(
	root: string,
	services: readonly string[],
): Promise<ServicesNeedingBuildResult> {
	const force = forceComposeBuildRequested();
	const stored = readStoredFingerprints(root);
	const fingerprints: Record<string, string> = {};
	const reasons: Record<string, string> = {};
	const toBuild: string[] = [];

	for (const service of services) {
		const fingerprint = await computeServiceBuildFingerprint(root, service);
		fingerprints[service] = fingerprint;

		if (force) {
			toBuild.push(service);
			reasons[service] = "FORCE_COMPOSE_BUILD is set";
			continue;
		}

		const previous = stored.services[service];
		if (previous === undefined) {
			toBuild.push(service);
			reasons[service] = "no previous build fingerprint";
			continue;
		}
		if (previous !== fingerprint) {
			toBuild.push(service);
			reasons[service] = "service inputs changed";
			continue;
		}
		reasons[service] = "source fingerprint unchanged";
	}

	return { toBuild, fingerprints, reasons };
}

interface ComposeConfigJson {
	name?: string;
	services?: Record<string, { image?: string; build?: unknown }>;
}

/**
 * Return buildable services whose local image is missing.
 *
 * Note: `compose images -q` only lists images for *running* containers, so
 * one-shot test services always look missing. We resolve the default
 * `{project}-{service}` image name (or an explicit `image:`) and inspect it.
 */
export async function findMissingComposeImages(options: {
	root: string;
	containerCli: string;
	composePrefix: readonly string[];
	env: Record<string, string>;
	services: readonly string[];
	profile?: string;
}): Promise<string[]> {
	const configArgs = [
		...options.composePrefix,
		...(options.profile ? ["--profile", options.profile] : []),
		"config",
		"--format",
		"json",
	];
	const configProc = Bun.spawn(configArgs, {
		cwd: options.root,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const configStdout = await new Response(configProc.stdout).text();
	const configCode = await configProc.exited;
	if (configCode !== 0) {
		return [...options.services];
	}

	let config: ComposeConfigJson;
	try {
		config = JSON.parse(configStdout) as ComposeConfigJson;
	} catch {
		return [...options.services];
	}

	const projectName =
		options.env.COMPOSE_PROJECT_NAME?.trim() ||
		config.name ||
		basename(options.root);

	const missing: string[] = [];
	for (const service of options.services) {
		const explicitImage = config.services?.[service]?.image?.trim();
		const imageName = explicitImage || `${projectName}-${service}`;
		const inspect = Bun.spawn(
			[options.containerCli, "image", "inspect", imageName],
			{
				cwd: options.root,
				env: options.env,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const exitCode = await inspect.exited;
		if (exitCode !== 0) {
			missing.push(service);
		}
	}
	return missing;
}

/**
 * Union fingerprint-changed services with missing images.
 */
export async function resolveServicesToBuild(options: {
	root: string;
	services: readonly string[];
	containerCli: string;
	composePrefix: readonly string[];
	env: Record<string, string>;
	profile?: string;
}): Promise<{
	toBuild: string[];
	fingerprints: Record<string, string>;
	logLines: string[];
}> {
	const selected = await selectServicesNeedingBuild(
		options.root,
		options.services,
	);
	const unchanged = options.services.filter(
		(service) => !selected.toBuild.includes(service),
	);
	const missing =
		unchanged.length === 0
			? []
			: await findMissingComposeImages({
					...options,
					services: unchanged,
				});

	const toBuild = [...new Set([...selected.toBuild, ...missing])];
	const logLines: string[] = [];

	if (toBuild.length === 0) {
		logLines.push(
			`Skipping compose build (all fingerprints unchanged): ${options.services.join(", ")}`,
		);
		return { toBuild, fingerprints: selected.fingerprints, logLines };
	}

	const changed = selected.toBuild;
	if (changed.length > 0) {
		const reasonSample = selected.reasons[changed[0]!] ?? "inputs changed";
		logLines.push(
			`Building changed images (quiet): ${changed.join(", ")} (${reasonSample})`,
		);
	}
	if (missing.length > 0) {
		logLines.push(
			`Building missing images (quiet): ${missing.join(", ")}`,
		);
	}

	return { toBuild, fingerprints: selected.fingerprints, logLines };
}
