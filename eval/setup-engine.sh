#!/usr/bin/env bash
# Engine for the harness: upstream screenpipe at the pinned commit plus
# patches/harness.patch, built (dev profile) into .engines/target.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
commit=a8aaee2d6348aa1a0578981098fe97c2ec46d32a
src=$here/.engines/upstream
if [ ! -d "$src/.git" ]; then
  git clone --filter=blob:none https://github.com/screenpipe/screenpipe.git "$src"
fi
if [ -z "$(git -C "$src" status --porcelain)" ]; then
  git -C "$src" fetch --quiet origin "$commit" 2>/dev/null || true
  git -C "$src" checkout --quiet "$commit"
  git -C "$src" apply "$here/patches/harness.patch"
else
  echo "$src already has changes (patched earlier?); building it as it is" >&2
fi
cd "$src"
CARGO_TARGET_DIR=$here/.engines/target cargo build -p screenpipe-engine --bin screenpipe --features metal
echo "engine: $here/.engines/target/debug/screenpipe"
