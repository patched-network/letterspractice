#!/usr/bin/env bash
# setup-audio.sh — put the app's recorded audio in public/audio/ (runs before `yarn dev`).
#
# The recordings live in their own repo (CC BY-NC 4.0), pinned in audio.json
# (repo, tag, commit). This clones that tag once into a cache and copies
# words/, phonemes/ and arpa/ into public/audio/ (gitignored).
#
#   AUDIO_SOURCE=/path/to/checkout ./scripts/setup-audio.sh   # copy from a local checkout instead
#   AUDIO_REQUIRED=1 ./scripts/setup-audio.sh                 # fail, don't warn, if audio can't be set up
#   AUDIO_FORCE=1 ./scripts/setup-audio.sh                    # recopy even if public/audio has mp3s
#
# Without audio the app still runs, silently, so by default failures only warn.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_AUDIO="$ROOT/public/audio"
DIRS=(words phonemes arpa)

fail() {
  echo "⚠️  setup-audio: $1" >&2
  echo "   The app will run without sound. See README § Audio." >&2
  [ -n "${AUDIO_REQUIRED:-}" ] && exit 1
  exit 0
}

if [ -z "${AUDIO_FORCE:-}" ] && [ -n "$(find "$PUBLIC_AUDIO" -name '*.mp3' -print -quit 2>/dev/null)" ]; then
  echo "✅ Audio present in public/audio/ ($(find "$PUBLIC_AUDIO" -name '*.mp3' | wc -l) mp3)"
  exit 0
fi

if [ -n "${AUDIO_SOURCE:-}" ]; then
  SRC="$AUDIO_SOURCE"
  [ -d "$SRC/words" ] || fail "AUDIO_SOURCE=$SRC has no words/ directory"
else
  read -r REPO REF COMMIT < <(node -e '
    const a = require(process.argv[1]);
    console.log(a.repo, a.ref, a.commit);' "$ROOT/audio.json")
  SRC="${XDG_CACHE_HOME:-$HOME/.cache}/letterspractice-audio/$REF"
  if [ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null)" != "$COMMIT" ]; then
    echo "📥 Fetching audio $REF from $REPO ..."
    rm -rf "$SRC"
    mkdir -p "$(dirname "$SRC")"
    GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 --branch "$REF" "$REPO" "$SRC" 2>/dev/null \
      || fail "couldn't clone $REPO at $REF (offline, or no access while the repo is private)"
    ACTUAL="$(git -C "$SRC" rev-parse HEAD)"
    if [ "$ACTUAL" != "$COMMIT" ]; then
      rm -rf "$SRC"
      fail "$REF is $ACTUAL, but audio.json pins $COMMIT"
    fi
  fi
fi

mkdir -p "$PUBLIC_AUDIO"
for d in "${DIRS[@]}"; do
  [ -d "$SRC/$d" ] && cp -r "$SRC/$d" "$PUBLIC_AUDIO/"
done
echo "✅ Audio set up: $(find "$PUBLIC_AUDIO" -name '*.mp3' | wc -l) mp3 in public/audio/"
