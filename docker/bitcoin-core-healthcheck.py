#!/usr/bin/env python3
"""Report healthy when Bitcoin Core RPC responds; include optional sync %."""

from __future__ import annotations

import json
import subprocess
import sys

from bitcoin_core_common import bitcoin_cli_command, run_as_bitcoin


def main() -> None:
    result = run_as_bitcoin(
        bitcoin_cli_command('getblockchaininfo'),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(1)

    info = json.loads(result.stdout)
    progress = info.get('verificationprogress')
    if progress is not None:
        print(f'healthy sync={float(progress) * 100:.2f}%', flush=True)
    else:
        print('healthy', flush=True)


if __name__ == '__main__':
    main()
