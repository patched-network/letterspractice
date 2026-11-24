#!/usr/bin/env bash
# remote-dev.sh — run the dev stack on another LAN machine, edit here.
#
# Edits, git and the browser stay on this machine (lenny). A mutagen sync
# mirrors the app and vue-skuilder trees to the build box, which runs couch,
# the framework watchers and vite. An ssh tunnel puts the box's :5173 and
# :5984 on this machine's localhost, so the browser sees an ordinary local
# dev origin: secure context, Google sign-in, HMR all as usual.
#
#   lenny:  remote-dev.sh bootstrap   # once: initial sync, install, build, couch data
#   lenny:  remote-dev.sh up          # syncs on + tunnel (foreground; ctrl-c closes tunnel)
#   box:    remote-dev.sh serve       # tmux session: couch, framework watch, vite
#   lenny:  remote-dev.sh start       # ...or launch that session detached, from here
#   lenny:  remote-dev.sh typecheck   # vue-tsc on the box against the synced tree
#   lenny:  remote-dev.sh status | log | down
#
# yarn shortcuts: `yarn dev:vostro` (start + up), `yarn typecheck:vostro`.
#
# On the box the mirror lives under ~/lenny-mirror/, apart from any checkouts
# of its own, with the same relative layout as here — the app's link: deps are
# relative paths into vue-skuilder.
#
# Sync is one-way-safe: this side's edits (and deletions) propagate; files the
# box creates itself (node_modules, dist, couch data) are left alone. Run
# `remote-dev.sh install` after changing package.json/yarn.lock.

set -euo pipefail

REMOTE_HOST="${REMOTE_DEV_HOST:-vostro}"
REMOTE_ROOT="lenny-mirror" # relative to the box's $HOME

