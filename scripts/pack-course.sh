#!/usr/bin/env bash
# pack-course.sh — regenerate public/static-courses/, the packed course the app
# loads when it has no CouchDB (the default for a fresh clone).
#
# Seeds a CouchDB from the committed pipeline outputs
# (content/phoneticAnalytics/outputs-v2/, via `yarn db:seed`), then runs
# `skuilder pack` on it. Run this after changing the curriculum and commit the
# result; CI repacks and fails if the committed copy is stale.
#
# Needs docker, for a throwaway CouchDB. Running the app does not.
#
# Usage:
#   yarn pack:course
#   COUCHDB_URL=http://localhost:5984 COUCHDB_USER=admin COUCHDB_PASSWORD=password yarn pack:course
#       # use a CouchDB you already have. db:seed WIPES that course DB first:
#       # only point this at a scratch server.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COURSE_ID="$(node -p "require('./skuilder.config.json').course")"
OUT="$ROOT/public/static-courses"
USER="${COUCHDB_USER:-admin}"
PASS="${COUCHDB_PASSWORD:-password}"

if [ -z "${COUCHDB_URL:-}" ]; then
  command -v docker >/dev/null || { echo "pack-course: needs docker (or set COUCHDB_URL)" >&2; exit 1; }
  PORT="${PACK_COUCH_PORT:-5995}"
  NAME="lp-pack-couch-$$"
  echo "Starting throwaway CouchDB ($NAME) on 127.0.0.1:$PORT..."
  docker run -d --rm --name "$NAME" -p "127.0.0.1:$PORT:5984" \
    -e COUCHDB_USER="$USER" -e COUCHDB_PASSWORD="$PASS" couchdb:3.4.3 >/dev/null
  trap 'docker stop "$NAME" >/dev/null' EXIT
  URL="http://127.0.0.1:$PORT"
else
  URL="$COUCHDB_URL"
fi

for _ in $(seq 1 60); do
  curl -sf -m 2 "$URL/" >/dev/null && break
  sleep 1
done
curl -sf -m 2 "$URL/" >/dev/null || { echo "pack-course: CouchDB at $URL not reachable" >&2; exit 1; }
# System DBs a fresh single-node CouchDB doesn't create on its own (412 if present: fine).
for db in _users _replicator; do
  curl -s -o /dev/null -u "$USER:$PASS" -X PUT "$URL/$db"
done

[ -d content/phoneticAnalytics/node_modules ] || yarn --cwd content/phoneticAnalytics install --immutable
yarn --cwd content/phoneticAnalytics db:seed --url "$URL" -u "$USER" -p "$PASS" --yes

rm -rf "${OUT:?}/$COURSE_ID"
yarn skuilder pack "$COURSE_ID" -s "$URL" -u "$USER" -p "$PASS" -o "$OUT"

# Drop what changes on every run, so an unchanged course packs byte-identical
# and CI can compare with `git diff`. None of it is read in static mode:
#  - pack timestamps (manifest `lastUpdated`, each index's `generatedAt`);
#  - the seed's upload record (`cards-upload-<time>`, UPLOAD_META), which the
#    admin content view reads only against CouchDB;
#  - CourseConfig's `contentVersion` ("<git sha> <time>", changes with every
#    commit) and its `_rev` (derived from it).
node - "$OUT/$COURSE_ID" <<'EOF'
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const write = (f, d, compact) =>
  fs.writeFileSync(path.join(dir, f), compact ? JSON.stringify(d) : JSON.stringify(d, null, 2) + '\n');
const cleanConfig = (c) => { delete c.contentVersion; delete c._rev; };

const manifest = read('manifest.json');
delete manifest.lastUpdated;
cleanConfig(manifest.courseConfig);
for (const c of manifest.chunks.filter((c) => c.docType === 'UPLOAD_META')) {
  fs.rmSync(path.join(dir, c.path));
  manifest.documentCount -= c.documentCount;
}
manifest.chunks = manifest.chunks.filter((c) => c.docType !== 'UPLOAD_META');
for (const c of manifest.chunks.filter((c) => c.docType === 'COURSE_CONFIG')) {
  const docs = read(c.path);
  docs.forEach(cleanConfig);
  write(c.path, docs, true);
}
write('manifest.json', manifest);

for (const f of fs.readdirSync(path.join(dir, 'indices'))) {
  const d = read(path.join('indices', f));
  if (d.metadata?.generatedAt) {
    delete d.metadata.generatedAt;
    write(path.join('indices', f), d);
  }
}
EOF

echo "Packed $COURSE_ID into public/static-courses/$COURSE_ID ($(du -sh "$OUT/$COURSE_ID" | cut -f1))."
