# Production-like stack (ENVIRONMENT defaults to prod in docker-compose.yml).
# Generate config first (includes bitcoin.conf + layer2ledgerbridge-config.json):
#   cd backend/setup_scripts && uv run python -m main -env prod -containered true -generate-keys -generate-oauth-config
# Bitcoin chain data is stored in the named volume openl2-bitcoin-core-data.
# bitcoind receives a graceful RPC stop on container shutdown (stop_grace_period: 30s).
# Safe: docker compose up -d --force-recreate bitcoin-core
# Avoid: docker compose down -v  (removes volumes)
prod:
	docker compose up --build
# Dev overlay: debug ports, source bind mounts (ENVIRONMENT defaults to dev in docker-compose.dev.yml).
# Generate config first:
#   cd backend/setup_scripts && uv run python -m main -env dev -containered true -generate-keys -generate-oauth-config
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start all backend services (everything except wallet-web) so the frontend
# can be run on the local machine (e.g. `bun run dev` in frontend/wallet/apps/web)
# against the containerized backend. Uses the dev overlay for debug ports/source mounts.
# Generate config first (see the `dev` target above).
backend-dev:
	ENVIRONMENT=dev docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build \
		layer2ledger-postgres \
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
# Generate test config first:
#   cd backend/setup_scripts && uv run python -m main -env test -containered true -generate-keys -generate-oauth-config
backend-test:
	ENVIRONMENT=test docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test up --build \
		layer2ledger-postgres \
		layer2ledger-redis \
		layer2ledger-mongodb \
		layer2ledgerapihandler \
		layer2ledgerdbwriter \
		layer2ledgeroauthmanager \
		bitcoin-core \
		layer2bridge \
		layer2ledger-testhelper

test:
	python3 run-tests.py

# Tear down the test stack, including profile-gated services (e.g. layer2ledger-testhelper).
test-down:
	docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test down

test-down-v:
	docker compose -f docker-compose.yml -f docker-compose.test.yml --profile test down -v