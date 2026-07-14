#!/usr/bin/env bash
# Start Chrome with CDP enabled for VS Code attach (Chrome >= 136 requires a
# non-default user-data-dir; --profile-directory alone is not enough).
set -euo pipefail

DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"
USER_DATA_DIR="${CHROME_DEBUG_USER_DATA_DIR:-${HOME}/.chrome-vscode-debug}"

mkdir -p "${USER_DATA_DIR}"

exec google-chrome \
  --remote-debugging-port="${DEBUG_PORT}" \
  --user-data-dir="${USER_DATA_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  "$@"
