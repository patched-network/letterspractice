#!/usr/bin/env bash
#
# skup — bump @vue-skuilder/* dep versions, refresh lockfile, commit,
#        and restore local-link package.json for continued dev.
#
# Usage:  yarn skup <version-string>
#   e.g.  yarn skup ^0.3.0
#         yarn skup 0.3.1
#         yarn skup latest
#
# Flow:
#   1. Preflight: package.json must match package.localdev.json exactly
#                 (catches drift between active and the canonical link-mode file).
#   2. Preflight: package.json / package.prod.json / yarn.lock must be clean.
#   3. Rewrite skuilder dep version strings in BOTH package.prod.json
#      and the active package.json to <version-string>.
#   4. yarn install — regenerate lockfile against prod-style versions.
#   5. Sanity: skuilder entries in active == prod.
#   6. git commit package.json, package.prod.json, yarn.lock.
#   7. Restore active package.json from package.localdev.json (link mode).
#   8. yarn install — restore link-mode node_modules.

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: yarn skup <version-string>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ACTIVE="package.json"
PROD="package.prod.json"
LOCALDEV="package.localdev.json"

echo "==> [1/8] Preflight: $ACTIVE === $LOCALDEV ?"
if ! diff -q "$ACTIVE" "$LOCALDEV" > /dev/null; then
  echo "ERROR: $ACTIVE differs from $LOCALDEV. Reconcile drift before running skup:" >&2
  diff "$ACTIVE" "$LOCALDEV" >&2 || true
  exit 1
fi

# NOTE: package.json and yarn.lock are intentionally NOT checked here. In steady
# state both reflect link-mode (local sk deps) in the working tree while HEAD
# carries the committed prod versions — so both are permanently "dirty" by design.
# package.prod.json is the only file with a clean steady state (touched solely by
# skup and committed each run), so it is the meaningful guard against a half-applied
# prior run or stray manual edits.
echo "==> [2/8] Preflight: working tree clean for $PROD ?"
if ! git diff --quiet HEAD -- "$PROD"; then
  echo "ERROR: uncommitted changes in $PROD. Commit or revert first." >&2
  git status --short -- "$PROD" >&2 || true
  exit 1
fi

echo "==> [3/8] Rewriting @vue-skuilder/* deps in $PROD and $ACTIVE to '$VERSION'"
node --input-type=module -e "
import fs from 'node:fs';
const ver = process.argv[1];
const pkgs = [
  '@vue-skuilder/common',
  '@vue-skuilder/common-ui',
  '@vue-skuilder/courseware',
  '@vue-skuilder/db',
  '@vue-skuilder/cli',
];
for (const path of ['package.prod.json', 'package.json']) {
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const sec of ['dependencies', 'devDependencies']) {
    if (!json[sec]) continue;
    for (const name of pkgs) {
      if (name in json[sec]) json[sec][name] = ver;
    }
  }
  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}
" "$VERSION"

echo "==> [4/8] yarn install (regenerate lockfile against new versions)"
yarn install

echo "==> [5/8] Sanity: skuilder entries in $ACTIVE == $PROD ?"
MISMATCH=$(node --input-type=module -e "
import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const p = JSON.parse(fs.readFileSync('package.prod.json', 'utf8'));
const pkgs = [
  '@vue-skuilder/common',
  '@vue-skuilder/common-ui',
  '@vue-skuilder/courseware',
  '@vue-skuilder/db',
  '@vue-skuilder/cli',
];
const pick = (o) => Object.fromEntries(
  pkgs.flatMap((n) => {
    const r = [];
    if (o.dependencies && n in o.dependencies) r.push([n, o.dependencies[n]]);
    if (o.devDependencies && n in o.devDependencies) r.push([n, o.devDependencies[n]]);
    return r;
  })
);
const aa = pick(a), pp = pick(p);
if (JSON.stringify(aa) !== JSON.stringify(pp)) {
  console.log('active: ' + JSON.stringify(aa));
  console.log('prod:   ' + JSON.stringify(pp));
}
")
if [ -n "$MISMATCH" ]; then
  echo "ERROR: skuilder deps mismatch between active and prod after rewrite:" >&2
  echo "$MISMATCH" >&2
  exit 1
fi

echo "==> [6/8] git commit"
git add "$ACTIVE" "$PROD" yarn.lock
git commit -m "chore: bump @vue-skuilder/* deps to $VERSION"

echo "==> [7/8] Restoring $ACTIVE from $LOCALDEV (link mode)"
cp "$LOCALDEV" "$ACTIVE"

echo "==> [8/8] yarn install (restore link-mode node_modules)"
yarn install

echo ""
echo "skup: done."
echo "  - Committed prod-version bump to $VERSION."
echo "  - Restored $ACTIVE to local-link mode."
