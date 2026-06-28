#!/usr/bin/env python3
"""Write RPC config from .config/{ENVIRONMENT} and run bitcoin_core_rpc pytest."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    environment = os.getenv("ENVIRONMENT", "test")
    config_root = Path(os.getenv("OPENL2_CONFIG_PATH", "/app/.config"))
    bridge_config_path = config_root / environment / "layer2ledgerbridge-config.json"

    if not bridge_config_path.is_file():
        print(f"ERROR: missing {bridge_config_path}", file=sys.stderr, flush=True)
        raise SystemExit(1)

    bridge_config = json.loads(bridge_config_path.read_text(encoding="utf-8"))
    rpc_settings = bridge_config["rpc_settings"]
    rpc_settings["rpchost"] = "bitcoin-core"

    test_root = Path("/app/packages/bitcoin_core_rpc")
    config_dir = test_root / "test" / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = config_dir / "config.json"
    config_path.write_text(json.dumps(rpc_settings, indent=4) + "\n", encoding="utf-8")

    print(
        f"Using RPC config at {config_path} -> {rpc_settings['rpchost']}:{rpc_settings['rpcport']}",
        flush=True,
    )

    result = subprocess.run(
        ["uv", "run", "pytest", "test/", "-v"],
        cwd=test_root,
        check=False,
    )
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
