#!/usr/bin/env bun
/**
 * Build compose images only when each service's inputs changed.
 *
 * Usage:
 *   bun run ensure-compose-build.ts [service ...]
 *
 * Env:
 *   FORCE_COMPOSE_BUILD=1  — always build every requested service
 *   ENVIRONMENT            — defaults to test
 */

import {
	applyContainerRuntimeEnv,
	assertContainerRuntimeReady,
	DOCKER_DEFAULT_TEST_BUILD_SERVICES,
	DOCKER_TEST_COMPOSE_FILES,
	DockerComposeProfile,
	Environment,
	getProjectRoot,
	resolveComposeCommand,
	resolveContainerCli,
} from "@openl2/config-loader";
import {
	filterBuildableServices,
	fingerprintLogPath,
	resolveServicesToBuild,
	writeStoredServiceFingerprints,
} from "./compose-build-cache";
import { log } from "./src/logger";

const ROOT = getProjectRoot(import.meta.dir);

async function main(): Promise<number> {
	const requested = Bun.argv.slice(2);
	const services = filterBuildableServices(
		requested.length > 0 ? requested : DOCKER_DEFAULT_TEST_BUILD_SERVICES,
	);

	if (services.length === 0) {
		log.info("No buildable compose services requested; skipping build");
		return 0;
	}

	const env = applyContainerRuntimeEnv({
		...process.env,
		ENVIRONMENT: process.env.ENVIRONMENT ?? Environment.TEST,
	});
	assertContainerRuntimeReady(env);

	const composePrefix = [
		...resolveComposeCommand(env),
		"--progress",
		"quiet",
	];
	for (const composeFile of DOCKER_TEST_COMPOSE_FILES) {
		composePrefix.push("-f", composeFile);
	}

	const { toBuild, fingerprints, logLines } = await resolveServicesToBuild({
		root: ROOT,
		services,
		containerCli: resolveContainerCli(env),
		composePrefix,
		env,
		profile: DockerComposeProfile.TEST,
	});
	for (const line of logLines) {
		log.info(line);
	}

	if (toBuild.length === 0) {
		return 0;
	}

	const args = [
		...composePrefix,
		"--profile",
		DockerComposeProfile.TEST,
		"build",
		"-q",
		...toBuild,
	];

	const proc = Bun.spawn(args, {
		cwd: ROOT,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
		if (combined) {
			log.error(combined);
		}
		log.error(`compose build failed (${exitCode})`);
		return exitCode;
	}

	const builtFingerprints: Record<string, string> = {};
	for (const service of toBuild) {
		const fingerprint = fingerprints[service];
		if (fingerprint) {
			builtFingerprints[service] = fingerprint;
		}
	}
	writeStoredServiceFingerprints(ROOT, builtFingerprints);
	log.info(
		`Compose build complete; fingerprints saved to ${fingerprintLogPath(ROOT)}`,
	);
	return 0;
}

process.exit(await main());
