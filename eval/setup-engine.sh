#!/usr/bin/env bash
# Engine for the harness: upstream screenpipe at the pinned commit plus
# patches/harness.patch, built (dev profile) into .engines/target.
#
# `setup-engine.sh <variant>` builds a changed engine instead: a worktree
# .engines/wf-<variant> with patches/harness.patch and patches/variants/<variant>.patch
# applied, built into .engines/target-wf-<variant>, the paths variants/<variant>.json
# names. Same files on every Mac, so run.json records the same engine changes.
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
target=$here/.engines/target
if [ -n "${1:-}" ]; then
  variant=$1
  patch=$here/patches/variants/$variant.patch
  [ -f "$patch" ] || { echo "no $patch" >&2; exit 1; }
  wt=$here/.engines/wf-$variant
  if [ ! -d "$wt" ]; then
    git -C "$src" worktree add --quiet --detach "$wt" "$commit"
    git -C "$wt" apply "$here/patches/harness.patch"
    git -C "$wt" apply "$patch"
  else
    echo "$wt exists; building it as it is" >&2
  fi
  target=$here/.engines/target-wf-$variant
  # Start from the baseline build when there is one: only the changed crates rebuild.
  if [ ! -d "$target" ] && [ -d "$here/.engines/target" ]; then
    /bin/cp -cR "$here/.engines/target" "$target" 2>/dev/null || cp -R "$here/.engines/target" "$target"
  fi
  src=$wt
fi
cd "$src"
CARGO_TARGET_DIR=$target cargo build -p screenpipe-engine --bin screenpipe --features metal
echo "engine: $target/debug/screenpipe"
