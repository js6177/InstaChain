#!/usr/bin/env bash
# Host-side orchestrator for layer2ledger push stress (prepare → k6 → finalize).
# Invoked by `make stress-test` so the makefile stays thin like other targets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

CONTAINER_CLI="${CONTAINER_CLI:-}"
if [[ -z "$CONTAINER_CLI" ]]; then
	if command -v podman >/dev/null 2>&1; then
		CONTAINER_CLI=podman
	else
		CONTAINER_CLI=docker
	fi
fi
COMPOSE="${CONTAINER_CLI} compose"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.test.yml)

STRESS_TX_COUNT="${STRESS_TX_COUNT:-50000}"
STRESS_CONCURRENCY="${STRESS_CONCURRENCY:-2000}"
STRESS_VUS="${STRESS_VUS:-1024}"
STRESS_SETTLE_TIMEOUT_MS="${STRESS_SETTLE_TIMEOUT_MS:-600000}"
STRESS_SETTLE_CONCURRENCY="${STRESS_SETTLE_CONCURRENCY:-}"
STRESS_K6_MAX_DURATION="${STRESS_K6_MAX_DURATION:-15m}"
STRESS_RESULT_FILE="${STRESS_RESULT_FILE:-/stress-data/test-layer2ledger-stress.throughput.json}"

run_prep() {
	local mode="$1"
	local phase="$2"
	ENVIRONMENT=test $COMPOSE "${COMPOSE_FILES[@]}" --profile test \
		run --rm --quiet-pull --no-deps \
		-e "STRESS_TX_COUNT=${STRESS_TX_COUNT}" \
		-e "STRESS_CONCURRENCY=${STRESS_CONCURRENCY}" \
		-e "STRESS_VUS=${STRESS_VUS}" \
		-e "STRESS_SETTLE_TIMEOUT_MS=${STRESS_SETTLE_TIMEOUT_MS}" \
		-e "STRESS_SETTLE_CONCURRENCY=${STRESS_SETTLE_CONCURRENCY}" \
		-e "STRESS_RESULT_FILE=${STRESS_RESULT_FILE}" \
		test-stress-layer2ledger "${phase}" --service layer2ledger --api push --mode "${mode}"
}

run_k6() {
	ENVIRONMENT=test $COMPOSE "${COMPOSE_FILES[@]}" --profile test \
		run --rm --quiet-pull --no-deps \
		-e "STRESS_VUS=${STRESS_VUS}" \
		-e "STRESS_K6_MAX_DURATION=${STRESS_K6_MAX_DURATION}" \
		test-stress-k6 \
		|| echo "k6 exited non-zero (thresholds/errors); continuing to finalize"
}

for mode in cold warm; do
	echo ""
	echo "======== stress prepare mode=${mode} ========"
	run_prep "${mode}" prepare
	echo ""
	echo "======== stress k6 mode=${mode} ========"
	run_k6
	echo ""
	echo "======== stress finalize mode=${mode} ========"
	run_prep "${mode}" finalize
done
