# Production-like stack (ENVIRONMENT defaults to prod in docker-compose.yml).
# Generate config first (includes bitcoin.conf + layer2ledgerbridge-config.json):
#   cd backend/setup_scripts && uv run python -m main -env prod -containered true -generate-keys -generate-oauth-config
# Bitcoin chain data is stored in the named volume openl2-bitcoin-core-data.
# bitcoind receives a graceful RPC stop on container shutdown (stop_grace_period: 5m).
# Safe: docker compose up -d --force-recreate bitcoin-core
# Avoid: docker compose down -v  (removes volumes)
prod:
	docker compose up --build
# Dev overlay: debug ports, source bind mounts (ENVIRONMENT defaults to dev in docker-compose.dev.yml).
# Generate config first:
#   cd backend/setup_scripts && uv run python -m main -env dev -containered true -generate-keys -generate-oauth-config
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

test:
	python3 run-tests.py