# SigNoz (OpenL2 observability)

Self-hosted SigNoz stack for application logs (Pino → OTLP), Docker container logs, and Redis / PostgreSQL / MongoDB metrics.

## Start

```bash
make observability
# or
docker compose -f docker-compose.yml -f docker-compose.signoz.yml --profile observability up -d
```

- **UI:** http://localhost:8080  
- **OTLP gRPC:** `signoz-otel-collector:4317` (host `localhost:4317`)  
- **OTLP HTTP:** `signoz-otel-collector:4318` (host `localhost:4318`)  
- **MCP:** `http://localhost:${SIGNOZ_MCP_PORT:-8081}/mcp` (needs `SIGNOZ_API_KEY`; Cursor: `.cursor/mcp.json`)

```bash
# Start / restart MCP only (API key from Settings → Service Accounts)
export SIGNOZ_API_KEY="$(cat tmp/signoz-key.txt)"
docker compose -f docker-compose.yml -f docker-compose.signoz.yml --profile observability up -d signoz-mcp
curl -fsS "http://localhost:${SIGNOZ_MCP_PORT:-8081}/livez" && echo " OK"
```

Backend services preload `@openl2/openl2-logger/instrumentation` (OpenTelemetry `NodeSDK`) so Pino logs export over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (default in compose: `http://signoz-otel-collector:4318`).

## Components

| Service | Role |
| --- | --- |
| `signoz` | UI + query API |
| `signoz-clickhouse` / `signoz-zookeeper` | Telemetry storage (`Dockerfile.signoz-clickhouse` bakes in `histogramQuantile`) |
| `signoz-otel-collector` | OTLP ingest → ClickHouse |
| `signoz-mcp` | MCP HTTP server for AI clients (`SIGNOZ_API_KEY` required) |
| `openl2-otel-agent` | Docker logs + redis/postgres/mongo metrics → collector |

Needs ~4GB RAM for Docker.
