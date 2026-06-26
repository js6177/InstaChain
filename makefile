# Production-like stack (ENVIRONMENT defaults to prod in docker-compose.yml).
# Generate config first: cd backend/setup_scripts && uv run python -m main -env prod -generate-keys -generate-oauth-config
prod:
	docker compose up --build
# Dev overlay: debug ports, source bind mounts (ENVIRONMENT defaults to dev in docker-compose.dev.yml).
# Generate config first: cd backend/setup_scripts && uv run python -m main -env dev -generate-keys -generate-oauth-config
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build