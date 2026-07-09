#!/usr/bin/env python3
"""Run backend and frontend tests inside Docker containers.

- Starts infrastructure with ENVIRONMENT=test
- Runs layer2ledger unit tests before apihandler/dbwriter (avoids DB/Redis lock contention)
- Starts application services, then runs integration test containers (including wallet vitest)
- Leaves a running healthy bitcoin-core container untouched
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent

COMPOSE_FILES = ("docker-compose.yml", "docker-compose.test.yml")

INFRA_SERVICES = (
    "layer2ledger-postgres",
    "layer2ledger-redis",
    "layer2ledger-mongodb",
)

APP_SERVICES = (
    "layer2ledgerapihandler",
    "layer2ledgerdbwriter",
    "layer2ledgeroauthmanager",
    "layer2bridge",
)

TEST_SERVICES = (
    "test-layer2ledger",
    "test-layer2bridge",
    "test-bitcoin-core-rpc",
    "test-layer2ledgeroauthmanager",
    "test-layer2ledger-seed",
    "test-wallet-web",
)

UNIT_TEST_SERVICES = ("test-layer2ledger",)

INTEGRATION_TEST_SERVICES = (
    "test-layer2bridge",
    "test-bitcoin-core-rpc",
    "test-layer2ledgeroauthmanager",
    "test-layer2ledger-seed",
    "test-wallet-web",
)

# Long-running services in the "test" compose profile. `compose run` starts these as
# dependencies but does not stop them when the one-shot test container exits.
PROFILE_BACKGROUND_SERVICES = ("layer2ledger-testhelper",)

SETUP_UV_IMAGE = os.environ.get(
    "SETUP_UV_IMAGE", "ghcr.io/astral-sh/uv:python3.12-bookworm"
)

CONFIG_MARKER = ROOT / ".config/test/layer2ledgerbatched-common-config.json"
ENV_TEST = ROOT / "backend/layer2ledgerbatched/.env.test"


def log(message: str) -> None:
    print(f"==> {message}", flush=True)


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


class DockerComposeTestRunner:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.env = os.environ.copy()
        self.env["ENVIRONMENT"] = "test"
        self.compose = ["docker", "compose", "--progress", "quiet"]
        for compose_file in COMPOSE_FILES:
            self.compose.extend(["-f", compose_file])

    def run(
        self,
        args: list[str],
        *,
        check: bool = True,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        command = [*self.compose, *args]
        return subprocess.run(
            command,
            cwd=self.root,
            env=self.env,
            check=check,
            text=True,
            capture_output=capture_output,
        )

    def run_quiet(self, args: list[str]) -> bool:
        return self.run(args, check=False).returncode == 0

    def docker_run(self, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(args, cwd=self.root, check=check, text=True)

    def run_setup_scripts(self, *script_args: str) -> None:
        setup_dir = self.root / "backend/setup_scripts"
        env = self.env.copy()
        env["OPENL2_CONFIG_PATH"] = str(self.root / ".config")

        if shutil.which("uv"):
            subprocess.run(
                ["uv", "run", *script_args],
                cwd=setup_dir,
                env=env,
                check=True,
            )
            return

        log(f"uv not found on host — running setup scripts in Docker ({SETUP_UV_IMAGE})...")
        self.docker_run(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{self.root}:/workspace",
                "-w",
                "/workspace/backend/setup_scripts",
                "-e",
                f"OPENL2_CONFIG_PATH={env['OPENL2_CONFIG_PATH']}",
                SETUP_UV_IMAGE,
                "sh",
                "-ec",
                'uv sync --frozen && exec uv run "$@"',
                "_",
                *script_args,
            ]
        )

    def ensure_test_config(self) -> None:
        if CONFIG_MARKER.is_file():
            log(f"Test config found at {CONFIG_MARKER.relative_to(self.root)}")
            return

        log("Generating test config (.config/test/)...")
        self.run_setup_scripts(
            "src/main.py",
            "-env",
            "test",
            "-containered",
            "true",
            "-generate-keys",
            "-generate-oauth-config",
        )

    def ensure_test_postgres_database(self) -> None:
        db_name = load_env_file(ENV_TEST)["POSTGRES_DB"]
        log(f"Ensuring PostgreSQL database exists: {db_name}")

        result = self.run(
            [
                "exec",
                "-T",
                "layer2ledger-postgres",
                "psql",
                "-U",
                "postgres",
                "-tc",
                f"SELECT 1 FROM pg_database WHERE datname = '{db_name}'",
            ],
            check=True,
            capture_output=True,
        )
        if "1" in result.stdout:
            log(f"PostgreSQL database {db_name} already exists")
            return

        self.run(
            [
                "exec",
                "-T",
                "layer2ledger-postgres",
                "psql",
                "-U",
                "postgres",
                "-c",
                f"CREATE DATABASE {db_name};",
            ],
            check=True,
        )
        log(f"Created PostgreSQL database {db_name}")

    def container_id(self, service: str) -> str:
        result = self.run(["ps", "-q", service], check=False, capture_output=True)
        return result.stdout.strip()

    def container_health(self, container_id: str) -> str:
        if not container_id:
            return "missing"

        result = subprocess.run(
            ["docker", "inspect", container_id],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return "unknown"

        state = json.loads(result.stdout)[0]["State"]
        health = state.get("Health")
        if health and health.get("Status"):
            return health["Status"]
        return state.get("Status", "unknown")

    def wait_for_healthy(self, service: str, timeout_sec: int = 180) -> None:
        waited = 0
        while waited < timeout_sec:
            health = self.container_health(self.container_id(service))
            if health == "healthy":
                log(f"{service} is healthy")
                return
            time.sleep(2)
            waited += 2

        log(f"ERROR: timed out waiting for {service} to become healthy")
        self.run(["ps"], check=False)
        raise SystemExit(1)

    def ensure_bitcoin_core(self) -> None:
        container_id = self.container_id("bitcoin-core")
        if container_id:
            health = self.container_health(container_id)
            if health != "healthy":
                log(f"ERROR: bitcoin-core is running but not healthy (status: {health}).")
                log("Fix bitcoin-core manually. This script will not restart or recreate it.")
                raise SystemExit(1)
            log("bitcoin-core already running and healthy — leaving unchanged")
            return

        log("bitcoin-core is not running — starting it (first-time only)...")
        self.run(["up", "-d", "bitcoin-core"], check=True)
        self.wait_for_healthy("bitcoin-core", timeout_sec=600)

    def start_infra_services(self) -> None:
        log("Starting infrastructure for test (ENVIRONMENT=test)...")
        self.run(
            ["up", "-d", "--build", "--force-recreate", *INFRA_SERVICES],
            check=True,
        )
        for service in INFRA_SERVICES:
            self.wait_for_healthy(service)
        self.ensure_test_postgres_database()

    def stop_app_services(self) -> None:
        log("Stopping application services so pytest can use Postgres/Redis exclusively...")
        self.run_quiet(["stop", *APP_SERVICES])

    def start_app_services(self) -> None:
        log("Starting backend application services for test (ENVIRONMENT=test)...")
        self.run(
            ["up", "-d", "--build", "--force-recreate", *APP_SERVICES],
            check=True,
        )
        for service in APP_SERVICES:
            self.wait_for_healthy(service)

    def ensure_testhelper(self) -> None:
        """Rebuild testhelper so it always runs the current seed.py (not a stale image).

        `compose run` reuses a healthy layer2ledger-testhelper left over from
        `make backend-test` or a prior `make test` without rebuilding it.
        """
        log("Building and starting layer2ledger-testhelper (force-recreate)...")
        self.run(
            [
                "--profile",
                "test",
                "up",
                "-d",
                "--build",
                "--force-recreate",
                "layer2ledger-testhelper",
            ],
            check=True,
        )
        self.wait_for_healthy("layer2ledger-testhelper")

    def run_test_services(self, services: tuple[str, ...]) -> bool:
        failed = False
        for test_service in services:
            log(f"Running {test_service}...")
            if self.run_quiet(
                ["--profile", "test", "run", "--rm", "--build", test_service]
            ):
                log(f"PASSED: {test_service}")
            else:
                log(f"FAILED: {test_service}")
                failed = True
        return failed

    def stop_test_profile_services(self) -> None:
        log("Stopping test-profile background services...")
        self.run_quiet(["--profile", "test", "stop", *PROFILE_BACKGROUND_SERVICES])

    def cleanup_test_containers(self) -> None:
        self.stop_test_profile_services()
        log("Removing stopped test containers (if any)...")
        self.run_quiet(["--profile", "test", "rm", "-sf", *TEST_SERVICES])

    def main(self) -> int:
        self.ensure_test_config()
        self.ensure_bitcoin_core()
        self.start_infra_services()
        self.stop_app_services()

        exit_code = 0

        log("Running layer2ledger unit tests (no live apihandler/dbwriter)...")
        if self.run_test_services(UNIT_TEST_SERVICES):
            exit_code = 1

        self.start_app_services()

        self.ensure_testhelper()

        log("Running integration test containers...")
        if self.run_test_services(INTEGRATION_TEST_SERVICES):
            exit_code = 1

        self.cleanup_test_containers()

        if exit_code == 0:
            log("All test containers passed")
        else:
            log("One or more test containers failed")

        return exit_code


def main() -> None:
    os.chdir(ROOT)
    runner = DockerComposeTestRunner(ROOT)
    raise SystemExit(runner.main())


if __name__ == "__main__":
    main()
