# Container engine: podman (preferred when installed) or docker.
# Override: make CONTAINER_CLI=docker …  or  export CONTAINER_CLI=podman
CONTAINER_CLI ?= $(shell if command -v podman >/dev/null 2>&1; then echo podman; else echo docker; fi)
COMPOSE = $(CONTAINER_CLI) compose

# Production-like stack (ENVIRONMENT defaults to prod in docker-compose.yml).
# First-time setup (generate keys, start bitcoin-core, wait for sync, import wallet):
#   bun run setup:first-time -- -env=prod
# Or regenerate wallet only (keeps synced chain data):
#   bun run setup:first-time -- -env=prod -overwrite-wallet
# Bitcoin chain data is stored in the named volume openl2-bitcoin-core-data.
# bitcoind receives a graceful RPC stop on container shutdown (stop_grace_period: 30s).
# Safe: $(COMPOSE) up -d --force-recreate bitcoin-core
# Avoid: $(COMPOSE) down -v  (removes volumes)
prod:
	$(COMPOSE) up --build
# Dev overlay: debug ports, source bind mounts (ENVIRONMENT defaults to dev in docker-compose.dev.yml).
# First-time setup:
#   bun run setup:first-time -- -env=dev
dev:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start all backend services (everything except wallet-web) so the frontend
# can be run on the local machine (e.g. `bun run dev` in frontend/wallet/apps/web)
# against the containerized backend. Uses the dev overlay for debug ports/source mounts.
# Generate config first (see the `dev` target above).
backend-dev:
	ENVIRONMENT=dev $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		redis-transactions redis-addressbalance \
		layer2ledger-mongodb \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledgeroauthmanager \
		bitcoin-core \
		layer2bridge

# SigNoz UI + OTLP collector + infra telemetry agent.
# UI: http://localhost:8080  |  OTLP: localhost:4317 (gRPC), localhost:4318 (HTTP)
# MCP: http://localhost:8081/mcp (export SIGNOZ_API_KEY first; optional SIGNOZ_MCP_PORT)
# Requires infra services from the base compose (postgres/redis/mongodb) for metric scrapes.
# Under Podman, also applies docker-compose.signoz-podman.yml (API socket; no Docker log dir).
SIGNOZ_COMPOSE_FILES = -f docker-compose.yml -f docker-compose.signoz.yml
ifeq ($(CONTAINER_CLI),podman)
SIGNOZ_COMPOSE_FILES += -f docker-compose.signoz-podman.yml
endif

observability:
	ENVIRONMENT=$${ENVIRONMENT:-test} $(COMPOSE) $(SIGNOZ_COMPOSE_FILES) --profile observability up -d --build \
		layer2ledger-postgres \
		redis-transactions redis-addressbalance \
		layer2ledger-mongodb \
		signoz-zookeeper \
		signoz-clickhouse \
		signoz-telemetrystore-migrator \
		signoz \
		signoz-otel-collector \
		signoz-mcp \
		openl2-otel-agent

# Start all backend services (everything except wallet-web) with ENVIRONMENT=test,
# including the layer2ledger-testhelper (profile: test) used for seeding. This lets the
# frontend run locally against the test backend (e.g. to exercise the ledger integration
# tests). Does not start the one-shot test-runner containers.
# First-time setup:
#   bun run setup:first-time -- -env=test
backend-test:
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test up --build \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-2} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		redis-transactions redis-addressbalance \
		layer2ledger-mongodb \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledgeroauthmanager \
		bitcoin-core \
		layer2bridge \
		layer2ledger-testhelper
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --force-recreate --no-deps layer2ledgerapihandler-nginx

# Throughput stress via k6 (not part of `make test` / test:docker).
# Starts layer2ledger deps only, then runs backend/stress-testing/scripts/run-layer2ledger-push.sh
# (prepare → k6 → finalize for cold + warm).
# Examples:
#   make stress-test
#   STRESS_TX_COUNT=50000 STRESS_VUS=1024 make stress-test
stress-test:
	mkdir -p .test-output/stress
	chmod -R a+rwX .test-output/stress || true
	ENVIRONMENT=test bun run --filter @openl2/setup-scripts ensure-compose-build -- \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledger-testhelper \
		test-stress-layer2ledger \
		test-stress-k6
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-8} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		redis-transactions redis-addressbalance \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledger-testhelper
	# Recreate nginx after apihandler so it never keeps stale replica IPs from a prior run.
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull --force-recreate --no-deps layer2ledgerapihandler-nginx
	CONTAINER_CLI=$(CONTAINER_CLI) \
		STRESS_TX_COUNT=$${STRESS_TX_COUNT:-50000} \
		STRESS_CONCURRENCY=$${STRESS_CONCURRENCY:-2000} \
		STRESS_VUS=$${STRESS_VUS:-1024} \
		STRESS_SETTLE_TIMEOUT_MS=$${STRESS_SETTLE_TIMEOUT_MS:-600000} \
		STRESS_SETTLE_CONCURRENCY=$${STRESS_SETTLE_CONCURRENCY:-} \
		STRESS_K6_MAX_DURATION=$${STRESS_K6_MAX_DURATION:-15m} \
		./backend/stress-testing/scripts/run-layer2ledger-push.sh

