# SigNoz (OpenL2 observability)

Self-hosted SigNoz stack for application logs (Pino → OTLP), container metrics, and Redis / PostgreSQL / MongoDB metrics.

## Start

```bash
make observability
# or (Docker):
docker compose -f docker-compose.yml -f docker-compose.signoz.yml --profile observability up -d
# or (rootless Podman — enable socket first: systemctl --user enable --now podman.socket):
podman compose -f docker-compose.yml -f docker-compose.signoz.yml \
  -f docker-compose.signoz-podman.yml --profile observability up -d
```

Under Podman, `openl2-otel-agent` uses the Podman API socket for `docker_stats` and skips `/var/lib/docker/containers` log scraping (Docker-only).

- **UI:** http://localhost:8080  
- **OTLP gRPC:** `signoz-otel-collector:4317` (host `localhost:4317`)  
- **OTLP HTTP:** `signoz-otel-collector:4318` (host `localhost:4318`)  
- **MCP:** `http://localhost:${SIGNOZ_MCP_PORT:-8081}/mcp` (needs `SIGNOZ_API_KEY`; Cursor: `.cursor/mcp.json`)

```bash
# Start / restart MCP only (API key from Settings → Service Accounts)
export SIGNOZ_API_KEY="$(cat tmp/signoz-key.txt)"
# Use the same compose engine as the rest of the stack (podman or docker):
$(CONTAINER_CLI:-podman) compose -f docker-compose.yml -f docker-compose.signoz.yml --profile observability up -d signoz-mcp
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
| `openl2-otel-agent` | Container stats + redis/postgres/mongo metrics → collector (Docker also scrapes container JSON logs) |

Needs ~4GB RAM for Docker.

## pushTransaction concurrency profiler

`Profiler` in `backend/layer2ledger` logs start/end events with a cross-replica Redis in-flight counter:

- Bodies: `pushTransaction profile start` / `pushTransaction profile end`
- Attribute: `concurrent` (number) — in-flight count after INCR/DECR
- End also includes `elapsed_ms`

**SigNoz Logs explorer**

1. Filter: `body CONTAINS 'pushTransaction profile'`
2. Chart attribute `concurrent` over time with aggregation **Max** (and optionally **Avg**)
3. Prefer start events (or Max) so end-of-wave zeros do not flatten the series
4. Cumulative finishes: filter `body = 'pushTransaction profile end'`, chart log **count** over time with a cumulative / running-sum transform
5. Optional: chart `elapsed_ms` on end events for handler latency vs concurrency

Stress clears `Layer2Profiler:pushTransaction:in_flight` before each push wave. Default stress size is 50k txs/round.

The stress entrypoint runs `bun test/stress.test.ts` (not `bun test`) and re-execs with `BUN_CONFIG_MAX_HTTP_REQUESTS=1024` so client concurrency is not stuck at Bun’s default 256.

Apihandler structured logs include `replica_id` (Docker Compose `HOSTNAME`, e.g. `…-layer2ledgerapihandler-3`). In SigNoz, group or filter performance logs by `replica_id` to compare throughput/latency across replicas. Override with `OPENL2_REPLICA_ID` if needed.

**Wallet Explorer — session chart**

After a stress run (or any profiler session), open `/explorer/stats/<session_id>` (or **Profiler Stats** in the Explorer UI). That page calls `POST /health/GetProfilerSession` and charts:

- **Concurrency**: average replica in-flight
- **Cumulative**: pushTransaction entries / exits + dbwriter writes
- **Redis pending queue**: pending transaction depth (one sample per dbwriter loop)
- **Dbwriter activity**: square waves for Postgres write / Redis housekeeping / sleep
- **pushTransaction section timing**: rolling-average ms per section (validate, verify signature, acquire lock, duplicate check, get balance, enqueue)

**Total txs/s** is `writes_total / (throughput_end_ms - throughput_start_ms)`: from the first apihandler `pushTransaction` span start until the Redis pending queue transitions to 0 for the last time. Bounds are ms since profiler start (`dbwriter.throughput_start_ms` / `throughput_end_ms`). Drag the green/red vertical markers on any chart to adjust those bounds.


## Nginx hit logging

Each proxied request is logged as:

```text
event=nginx_hit time=... method=... uri=... status=... ...
```

to `/var/log/nginx/throughput.log` and **stdout** (scraped into SigNoz via the Docker log agent).

**SigNoz — cumulative push hits at nginx**

1. Filter: `body CONTAINS 'event=nginx_hit' AND body CONTAINS 'uri=/transfer/push_transaction'`
2. Chart log **count** over time with a cumulative / running-sum transform

**Stress stub_status samples** (concurrent connections at nginx)

During each push wave the stress test polls `/nginx-status` every `STRESS_NGINX_SAMPLE_MS` (default 250ms) and logs:

```text
nginx profile sample active=... writing=... waiting=... requests_since_wave=... ...
```

Filter: `body CONTAINS 'nginx profile sample'`. Parse `active=` / `writing=` from the body (also written to `.test-output/stress/nginx-samples-*.json`).
Note: `requests_since_wave` includes the status polls themselves; prefer access-log push counts for exact cumulative push volume.
