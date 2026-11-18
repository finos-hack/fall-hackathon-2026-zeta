#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="e46aeeccbb626b3260dcfc3e615096e783bb7571"
SOURCE="${HUB_SOURCE_DIR:-$ROOT/.local/architecture-as-code-build}"
MARKER="$ROOT/.local/hub-source-base"
PATCH="$ROOT/poc/hub-ui/view-lens-ui.patch"
NODE_IMAGE="${NODE_BUILD_IMAGE:-node:26-bookworm}"
MAVEN_IMAGE="${MAVEN_BUILD_IMAGE:-maven:3.9.16-eclipse-temurin-21}"

if [[ ! -f "$PATCH" ]]; then
    printf 'Hub UI patch not found: %s\n' "$PATCH" >&2
    exit 1
fi

mkdir -p "$ROOT/.local"
if [[ -d "$SOURCE" ]]; then
    if [[ ! -f "$MARKER" ]] || [[ "$(<"$MARKER")" != "$BASE" ]]; then
        printf 'Refusing to reset unmanaged build source: %s\n' "$SOURCE" >&2
        printf 'Move that directory away, then run make hub-build again.\n' >&2
        exit 1
    fi
    git -C "$SOURCE" reset --hard "$BASE"
    git -C "$SOURCE" clean -fd
else
    git clone --filter=blob:none --no-checkout https://github.com/finos/architecture-as-code.git "$SOURCE"
    git -C "$SOURCE" fetch --depth=1 origin "$BASE"
    git -C "$SOURCE" checkout --detach FETCH_HEAD
    printf '%s\n' "$BASE" > "$MARKER"
fi

git -C "$SOURCE" apply --check "$PATCH"
git -C "$SOURCE" apply "$PATCH"

docker run --rm -v "$SOURCE:/workspace" -w /workspace "$NODE_IMAGE" npm ci
docker run --rm -v "$SOURCE:/workspace" -w /workspace "$NODE_IMAGE" npm run build:calm-hub-ui
docker run --rm -v "$SOURCE:/workspace" -w /workspace "$NODE_IMAGE" npm test --workspace calm-hub-ui
node -e 'const fs = require("node:fs"); fs.cpSync(process.argv[1], process.argv[2], { recursive: true });' \
    "$SOURCE/calm-hub-ui/build" "$SOURCE/calm-hub/src/main/resources/META-INF/resources"
docker run --rm -v "$SOURCE:/workspace" -w /workspace "$MAVEN_IMAGE" \
    ./mvnw -B -Pserver-only clean package
docker build -f "$SOURCE/calm-hub/src/main/docker/Dockerfile.jvm" -t calm-hub:zeta "$SOURCE/calm-hub"

printf 'Built local image calm-hub:zeta from %s plus the zeta UI patch.\n' "$BASE"