# Lightweight GET /health stress through nginx (no seed/sign/settle/db path).
# Builds images only when docker-relevant source changes (FORCE_COMPOSE_BUILD=1 to force).
# Examples:
#   make stress-test-health
#   STRESS_REQUEST_COUNT=50000 STRESS_CONCURRENCY=2000 make stress-test-health
#   STRESS_HEALTH_PATH=/nginx-health make stress-test-health   # nginx-only (no upstream)
stress-test-health:
	mkdir -p .test-output/stress
	ENVIRONMENT=test bun run --filter @openl2/setup-scripts ensure-compose-build -- \
		layer2ledgerapihandler \
		test-layer2ledger-stress
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-2} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		redis-transactions redis-addressbalance \
		layer2ledgerapihandler \
		layer2ledgerapihandler-nginx
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull --force-recreate --no-deps layer2ledgerapihandler-nginx
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		run --rm --quiet-pull \
		-v "$(CURDIR)/.test-output/stress:/test-output" \
		-e RUN_LEDGER_HTTP_STRESS=0 \
		-e RUN_LEDGER_HEALTH_STRESS=1 \
		-e "STRESS_REQUEST_COUNT=$${STRESS_REQUEST_COUNT:-$${STRESS_TX_COUNT:-10000}}" \
		-e "STRESS_CONCURRENCY=$${STRESS_CONCURRENCY:-2000}" \
		-e "STRESS_HEALTH_PATH=$${STRESS_HEALTH_PATH:-/health}" \
		-e STRESS_HEALTH_RESULT_FILE=/test-output/test-layer2ledger-health-stress.throughput.json \
		-v "$(CURDIR)/backend/layer2ledger/test:/app/backend/layer2ledger/test:ro" \
		test-layer2ledger-stress

# getBalance HTTP stress matrix (seeds via testhelper; Explorer table + charts).
# Default matrix: calls 1000,2000 × addresses 1,10,100 × cache% 10,50,100 × nonzero% 50,25 (36 cells).
# Override any dimension with a comma list, e.g. STRESS_GET_BALANCE_CALL_COUNT=1000
# Examples:
#   make stress-test-get-balance
#   STRESS_GET_BALANCE_CALL_COUNT=1000 STRESS_GET_BALANCE_ADDRESS_COUNT=10 \
#     STRESS_GET_BALANCE_CACHE_PCT=100 STRESS_GET_BALANCE_NONZERO_PCT=50 make stress-test-get-balance
stress-test-get-balance:
	mkdir -p .test-output/stress
	ENVIRONMENT=test bun run --filter @openl2/setup-scripts ensure-compose-build -- \
		layer2ledgerapihandler \
		layer2ledger-testhelper \
		test-layer2ledger-stress
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-2} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		redis-transactions redis-addressbalance \
		layer2ledgerapihandler \
		layer2ledger-testhelper
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --quiet-pull --force-recreate --no-deps layer2ledgerapihandler-nginx
	ENVIRONMENT=test $(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test \
		run --rm --quiet-pull \
		-v "$(CURDIR)/.test-output/stress:/test-output" \
		-e RUN_LEDGER_HTTP_STRESS=0 \
		-e RUN_LEDGER_HEALTH_STRESS=0 \
		-e RUN_LEDGER_GET_BALANCE_STRESS=1 \
		-e "STRESS_GET_BALANCE_CALL_COUNT=$${STRESS_GET_BALANCE_CALL_COUNT:-}" \
		-e "STRESS_GET_BALANCE_ADDRESS_COUNT=$${STRESS_GET_BALANCE_ADDRESS_COUNT:-}" \
		-e "STRESS_GET_BALANCE_CACHE_PCT=$${STRESS_GET_BALANCE_CACHE_PCT:-}" \
		-e "STRESS_GET_BALANCE_NONZERO_PCT=$${STRESS_GET_BALANCE_NONZERO_PCT:-}" \
		-e "STRESS_CONCURRENCY=$${STRESS_CONCURRENCY:-2000}" \
		-e STRESS_GET_BALANCE_RESULT_FILE=/test-output/test-layer2ledger-get-balance-stress.json \
		-e PROFILER_SESSION_OUTPUT_DIR=/test-output \
		test-layer2ledger-stress

# Unit + integration containers only (no stress). Stress: make stress-test
test:
	bun run test:docker

# Tear down the test stack, including profile-gated services (e.g. layer2ledger-testhelper).
test-down:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test down

test-down-v:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.test.yml --profile test down -v

# Permanently remove all OpenL2 containers and attached volumes.
# Interactive confirmation: press 'c' to continue.
# Non-interactive: bun run uninstall -- -noprompt
uninstall:
	bun run uninstall
