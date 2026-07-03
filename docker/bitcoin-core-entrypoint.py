#!/usr/bin/env python3
"""Start bitcoind and shut it down gracefully on container stop."""

from __future__ import annotations

import os
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

# Must stay well under the container's stop_grace_period (30s) so the graceful
# path completes and we os._exit(0) before Docker resorts to SIGKILL.
SHUTDOWN_TIMEOUT_SEC = 20
# The `bitcoin-cli stop` RPC call only signals bitcoind to begin shutting down and
# returns immediately; bound it so a stuck/unauthenticated RPC can never block us.
STOP_RPC_TIMEOUT_SEC = 10
_shutting_down = False
_bitcoind_process: subprocess.Popen | None = None


def _reap_children() -> bool:
    """Reap any exited child processes.

    Returns True once no child processes remain. We reap via waitpid(-1) instead of
    Popen.poll() because bitcoind may be launched through a gosu/exec wrapper whose
    exit Popen.poll() does not reliably observe (it reports the child as still running
    even after bitcoind logs "Shutdown: done").
    """
    try:
        while True:
            pid, _ = os.waitpid(-1, os.WNOHANG)
            if pid == 0:
                # Children exist but none have exited yet.
                return False
    except ChildProcessError:
        # No child processes remain.
        return True


def shutdown(_signum: int | None = None, _frame=None) -> None:
    global _shutting_down, _bitcoind_process

    if _shutting_down:
        return
    _shutting_down = True

    print('Shutting down bitcoind gracefully...', flush=True)
    process = _bitcoind_process
    if process is None:
        print('bitcoind stopped', flush=True)
        os._exit(0)

    try:
        stop_result = run_as_bitcoin(
            bitcoin_cli_command('stop'),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=STOP_RPC_TIMEOUT_SEC,
        )
        stop_ok = stop_result.returncode == 0
    except subprocess.TimeoutExpired:
        print('bitcoin-cli stop timed out; terminating bitcoind directly', flush=True)
        stop_ok = False

    if not stop_ok:
        try:
            process.terminate()
        except ProcessLookupError:
            pass

    deadline = time.monotonic() + SHUTDOWN_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if _reap_children():
            print('bitcoind stopped', flush=True)
            os._exit(0)
        time.sleep(0.2)

    print('bitcoind did not exit in time, sending SIGKILL', flush=True)
    try:
        process.kill()
    except ProcessLookupError:
        pass
    os._exit(0)


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
