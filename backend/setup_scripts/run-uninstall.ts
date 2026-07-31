#!/usr/bin/env bun
/**
 * Remove all OpenL2 docker containers and attached volumes.
 *
 * By default prompts for confirmation (press `c` to continue).
 * Pass `-noprompt` to skip the confirmation (for scripting).
 */

import {
	DockerComposeFile,
	DockerComposeProfile,
	getProjectRoot,
	requireBun,
} from "@openl2/config-loader";
import { parseCliArgs } from "./src/cli-args";
import { log } from "./src/logger";

const ROOT = getProjectRoot(import.meta.dir);

/** All compose overlays so every project container/volume is included. */
const UNINSTALL_COMPOSE_FILES = [
	DockerComposeFile.BASE,
	DockerComposeFile.DEV,
	DockerComposeFile.TEST,
] as const;

async function promptContinue(): Promise<boolean> {
	if (!process.stdin.isTTY) {
		throw new Error(
			"Interactive confirmation requires a terminal. " +
				"Re-run with -noprompt to skip the prompt, e.g. `bun run uninstall -- -noprompt`.",
		);
	}

	const warning =
		"Warning: this command permanently removes all OpenL2 docker containers and any attached volumes. Press 'c' to continue removal";
	const answer = prompt(warning);
	return (answer ?? "").trim().toLowerCase() === "c";
}

function printHelp(): void {
	log.info(`Usage: bun run run-uninstall.ts [options]

Remove all OpenL2 docker containers and attached volumes.

Options:
  -noprompt    Skip the interactive confirmation prompt
  -h, --help   Show this help
`);
}

async function main(): Promise<void> {
	requireBun();

	const { values } = parseCliArgs({
		noprompt: { type: "boolean", default: false },
		help: { type: "boolean", short: "h", default: false },
	});

	if (values.help) {
		printHelp();
		return;
	}

	if (!values.noprompt) {
		const confirmed = await promptContinue();
		if (!confirmed) {
			log.info("Uninstall cancelled (did not receive 'c').");
			process.exit(1);
		}
	}

	const compose = ["docker", "compose", "--progress", "quiet"];
	for (const composeFile of UNINSTALL_COMPOSE_FILES) {
		compose.push("-f", composeFile);
	}

	const command = [
		...compose,
		"--profile",
		DockerComposeProfile.TEST,
		"down",
		"-v",
		"--remove-orphans",
	];

	log.info("Removing OpenL2 docker containers and volumes...");
	const proc = Bun.spawn(command, {
		cwd: ROOT,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`Uninstall failed with exit code ${exitCode}`);
	}

	log.info("Uninstall complete: containers and volumes removed.");
}

try {
	await main();
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
