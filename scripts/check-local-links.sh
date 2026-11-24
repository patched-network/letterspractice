#!/usr/bin/env bash
# check-local-links.sh — Guard for dev:local
#
# Fails loudly if package.json has @vue-skuilder/* deps pointing at
# npm versions instead of local link: paths. This catches the common
# mistake of running dev:local without swapping to package.localdev.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG="$SCRIPT_DIR/../package.json"

npm_deps=$(grep '"@vue-skuilder/' "$PKG" | grep -v '"link:' | grep -v '"file:' || true)

if [ -n "$npm_deps" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ⚠  @vue-skuilder deps point to npm, not local sources!    ║"
  echo "║                                                              ║"
  echo "║  dev:local requires local link: deps so framework changes    ║"
  echo "║  are picked up. Swap to localdev config:                     ║"
  echo "║                                                              ║"
  echo "║    cp package.localdev.json package.json && yarn install     ║"
  echo "║                                                              ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Non-local deps found:"
  echo "$npm_deps" | sed 's/^/    /'
  echo ""
  exit 1
fi
