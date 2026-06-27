#!/bin/sh
# Start bitcoind and shut it down gracefully when the container receives SIGTERM/SIGINT
# (docker compose stop/down, docker stop, etc.).

DATADIR=/home/bitcoin/.bitcoin
CONFIG_SRC=/config/bitcoin.conf
CONF="$DATADIR/bitcoin.conf"
BITCOIND_PID=""
SHUTTING_DOWN=0

read_chain_from_conf() {
  if [ ! -f "$1" ]; then
    return
  fi
  grep -E '^[[:space:]]*chain[[:space:]]*=' "$1" | tail -1 \
    | sed -E 's/^[[:space:]]*chain[[:space:]]*=[[:space:]]*//;s/[[:space:]]+$//;s/^[[:space:]]+//'
}

run_as_bitcoin() {
  if command -v gosu >/dev/null 2>&1 && id bitcoin >/dev/null 2>&1; then
    gosu bitcoin "$@"
  else
    "$@"
  fi
}

run_bitcoin_cli() {
  if [ -n "$CHAIN" ] && [ "$CHAIN" != "main" ] && [ "$CHAIN" != "mainnet" ]; then
    run_as_bitcoin bitcoin-cli -datadir="$DATADIR" -conf="$CONF" "-chain=$CHAIN" "$@"
  else
    run_as_bitcoin bitcoin-cli -datadir="$DATADIR" -conf="$CONF" "$@"
  fi
}

shutdown() {
  if [ "$SHUTTING_DOWN" -eq 1 ]; then
    return
  fi
  SHUTTING_DOWN=1

  echo "Shutting down bitcoind gracefully..."
  if [ -n "$BITCOIND_PID" ] && kill -0 "$BITCOIND_PID" 2>/dev/null; then
    run_bitcoin_cli stop >/dev/null 2>&1 || kill -TERM "$BITCOIND_PID" 2>/dev/null || true

    waited=0
    while kill -0 "$BITCOIND_PID" 2>/dev/null && [ "$waited" -lt 300 ]; do
      sleep 1
      waited=$((waited + 1))
    done

    if kill -0 "$BITCOIND_PID" 2>/dev/null; then
      echo "bitcoind did not exit cleanly, sending SIGKILL"
      kill -KILL "$BITCOIND_PID" 2>/dev/null || true
    fi

    wait "$BITCOIND_PID" 2>/dev/null || true
  fi

  echo "bitcoind stopped"
  exit 0
}

trap shutdown TERM INT

mkdir -p "$DATADIR"

if [ -f "$CONFIG_SRC" ]; then
  cp -f "$CONFIG_SRC" "$CONF"
fi

rm -f "$DATADIR/settings.json"

if [ "$(id -u)" = "0" ] && id bitcoin >/dev/null 2>&1; then
  chown -R bitcoin:bitcoin "$DATADIR"
fi

CHAIN="$(read_chain_from_conf "$CONF")"

if [ -n "$CHAIN" ] && [ "$CHAIN" != "main" ] && [ "$CHAIN" != "mainnet" ]; then
  run_as_bitcoin bitcoind -printtoconsole -conf="$CONF" "-chain=$CHAIN" "$@" &
else
  run_as_bitcoin bitcoind -printtoconsole -conf="$CONF" "$@" &
fi
BITCOIND_PID=$!

wait "$BITCOIND_PID"
exit $?
