import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { Environment, type EnvironmentName } from "./services";

function ensureDirectory(path: string): string {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
	return path;
}

export function getProjectRoot(startDir = process.cwd()): string {
	let current = startDir;
	while (current !== dirname(current)) {
		if (existsSync(join(current, ".git"))) {
			return current;
		}
		current = dirname(current);
	}
	throw new Error("Project root with .git folder not found.");
}

export function getOutputDirectory(): string {
	const envPath = process.env.OPENL2_OUTPUT_PATH;
	if (envPath) {
		return envPath;
	}

	try {
		const projectRoot = getProjectRoot();
		return ensureDirectory(join(projectRoot, ".output"));
	} catch {
		const systemOutputPath = join(homedir(), ".openl2", "output");
		return ensureDirectory(systemOutputPath);
	}
}

export function getEnvSpecificOutputDirectory(
	environment: EnvironmentName = Environment.DEFAULT,
): string {
	return ensureDirectory(join(getOutputDirectory(), environment));
}

export function getConfigDirectory(): string {
	const envPath = process.env.OPENL2_CONFIG_PATH;
	if (envPath) {
		return envPath;
	}

	try {
		const projectRoot = getProjectRoot();
		return join(projectRoot, ".config");
	} catch {
		return join(homedir(), ".openl2", "config");
	}
}

export function getEnvSpecificConfigDirectory(
	environment: EnvironmentName = Environment.DEFAULT,
): string {
	return join(getConfigDirectory(), environment);
}

export function getConfigFilePath(
	service: string,
	environment: EnvironmentName = Environment.DEFAULT,
): string {
	const serviceFileName =
		service === "bitcoin.conf" ? "bitcoin.conf" : `${service}-config.json`;
	return join(getConfigDirectory(), environment, serviceFileName);
}

export function getDockerEnvFilePath(
	service: string,
	environment: EnvironmentName = Environment.DEFAULT,
): string {
	return join(getConfigDirectory(), environment, `${service}.env`);
}

export function getBitcoinCoreConfDirectory(): string {
	const platform = process.platform;
	if (platform === "win32") {
		const appData = process.env.APPDATA;
		if (!appData) {
			throw new Error("APPDATA environment variable is not set");
		}
		return join(appData, "Bitcoin");
	}
	if (platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "Bitcoin");
	}
	return join(homedir(), ".bitcoin");
}

export function getLayer2BridgeBitcoinConfFilePath(
	startDir = process.cwd(),
): string {
	return join(
		getProjectRoot(startDir),
		"backend",
		"layer2bridge",
		"bitcoin.conf",
	);
}

export function getLayer2LedgerDockerEnvFilePath(
	environment: EnvironmentName = Environment.DEFAULT,
	startDir = process.cwd(),
): string {
	return join(
		getProjectRoot(startDir),
		"backend",
		"layer2ledger",
		`.env.${environment}`,
	);
}

export function getLayer2OAuthManagerDockerEnvFilePath(
	environment: EnvironmentName = Environment.DEFAULT,
	startDir = process.cwd(),
): string {
	return join(
		getProjectRoot(startDir),
		"backend",
		"layer2ledgeroauthmanager",
		`.env.${environment}`,
	);
}
