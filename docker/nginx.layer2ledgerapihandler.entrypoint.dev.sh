#!/bin/sh
# Resolve apihandler replica IPs into a keepalive upstream and reload on change.
set -eu

BACKEND_HOST="${BACKEND_HOST:-layer2ledgerapihandler}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
KEEPALIVE="${NGINX_UPSTREAM_KEEPALIVE:-128}"
REFRESH_SEC="${NGINX_UPSTREAM_REFRESH_SEC:-2}"
UPSTREAM_CONF="${UPSTREAM_CONF:-/etc/nginx/upstream-apihandlers.conf}"
IPS_STATE="${IPS_STATE:-/tmp/upstream-apihandlers.ips}"

resolve_ips() {
	# Prefer ahosts (may return every A record). Fall back to repeated hosts
	# probes because Docker DNSRR sometimes answers one IP per query.
	ips="$(getent ahosts "$BACKEND_HOST" 2>/dev/null | awk '{print $1}' | sort -u || true)"
	if [ -z "$ips" ]; then
		i=0
		while [ "$i" -lt 24 ]; do
			getent hosts "$BACKEND_HOST" 2>/dev/null | awk '{print $1}' || true
			i=$((i + 1))
		done | sort -u
	else
		printf '%s\n' "$ips"
	fi
}

write_upstream() {
	ips="$(resolve_ips)"
	if [ -z "$ips" ]; then
		return 1
	fi

	{
		echo "upstream apihandlers {"
		echo "	least_conn;"
		for ip in $ips; do
			echo "	server ${ip}:${BACKEND_PORT};"
		done
		echo "	keepalive ${KEEPALIVE};"
		echo "	keepalive_requests 1000;"
		echo "	keepalive_timeout 60s;"
		echo "}"
	} >"${UPSTREAM_CONF}.tmp"
	mv "${UPSTREAM_CONF}.tmp" "$UPSTREAM_CONF"
	printf '%s\n' "$ips" | tr '\n' ' ' | sed 's/[[:space:]]*$/\n/' >"$IPS_STATE"
	return 0
}

echo "nginx entrypoint: waiting for ${BACKEND_HOST} DNS"
until write_upstream; do
	sleep 1
done
echo "nginx entrypoint: upstream backends: $(cat "$IPS_STATE")"

nginx -t
nginx

prev="$(cat "$IPS_STATE")"
while true; do
	sleep "$REFRESH_SEC"
	if write_upstream; then
		cur="$(cat "$IPS_STATE")"
		if [ "$cur" != "$prev" ]; then
			echo "nginx entrypoint: upstream changed: $cur"
			if nginx -t; then
				nginx -s reload
				prev="$cur"
			fi
		fi
	fi
done
