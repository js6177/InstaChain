# OpenL2 stress / load testing
#
# Pattern (per backend service):
#   1. Bun `prepare` — build + sign request bodies (Eden/crypto), seed state, start profiler
#   2. k6 image (`docker/Dockerfile.stress-k6`) — HTTP load against the service
#   3. Bun `finalize` — settle, stop profiler, write throughput JSON, print explorer URL
#
# Layer2 ledger push:
#   make stress-test
#   → starts ledger deps, then `scripts/run-layer2ledger-push.sh` (cold + warm)
#
# OAuth manager stress will follow the same prepare → k6 → finalize layout under
# `k6/layer2ledgeroauthmanager/` and `src/layer2ledgeroauthmanager/`.
