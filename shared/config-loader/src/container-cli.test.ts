import { describe, expect, it } from "bun:test";
import {
	applyContainerRuntimeEnv,
	ContainerCli,
	podmanDockerHost,
	podmanSocketPath,
	resolveComposeCommand,
	resolveContainerCli,
} from "./container-cli";

describe("resolveContainerCli", () => {
	it("honors explicit CONTAINER_CLI", () => {
		expect(resolveContainerCli({ CONTAINER_CLI: "docker" })).toBe(
			ContainerCli.Docker,
		);
		expect(resolveContainerCli({ CONTAINER_CLI: "podman" })).toBe(
			ContainerCli.Podman,
		);
	});

	it("honors DOCKER alias", () => {
		expect(resolveContainerCli({ DOCKER: "docker" })).toBe(ContainerCli.Docker);
	});

	it("builds compose command for the resolved engine", () => {
		expect(resolveComposeCommand({ CONTAINER_CLI: "podman" })).toEqual([
			"podman",
			"compose",
		]);
	});

	it("resolves the podman socket under XDG_RUNTIME_DIR", () => {
		expect(podmanSocketPath({ XDG_RUNTIME_DIR: "/run/user/1000" })).toBe(
			"/run/user/1000/podman/podman.sock",
		);
		expect(podmanDockerHost({ XDG_RUNTIME_DIR: "/run/user/1000" })).toBe(
			"unix:///run/user/1000/podman/podman.sock",
		);
	});

	it("sets DOCKER_HOST for rootless podman when unset", () => {
		const env = applyContainerRuntimeEnv({
			CONTAINER_CLI: "podman",
			XDG_RUNTIME_DIR: "/run/user/1000",
			PATH: "/usr/bin",
		});
		expect(env.DOCKER_HOST).toBe("unix:///run/user/1000/podman/podman.sock");
		expect(env.CONTAINER_HOST).toBe(env.DOCKER_HOST);
	});

	it("preserves an explicit DOCKER_HOST", () => {
		const env = applyContainerRuntimeEnv({
			CONTAINER_CLI: "podman",
			DOCKER_HOST: "unix:///custom.sock",
			XDG_RUNTIME_DIR: "/run/user/1000",
		});
		expect(env.DOCKER_HOST).toBe("unix:///custom.sock");
		expect(env.CONTAINER_HOST).toBeUndefined();
	});

	it("does not set DOCKER_HOST for docker CLI", () => {
		const env = applyContainerRuntimeEnv({
			CONTAINER_CLI: "docker",
			PATH: "/usr/bin",
		});
		expect(env.DOCKER_HOST).toBeUndefined();
	});
});
