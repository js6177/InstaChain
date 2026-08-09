/**
 * Resolve which container engine to use for compose / inspect.
 *
 * Precedence:
 * 1. `CONTAINER_CLI` or `DOCKER` env (`podman` | `docker` | `auto`)
 * 2. Auto: prefer `podman` when on PATH (rootless-friendly), else `docker`
 */

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
