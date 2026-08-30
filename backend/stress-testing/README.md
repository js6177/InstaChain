# OpenL2 stress / load testing

## Pattern (per backend service)

1. Bun `prepare` — build + sign request bodies (Eden/crypto), seed state, start profiler
2. k6 image (`docker/Dockerfile.stress-k6`) — HTTP load against the service
3. Bun `finalize` — settle, stop profiler, write throughput JSON, print explorer URL

## Layer2 ledger push

```bash
make stress-test
```

Starts ledger deps, then `bun scripts/run-layer2ledger-push.ts` (cold + warm).

## Redis diagnostics

Profiler session keys and related diagnostic app data are stored on a dedicated
`redis-diagnostics` instance (test/dev only), so profiler traffic does not contend
with `redis-transactions` / `redis-addressbalance`. Observational probes below still
target the hot-path Redis services.

When `redis-diagnostics` is configured, apihandler/dbwriter also sample every 500ms:
- ioredis `commandQueue.length` (transactions + address-balance clients)
- Bun `monitorEventLoopDelay` mean / max / p99

Samples are also noted on the request hot path (so queue depth is visible while work
is in flight). Timer catch-up after a blocked event loop is backdated by histogram
max so spikes plot inside the load window, not after it.

Automatic during `make stress-test`:

- **prepare:** ioredis PING RTT baseline, INFO commandstats, CLIENT LIST, SLOWLOG RESET
- **before k6:** `redis-cli --latency` via `scripts/redis-latency-probe.ts`
- **during k6:** `monitor-redis` every `REDIS_DURING_INTERVAL_MS` (default 1000ms)
  - captures PING latency-history + CLIENT LIST on the compose network
  - host also samples cgroup CPU/memory at 1Hz for Redis, apihandler (all
    replicas), dbwriter, nginx, pgbouncer, and postgres. CPU is an instantaneous
    rate from `cpu.stat` usage deltas (100% ≈ one host CPU); memory is current
    `memory.current`. (Podman `stats` CPU/AvgCPU is a lifetime average and is
    not used.)
- **finalize:** post-load INFO/commandstats/SLOWLOG/CLIENT LIST; findings embedded in
  the throughput report (`redis` field), attached to the profiler session report
  (shown on `/explorer/stats/:sessionId`), and printed with the stress summary

### Outputs under `.test-output/stress/`

- `redis-baseline-{cold,warm}.json`
- `redis-during-{cold,warm}.jsonl`
- `redis-docker-stats-{cold,warm}.jsonl`
- `redis-diagnostics-{cold,warm}.json`
- `redis-cli-latency-*.txt` / `redis-cli-latency-history-*.txt`
- `test-layer2ledger-stress.throughput.json` (includes `.redis`)

Skip Redis probes:

```bash
STRESS_REDIS_LATENCY=0 make stress-test
```

## OAuth manager

OAuth manager stress will follow the same prepare → k6 → finalize layout under
`k6/layer2ledgeroauthmanager/` and `src/layer2ledgeroauthmanager/`.
