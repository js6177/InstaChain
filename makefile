# Production-like stack (ENVIRONMENT defaults to prod in docker-compose.yml).
# First-time setup (generate keys, start bitcoin-core, wait for sync, import wallet):
#   bun run setup:first-time -- -env=prod
# Or regenerate wallet only (keeps synced chain data):
#   bun run setup:first-time -- -env=prod -overwrite-wallet
# Bitcoin chain data is stored in the named volume openl2-bitcoin-core-data.
# bitcoind receives a graceful RPC stop on container shutdown (stop_grace_period: 30s).
# Safe: docker compose up -d --force-recreate bitcoin-core
# Avoid: docker compose down -v  (removes volumes)
prod:
	docker compose up --build
# Dev overlay: debug ports, source bind mounts (ENVIRONMENT defaults to dev in docker-compose.dev.yml).
# First-time setup:
#   bun run setup:first-time -- -env=dev
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start all backend services (everything except wallet-web) so the frontend
# can be run on the local machine (e.g. `bun run dev` in frontend/wallet/apps/web)
# against the containerized backend. Uses the dev overlay for debug ports/source mounts.
# Generate config first (see the `dev` target above).
backend-dev:
	ENVIRONMENT=dev docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		layer2ledger-redis \
		layer2ledger-mongodb \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledgeroauthmanager \
		bitcoin-core \
		layer2bridge

# Start all backend services (everything except wallet-web) with ENVIRONMENT=test,
# including the layer2ledger-testhelper (profile: test) used for seeding. This lets the
# frontend run locally against the test backend (e.g. to exercise the ledger integration
# tests). Does not start the one-shot test-runner containers.
# First-time setup:
#   bun run setup:first-time -- -env=test
backend-test:
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-2} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		layer2ledger-redis \
		layer2ledger-mongodb \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledgeroauthmanager \
		bitcoin-core \
		layer2bridge \
		layer2ledger-testhelper
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --force-recreate --no-deps layer2ledgerapihandler-nginx

# Rebuild and run only the layer2ledger HTTP stress test (not the full suite).
# Ensures apihandler, dbwriter, and testhelper are up, then `compose run --build`.
# Examples:
#   make stress-test
#   STRESS_TX_COUNT=51000 STRESS_CONCURRENCY=20 make stress-test
# Note: plain `docker compose run` does NOT rebuild the image unless you pass --build.
stress-test:
	mkdir -p .test-output/stress
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --build \
		--scale layer2ledgerapihandler=$${LAYER2LEDGER_APIHANDLER_REPLICAS:-2} \
		layer2ledger-postgres \
		layer2ledger-pgbouncer \
		layer2ledger-redis \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledger-testhelper
	# Recreate nginx after apihandler so it never keeps stale replica IPs from a prior run.
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test \
		up -d --force-recreate --no-deps layer2ledgerapihandler-nginx
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test \
		run --rm --build \
		-v "$(CURDIR)/.test-output/stress:/test-output" \
		-e "STRESS_TX_COUNT=$${STRESS_TX_COUNT:-100}" \
		-e "STRESS_CONCURRENCY=$${STRESS_CONCURRENCY:-10}" \
		-e "STRESS_SETTLE_TIMEOUT_MS=$${STRESS_SETTLE_TIMEOUT_MS:-120000}" \
		test-layer2ledger-stress

test:
	bun run test:docker

# Tear down the test stack, including profile-gated services (e.g. layer2ledger-testhelper).
test-down:
	docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test down

test-down-v:
	docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test down -v

# Permanently remove all OpenL2 docker containers and attached volumes.
# Interactive confirmation: press 'c' to continue.
# Non-interactive: bun run uninstall -- -noprompt
uninstall:
	bun run uninstall
