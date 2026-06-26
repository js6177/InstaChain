#!/bin/sh
# Copy the read-only host config into the writable datadir, then start bitcoind.
# Pass -chain explicitly so network selection is not overridden by stale settings.json
# or a previous mainnet sync in the data volume.
set -e

DATADIR=/home/bitcoin/.bitcoin
CONFIG_SRC=/config/bitcoin.conf
CONF="$DATADIR/bitcoin.conf"

mkdir -p "$DATADIR"

if [ -f "$CONFIG_SRC" ]; then
  cp -f "$CONFIG_SRC" "$CONF"
fi

# Drop persisted runtime settings from a prior run (may pin chain=main).
rm -f "$DATADIR/settings.json"

CHAIN=""
if [ -f "$CONF" ]; then
  CHAIN=$(grep -E '^[[:space:]]*chain[[:space:]]*=' "$CONF" | tail -1 | sed 's/^[[:space:]]*chain[[:space:]]*=[[:space:]]*//;s/[[:space:]]*$//')
fi

if [ -n "$CHAIN" ] && [ "$CHAIN" != "main" ] && [ "$CHAIN" != "mainnet" ]; then
  exec bitcoind -printtoconsole -conf="$CONF" "-chain=$CHAIN" "$@"
fi

exec bitcoind -printtoconsole -conf="$CONF" "$@"
