#!/usr/bin/env bash
# Build the sandbox image (aarch64-linux, through the configured Nix builder) and load
# it into Docker/OrbStack. Copying straight into the daemon breaks on Docker 29, so this
# goes through an archive (as eval-sketch does).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
docker=${DOCKER:-$(command -v docker || echo "$HOME/.orbstack/bin/docker")}
spec=$(nix build "path:$here#image" --no-link --print-out-paths)
# nix2container's skopeo (nix: transport). Its darwin build can fail; SKOPEO overrides.
skopeo=${SKOPEO:-$(nix build "path:$here#skopeo^out" --no-link --print-out-paths)/bin/skopeo}
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
"$skopeo" --insecure-policy copy "nix:$spec" "docker-archive:$dir/image.tar:wfeval-sandbox:latest"
"$docker" load -i "$dir/image.tar"
"$docker" image inspect --format '{{.Id}} {{.Architecture}}' wfeval-sandbox:latest