# Paths relative to this script, so the same file works on both machines.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Maintainer-only. This is one maintainer's two-machine setup (an ssh alias for
# the build box, a ~/lenny-mirror/ there, a sibling vue-skuilder checkout). It
# isn't part of building or running the app: use `yarn dev` (see README).
# Proceed only on the box itself or where $REMOTE_HOST is an ssh alias.
if [[ "$APP_DIR" != *"/$REMOTE_ROOT/"* ]] &&
   [[ "$(ssh -G "$REMOTE_HOST" 2>/dev/null | awk '$1=="hostname"{print $2}')" == "$REMOTE_HOST" ]]; then
  cat >&2 <<EOF_MSG

  remote-dev.sh: doing nothing.

  This script (and \`yarn dev:vostro\` / \`yarn typecheck:vostro\`) is the
  maintainer's own tooling: it runs the dev stack on a second LAN machine
  over ssh. It needs an ssh alias "$REMOTE_HOST" (or REMOTE_DEV_HOST) that
  this machine doesn't have.

  To run the app, use \`yarn dev\`. To typecheck, \`yarn typecheck\`.

EOF_MSG
  exit 1
fi
FW_DIR="$(cd "$APP_DIR/../../vue-skuilder/master" && pwd)"
APP_REL="$REMOTE_ROOT/lp/main"
FW_REL="$REMOTE_ROOT/vue-skuilder/master"

TMUX_SESSION="lp-dev"
VITE_LOG="$HOME/lp-vite.log"

# Non-interactive ssh skips .bashrc, so load nvm by hand. The box's global
# yarn is 1.x; corepack honours each project's packageManager pin.
REMOTE_ENV='[ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; export COREPACK_ENABLE_DOWNLOAD_PROMPT=0'
YARN="corepack yarn"

COMMON_IGNORES=(
  --ignore-vcs
  --ignore=node_modules --ignore=dist --ignore=dist-lib
  '--ignore=**/.yarn/install-state.gz' '--ignore=**/.yarn/cache' '--ignore=**/.yarn/unplugged'
  '--ignore=*.log' --ignore=coverage
)

create_syncs() {
  mutagen daemon start
  if ! mutagen sync list lp-app >/dev/null 2>&1; then
    mutagen sync create --name=lp-app --sync-mode=one-way-safe \
      "${COMMON_IGNORES[@]}" \
      --ignore=/bd --ignore=/android --ignore=/dbg --ignore=/blog \
      "$APP_DIR" "$REMOTE_HOST:$APP_REL"
  fi
  if ! mutagen sync list lp-fw >/dev/null 2>&1; then
    # Couch data is the box's own, seeded once by bootstrap.
    mutagen sync create --name=lp-fw --sync-mode=one-way-safe \
      "${COMMON_IGNORES[@]}" \
      --ignore=/test-couch/couchdb_data \
      "$FW_DIR" "$REMOTE_HOST:$FW_REL"
  fi
  mutagen sync resume lp-app lp-fw
  mutagen sync flush lp-app lp-fw
}

remote_install() {
  ssh -t "$REMOTE_HOST" "bash -c '
    $REMOTE_ENV; set -e
    cd ~/$FW_REL && $YARN install
    cd ~/$APP_REL && $YARN install && cd content/phoneticAnalytics && $YARN install
  '"
}

case "${1:-}" in
  bootstrap)
    ssh "$REMOTE_HOST" "mkdir -p ~/$APP_REL ~/$FW_REL"
    create_syncs
    echo "→ seeding couch data from this machine"
    rsync -a "$FW_DIR/test-couch/couchdb_data/" "$REMOTE_HOST:$FW_REL/test-couch/couchdb_data/"
    echo "→ installing + building on $REMOTE_HOST (slow, once)"
    remote_install
    ssh -t "$REMOTE_HOST" "bash -c '
      $REMOTE_ENV; set -e; cd ~/$FW_REL
      for p in common db common-ui courseware; do $YARN workspace @vue-skuilder/\$p build; done
    '"
    echo "✓ bootstrap done. Next: '$0 up' here, '~/$APP_REL/scripts/remote-dev.sh serve' on $REMOTE_HOST."
    ;;

  install)
    mutagen sync flush lp-app lp-fw
    remote_install
    ;;

  up)
    create_syncs
    # Hot-reload paths only; anything else still syncs on mutagen's own rescan.
    node "$APP_DIR/scripts/remote-dev-nudge.mjs" "$APP_DIR/src" "$APP_DIR/public" \
      "$FW_DIR"/packages/{common,db,common-ui,courseware}/src &
    trap 'kill $! 2>/dev/null' EXIT
    echo "→ tunnel: http://localhost:5173 (vite), localhost:5984 (couch) — ctrl-c to close"
    ssh -N -o ExitOnForwardFailure=yes -o ControlPath=none \
      -L 5173:localhost:5173 -L 5984:localhost:5984 "$REMOTE_HOST"
    ;;

  down)
    mutagen sync pause lp-app lp-fw || true
    ssh "$REMOTE_HOST" "tmux kill-session -t $TMUX_SESSION" 2>/dev/null || true
    ;;

  status)
    mutagen sync list lp-app lp-fw
    ssh "$REMOTE_HOST" "tmux ls 2>/dev/null; curl -s -o /dev/null -w 'vite: %{http_code}\n' localhost:5173; curl -s localhost:5984 | head -c 80; echo"
    ;;

  log)
    ssh "$REMOTE_HOST" "tail -n ${2:-60} $VITE_LOG"
    ;;

  start)
    create_syncs
    ssh "$REMOTE_HOST" "~/$APP_REL/scripts/remote-dev.sh serve -d"
    ;;

  typecheck)
    mutagen sync flush lp-app lp-fw
    ssh "$REMOTE_HOST" "$REMOTE_ENV; cd ~/$APP_REL && $YARN typecheck"
    ;;

  serve)
    # Runs on the build box. -d: leave the session detached.
    if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
      tmux new-session -d -s "$TMUX_SESSION" -n couch -c "$FW_DIR" "$REMOTE_ENV; $YARN couchdb:start; exec bash"
      tmux new-window -t "$TMUX_SESSION" -n fw -c "$FW_DIR" "$REMOTE_ENV; $YARN dev:watch; exec bash"
      tmux new-window -t "$TMUX_SESSION" -n vite -c "$APP_DIR" \
        "$REMOTE_ENV; ./scripts/remote-dev.sh wait-dist && $YARN vite 2>&1 | tee $VITE_LOG; exec bash"
    fi
    [ "${2:-}" = "-d" ] || exec tmux attach -t "$TMUX_SESSION"
    ;;

  wait-dist)
    # The watchers' first build wipes dist/; vite's dep scan fails if it
    # starts mid-wipe. Wait until every framework entry exists and has been
    # quiet for 5s.
    # Each package's ESM entry ("module" in its package.json).
    entries=(common/dist/index.mjs db/dist/index.mjs
      common-ui/dist/index.mjs courseware/dist/index.mjs)
    echo "waiting for framework builds..."
    sleep 5
    waited=5
    while :; do
      newest=0 missing=""
      for e in "${entries[@]}"; do
        t=$(stat -c %Y "$FW_DIR/packages/$e" 2>/dev/null) || { newest=-1; missing=$e; break; }
        (( t > newest )) && newest=$t
      done
      (( newest > 0 && $(date +%s) - newest >= 5 )) && break
      # A missing entry usually means a watcher failed (see the fw window), or
      # a package's build output was renamed (update `entries`).
      (( waited % 60 == 0 )) && [[ -n "$missing" ]] &&
        echo "  still waiting after ${waited}s: no $missing (check the fw window)"
      sleep 1; waited=$((waited + 1))
    done
    ;;

  *)
    sed -n '2,25p' "$0"
    exit 1
    ;;
esac
