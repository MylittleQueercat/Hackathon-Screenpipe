#!/usr/bin/env bash
# Get the sandbox image and load it as wfeval-sandbox:latest.
#
#   sandbox/load.sh           pull the published image (no Nix needed)
#   sandbox/load.sh --build   build it from flake.nix (aarch64-linux, through a Nix
#                             Linux builder) and load it
#
# Both give the same image: its id is the digest of a config Nix builds reproducibly.
# After changing flake.nix or portal.py, build, push, and update PUBLISHED and ID.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
docker=${DOCKER:-$(command -v docker || echo "$HOME/.orbstack/bin/docker")}
PUBLISHED=ghcr.io/grisetio/wfeval-sandbox@sha256:ea8be98d6934a5069b8992a1eda6702060fcd8abf4241212302305c04b829d4f
ID=sha256:882b154099811db6e6c811cccc1151773668e04c7ff0ba93909f0b3f3b0d199f

if [ "${1:-}" = "--build" ]; then
  spec=$(nix build "path:$here#image" --no-link --print-out-paths)
  # nix2container's skopeo (nix: transport). Its darwin build can fail; SKOPEO overrides.
  skopeo=${SKOPEO:-$(nix build "path:$here#skopeo^out" --no-link --print-out-paths)/bin/skopeo}
  # Copying straight into the daemon breaks on Docker 29: go through an archive.
  dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
  "$skopeo" --insecure-policy copy "nix:$spec" "docker-archive:$dir/image.tar:wfeval-sandbox:latest"
  "$docker" load -i "$dir/image.tar"
else
  "$docker" pull "$PUBLISHED"
  "$docker" tag "$PUBLISHED" wfeval-sandbox:latest
fi
id=$("$docker" image inspect --format '{{.Id}}' wfeval-sandbox:latest)
if [ "$id" != "$ID" ]; then
  echo "warning: wfeval-sandbox:latest is $id, not the published $ID (sandbox/ changed?)" >&2
fi
"$docker" image inspect --format '{{.Id}} {{.Architecture}}' wfeval-sandbox:latest
