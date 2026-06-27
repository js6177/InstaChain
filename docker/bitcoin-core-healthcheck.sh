#!/bin/sh
# Report healthy when Bitcoin Core RPC responds; include optional sync % from verificationprogress.
CONF=/home/bitcoin/.bitcoin/bitcoin.conf
DATADIR=/home/bitcoin/.bitcoin

read_chain_from_conf() {
  if [ ! -f "$1" ]; then
    return
  fi
  grep -E '^[[:space:]]*chain[[:space:]]*=' "$1" | tail -1 \
    | sed -E 's/^[[:space:]]*chain[[:space:]]*=[[:space:]]*//;s/[[:space:]]+$//;s/^[[:space:]]+//'
}

CHAIN="$(read_chain_from_conf "$CONF")"

if [ -n "$CHAIN" ] && [ "$CHAIN" != "main" ] && [ "$CHAIN" != "mainnet" ]; then
  INFO=$(bitcoin-cli -datadir="$DATADIR" -conf="$CONF" "-chain=$CHAIN" getblockchaininfo 2>/dev/null) || exit 1
else
  INFO=$(bitcoin-cli -datadir="$DATADIR" -conf="$CONF" getblockchaininfo 2>/dev/null) || exit 1
fi

progress=$(printf '%s' "$INFO" | tr ',' '\n' | grep '"verificationprogress"' | sed 's/[^0-9.eE+-]*//g' | head -1)
if [ -n "$progress" ]; then
  pct=$(awk "BEGIN {printf \"%.2f\", $progress * 100}")
  echo "healthy sync=${pct}%"
else
  echo "healthy"
fi

exit 0
