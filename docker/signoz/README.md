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

Backend services preload `@openl2/openl2-logger/instrumentation` (OpenTelemetry `NodeSDK`) so Pino logs export over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (default in compose: `http://signoz-otel-collector:4318`).

## Components

| Service | Role |
| --- | --- |
| `signoz` | UI + query API |
| `signoz-clickhouse` / `signoz-zookeeper` | Telemetry storage (`Dockerfile.signoz-clickhouse` bakes in `histogramQuantile`) |
| `signoz-otel-collector` | OTLP ingest → ClickHouse |
| `openl2-otel-agent` | Docker logs + redis/postgres/mongo metrics → collector |

Needs ~4GB RAM for Docker.
