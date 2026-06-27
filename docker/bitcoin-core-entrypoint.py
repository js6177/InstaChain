#!/usr/bin/env python3
"""Start bitcoind and shut it down gracefully on container stop."""

from __future__ import annotations

import signal
import subprocess
import sys
import time

from bitcoin_core_common import (
    bitcoind_command,
    bitcoin_cli_command,
    popen_as_bitcoin,
    prepare_datadir,
    run_as_bitcoin,
)

SHUTDOWN_TIMEOUT_SEC = 300
_shutting_down = False
_bitcoind_process: subprocess.Popen | None = None


def shutdown(_signum: int | None = None, _frame=None) -> None:
    global _shutting_down, _bitcoind_process

    if _shutting_down:
        return
    _shutting_down = True

    print('Shutting down bitcoind gracefully...', flush=True)
    process = _bitcoind_process
    if process is None or process.poll() is not None:
        print('bitcoind stopped', flush=True)
        raise SystemExit(0)

    stop_result = run_as_bitcoin(
        bitcoin_cli_command('stop'),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if stop_result.returncode != 0:
        process.terminate()

    deadline = time.monotonic() + SHUTDOWN_TIMEOUT_SEC
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(1)

    if process.poll() is None:
        print('bitcoind did not exit cleanly, sending SIGKILL', flush=True)
        process.kill()

    process.wait()
    print('bitcoind stopped', flush=True)
    raise SystemExit(0)


def main() -> None:
    global _bitcoind_process

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    prepare_datadir()
    daemon_args = sys.argv[1:]
    _bitcoind_process = popen_as_bitcoin(bitcoind_command(*daemon_args))
    exit_code = _bitcoind_process.wait()
    raise SystemExit(exit_code)


if __name__ == '__main__':
    main()
