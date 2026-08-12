/**
 * Resolve which container engine to use for compose / inspect.
 *
 * Precedence:
 * 1. `CONTAINER_CLI` or `DOCKER` env (`podman` | `docker` | `auto`)
 * 2. Auto: prefer `podman` when on PATH (rootless-friendly), else `docker`
 *
 * When using Podman, prefer {@link applyContainerRuntimeEnv} so the
 * docker-compose plugin talks to the rootless API socket instead of
 * `/run/podman/podman.sock`.
 */

import { existsSync } from "node:fs";

export const ContainerCli = {
	Docker: "docker",
	Podman: "podman",
} as const;

export type ContainerCliName =
	(typeof ContainerCli)[keyof typeof ContainerCli];

function which(command: string): string | null {
	if (typeof Bun !== "undefined" && typeof Bun.which === "function") {
		return Bun.which(command);
	}
	return null;
}

type EnvMap = Record<string, string | undefined>;

/** Resolved engine binary name (`docker` or `podman`). */
export function resolveContainerCli(env: EnvMap = process.env): ContainerCliName {
	const explicit = (env.CONTAINER_CLI ?? env.DOCKER ?? "auto")
		.trim()
		.toLowerCase();
	if (explicit === ContainerCli.Podman || explicit === ContainerCli.Docker) {
		return explicit;
	}
	if (explicit !== "auto" && explicit.length > 0) {
		throw new Error(
			`Invalid CONTAINER_CLI/DOCKER="${explicit}". Use podman, docker, or auto.`,
		);
	}
	if (which(ContainerCli.Podman)) {
		return ContainerCli.Podman;
	}
	return ContainerCli.Docker;
}

export function isPodmanCli(
	cli: ContainerCliName = resolveContainerCli(),
): boolean {
	return cli === ContainerCli.Podman;
}

/**
 * Args for the Compose v2 interface: `docker compose` or `podman compose`.
 * Extra leading flags (e.g. `--progress quiet`) can be appended by callers.
 */
export function resolveComposeCommand(env: EnvMap = process.env): string[] {
	return [resolveContainerCli(env), "compose"];
}

/** Host path to the Podman API socket (Docker-compatible). */
export function podmanSocketPath(env: EnvMap = process.env): string {
	const runtimeDir =
		env.XDG_RUNTIME_DIR?.trim() ||
		(typeof process.getuid === "function"
			? `/run/user/${process.getuid()}`
			: "/run/user/1000");
	return `${runtimeDir.replace(/\/$/, "")}/podman/podman.sock`;
}

/** `unix://…` URI for {@link podmanSocketPath}. */
export function podmanDockerHost(env: EnvMap = process.env): string {
	return `unix://${podmanSocketPath(env)}`;
}

/**
 * Env for spawning compose/engine commands.
 *
 * For rootless Podman, the external docker-compose plugin often defaults to
 * `/run/podman/podman.sock` (missing) unless `DOCKER_HOST` points at the
 * user socket. Existing `DOCKER_HOST` / `CONTAINER_HOST` values are kept.
 */
export function applyContainerRuntimeEnv(
	env: EnvMap = process.env,
): Record<string, string> {
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) {
			next[key] = value;
		}
	}

	if (!isPodmanCli(resolveContainerCli(env))) {
		return next;
	}

	const dockerHost = next.DOCKER_HOST?.trim();
	const containerHost = next.CONTAINER_HOST?.trim();
	if (!dockerHost && !containerHost) {
		const host = podmanDockerHost(env);
		next.DOCKER_HOST = host;
		// Podman also honors CONTAINER_HOST; keep them aligned.
		next.CONTAINER_HOST = host;
	}

	return next;
}

/**
 * Fail fast with an actionable message when the rootless Podman API socket
 * is missing (common when `podman.socket` is not running for the user).
 */
export function assertContainerRuntimeReady(env: EnvMap = process.env): void {
	if (!isPodmanCli(resolveContainerCli(env))) {
		return;
	}
	const socket = podmanSocketPath(env);
	if (existsSync(socket)) {
		return;
	}
	throw new Error(
		[
			`Podman API socket not found at ${socket}.`,
			"Start it with: systemctl --user enable --now podman.socket",
			`Or set DOCKER_HOST=unix://${socket}`,
		].join(" "),
	);
}
