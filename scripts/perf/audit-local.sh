#!/usr/bin/env bash
# Build the webapp for production, serve it like production, and run
# Lighthouse against it (scripts/perf/lighthouse.ts).
#
#   scripts/perf/audit-local.sh <label> [runs] [path]
#     label  names the results directory: .perf/<label>/
#     runs   default 5
#     path   page to audit, default /
#
# Env:
#   NO_BUILD=1        reuse the existing dist/ (it must have been built by this
#                     script: the couch URL is baked in at build time)
#   SKIP_PRERENDER=1  skip the prerender step (then / serves the bare shell,
#                     not the prerendered home page production serves)
#   PERF_PORT         default 4173
#   NO_BR=1           serve gzip only, ignoring the build's .br sidecars (a server
#                     without precompressed brotli; serve-dist.mjs --no-br)
#
# The build points the data layer at this server's /couch, which answers the
# boot's session check like production does for a visitor with no session
# (see serve-dist.mjs). Everything else is the normal production build.
set -euo pipefail

cd "$(dirname "$0")/../.."

label="${1:?usage: scripts/perf/audit-local.sh <label> [runs] [path]}"
runs="${2:-5}"
path="${3:-/}"
port="${PERF_PORT:-4173}"

# Something else on the port (a leftover server) would answer instead of ours.
if curl -s -o /dev/null "http://localhost:${port}/"; then
  echo "[audit-local] port ${port} is already in use; stop that server first" >&2
  exit 1
fi

if [[ -z "${NO_BUILD:-}" ]]; then
  echo "[audit-local] building (couch → localhost:${port}/couch/)"
  VITE_COUCH_BASE_URL="localhost:${port}/couch/" \
  VITE_COUCHDB_PROTOCOL=http \
    yarn build:webapp
fi

node scripts/perf/serve-dist.mjs --port "$port" ${NO_BR:+--no-br} &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  curl -sf -o /dev/null "http://localhost:${port}/" && break
  sleep 0.1
done

npx tsx scripts/perf/lighthouse.ts "http://localhost:${port}${path}" --runs "$runs" --label "$label"
