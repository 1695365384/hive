#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$SERVER_ROOT/bundle"
PNPM_STORE="$SERVER_ROOT/../../node_modules/.pnpm"
NATIVE_SRC="$(find "$PNPM_STORE" -maxdepth 1 -type d -name 'better-sqlite3@*' | head -1)/node_modules/better-sqlite3"
if [ ! -d "$NATIVE_SRC" ]; then
  echo "[bundle] ERROR: better-sqlite3 not found in $PNPM_STORE"
  echo "[bundle] Make sure 'pnpm install' has been run and better-sqlite3 is a dependency"
  exit 1
fi

# =============================================
# Detect platform & architecture
# =============================================
HOST_ARCH=$(uname -m)
ARCH="${SEA_ARCH:-$HOST_ARCH}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  case "$ARCH" in
    arm64)  NODE_ARCH="darwin-arm64" ;;
    x86_64) NODE_ARCH="darwin-x64" ;;
    *) echo "[bundle] Unsupported macOS architecture: $ARCH"; exit 1 ;;
  esac
elif [[ "$OSTYPE" == "linux"* ]]; then
  case "$ARCH" in
    x86_64) NODE_ARCH="linux-x64" ;;
    arm64)  NODE_ARCH="linux-arm64" ;;
    *) echo "[bundle] Unsupported Linux architecture: $ARCH"; exit 1 ;;
  esac
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  case "$ARCH" in
    x86_64) NODE_ARCH="win-x64" ;;
    *) echo "[bundle] Unsupported Windows architecture: $ARCH"; exit 1 ;;
  esac
else
  echo "[bundle] Unsupported OS: $OSTYPE"
  exit 1
fi

echo "[bundle] Platform: $OSTYPE, Arch: $ARCH, Node arch: $NODE_ARCH"

# Clean
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Mark bundle as CJS (overrides parent "type": "module")
echo '{"type":"commonjs"}' > "$OUT_DIR/package.json"

# =============================================
# Step 1: esbuild bundle (CJS, external native)
# =============================================
echo "[bundle] Step 1: esbuild bundle..."

pnpm --filter @bundy-lmw/hive-server exec esbuild "$SERVER_ROOT/src/main.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$OUT_DIR/main.js" \
  --external:better-sqlite3 \
  --log-level=info \
  --define:process.env.NODE_ENV='"production"'

rm -f "$OUT_DIR/main.js.map"

# Patch: esbuild CJS replaces import.meta with empty object.
# Replace with a polyfill that provides import.meta.url via __filename.
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' 's/import_meta = {}/import_meta = { url: require("url").pathToFileURL(__filename).href }/g' "$OUT_DIR/main.js"
else
  sed -i 's/import_meta = {}/import_meta = { url: require("url").pathToFileURL(__filename).href }/g' "$OUT_DIR/main.js"
fi

SIZE=$(du -h "$OUT_DIR/main.js" | cut -f1)
echo "[bundle] Bundle: main.js ($SIZE)"

# =============================================
# Step 2: Copy native module
# =============================================
echo "[bundle] Step 2: Copy native module..."
mkdir -p "$OUT_DIR/node_modules/better-sqlite3"
cp -R "$NATIVE_SRC/lib" "$OUT_DIR/node_modules/better-sqlite3/lib"
cp -R "$NATIVE_SRC/build" "$OUT_DIR/node_modules/better-sqlite3/build"
cp "$NATIVE_SRC/package.json" "$OUT_DIR/node_modules/better-sqlite3/package.json"

# Patch better-sqlite3 to load native addon directly (skip 'bindings' library)
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|require('bindings')('better_sqlite3.node')|require(__dirname + '/../build/Release/better_sqlite3.node')|" "$OUT_DIR/node_modules/better-sqlite3/lib/database.js"
else
  sed -i "s|require('bindings')('better_sqlite3.node')|require(__dirname + '/../build/Release/better_sqlite3.node')|" "$OUT_DIR/node_modules/better-sqlite3/lib/database.js"
fi

echo "[bundle] Native: node_modules/better-sqlite3"

# =============================================
# Step 3: Copy prompt templates + worker entry
# =============================================
echo "[bundle] Step 3: Copying prompt templates + worker entry..."
CORE_DIST="$SERVER_ROOT/../../packages/core/dist"
TEMPLATES_SRC="$CORE_DIST/agents/prompts/templates"

# Copy prompt templates (to bundle root — PromptTemplate resolves via __dirname + '/templates')
TEMPLATE_COUNT=0
if [ -d "$TEMPLATES_SRC" ]; then
  mkdir -p "$OUT_DIR/templates"
  for f in "$TEMPLATES_SRC"/*.md; do
    [ -f "$f" ] || continue
    cp "$f" "$OUT_DIR/templates/"
    TEMPLATE_COUNT=$((TEMPLATE_COUNT + 1))
  done
fi
echo "[bundle] Templates: $TEMPLATE_COUNT .md files copied to templates/"

# Copy worker-entry.js (to bundle root — agent-tool resolves via __dirname + '/workers/')
mkdir -p "$OUT_DIR/workers"
if [ -f "$CORE_DIST/workers/worker-entry.js" ]; then
  cp "$CORE_DIST/workers/worker-entry.js" "$OUT_DIR/workers/worker-entry.js"
  echo "[bundle] Worker entry: workers/worker-entry.js"
else
  echo "[bundle] WARNING: worker-entry.js not found at $CORE_DIST/workers/worker-entry.js"
fi

# =============================================
# Step 4: Download Node.js binary
# =============================================
echo "[bundle] Step 4: Downloading Node.js binary..."
NODE_VERSION=$(node -v | sed 's/v//')
NODE_TAR="/tmp/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
NODE_BIN="/tmp/node-v${NODE_VERSION}-${NODE_ARCH}/bin/node"
NODE_SIDE_NAME="node-${NODE_ARCH}"

if [ ! -f "$NODE_BIN" ]; then
  echo "[bundle] Downloading Node.js $NODE_VERSION ($NODE_ARCH)..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz" \
    -o "$NODE_TAR"
  tar -xf "$NODE_TAR" -C /tmp/
  rm -f "$NODE_TAR"
fi

cp "$NODE_BIN" "$OUT_DIR/$NODE_SIDE_NAME"
chmod +x "$OUT_DIR/$NODE_SIDE_NAME"

BINARY_SIZE=$(du -h "$OUT_DIR/$NODE_SIDE_NAME" | cut -f1)
TOTAL_SIZE=$(du -sh "$OUT_DIR" | cut -f1)
echo "[bundle] Node.js binary: $NODE_SIDE_NAME ($BINARY_SIZE)"
echo "[bundle] Done! Output: bundle/ ($TOTAL_SIZE)"
echo "[bundle] Ship: server/ directory (main.js + node_modules/ + templates/ + workers/ + $NODE_SIDE_NAME)"
