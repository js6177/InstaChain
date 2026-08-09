import { describe, expect, it } from "bun:test";
import {
	ContainerCli,
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
	});
});
