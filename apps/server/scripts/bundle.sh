#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_ROOT="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$SERVER_ROOT/bundle"
PNPM_STORE="$SERVER_ROOT/../../node_modules/.pnpm"
NATIVE_SRC="$PNPM_STORE/better-sqlite3@11.10.0/node_modules/better-sqlite3"
SEA_BINARY="$OUT_DIR/hive-server"

# =============================================
# Detect platform & architecture
# SEA_ARCH can be set externally for cross-compilation (e.g. CI building x64 on arm64 host)
# =============================================
HOST_ARCH=$(uname -m)
ARCH="${SEA_ARCH:-$HOST_ARCH}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  case "$ARCH" in
    arm64)  NODE_ARCH="darwin-arm64" ;;
    x86_64) NODE_ARCH="darwin-x64" ;;
    *) echo "[sea] Unsupported macOS architecture: $ARCH"; exit 1 ;;
  esac
elif [[ "$OSTYPE" == "linux"* ]]; then
  case "$ARCH" in
    x86_64) NODE_ARCH="linux-x64" ;;
    arm64)  NODE_ARCH="linux-arm64" ;;
    *) echo "[sea] Unsupported Linux architecture: $ARCH"; exit 1 ;;
  esac
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  case "$ARCH" in
    x86_64) NODE_ARCH="win-x64" ;;
    *) echo "[sea] Unsupported Windows architecture: $ARCH"; exit 1 ;;
  esac
else
  echo "[sea] Unsupported OS: $OSTYPE"
  exit 1
fi

echo "[sea] Platform: $OSTYPE, Arch: $ARCH, Node arch: $NODE_ARCH"

# Clean
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# =============================================
# Step 1: esbuild bundle (CJS, external native)
# =============================================
echo "[sea] Step 1: esbuild bundle..."

npx esbuild "$SERVER_ROOT/src/main.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$OUT_DIR/index.cjs" \
  --external:better-sqlite3 \
  --log-level=info \
  --define:process.env.NODE_ENV='"production"'

rm -f "$OUT_DIR/index.cjs.map"
SIZE=$(du -h "$OUT_DIR/index.cjs" | cut -f1)
echo "[sea] Bundle: index.cjs ($SIZE)"

# =============================================
# Step 2: Copy native module
# =============================================
echo "[sea] Step 2: Copy native module..."
mkdir -p "$OUT_DIR/node_modules/better-sqlite3"
cp -R "$NATIVE_SRC/lib" "$OUT_DIR/node_modules/better-sqlite3/lib"
cp -R "$NATIVE_SRC/build" "$OUT_DIR/node_modules/better-sqlite3/build"
cp "$NATIVE_SRC/package.json" "$OUT_DIR/node_modules/better-sqlite3/package.json"

# Create bindings module placeholder (shim injected at runtime by sea-main.cjs)
mkdir -p "$OUT_DIR/node_modules/bindings"
echo '{};' > "$OUT_DIR/node_modules/bindings/package.json"
echo 'module.exports = function() {};' > "$OUT_DIR/node_modules/bindings/index.js"

# Patch better-sqlite3 to load native addon directly (skip 'bindings' library)
# BSD sed (macOS): sed -i '' 's|...|...|' file
# GNU sed (Linux/Windows): sed -i 's|...|...|' file
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|require('bindings')('better_sqlite3.node')|require(__dirname + '/../build/Release/better_sqlite3.node')|" "$OUT_DIR/node_modules/better-sqlite3/lib/database.js"
else
  sed -i "s|require('bindings')('better_sqlite3.node')|require(__dirname + '/../build/Release/better_sqlite3.node')|" "$OUT_DIR/node_modules/better-sqlite3/lib/database.js"
fi

echo "[sea] Native: node_modules/better-sqlite3 + bindings shim"

# =============================================
# Step 3: Create SEA entry (wraps bundle with createRequire)
# =============================================
echo "[sea] Step 3: Creating SEA entry..."
cp "$SCRIPT_DIR/sea-main.cjs" "$OUT_DIR/sea-main.cjs"

# =============================================
# Step 4: Node SEA build
# =============================================
echo "[sea] Step 4: Building SEA binary..."

# Download single-arch Node binary (avoids universal binary sentinel issues)
NODE_VERSION=$(node -v | sed 's/v//')
NODE_TAR="/tmp/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
NODE_BIN="/tmp/node-v${NODE_VERSION}-${NODE_ARCH}/bin/node"

if [ ! -f "$NODE_BIN" ]; then
  echo "[sea] Downloading Node.js $NODE_VERSION ($NODE_ARCH)..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz" \
    -o "$NODE_TAR"
  tar -xf "$NODE_TAR" -C /tmp/
  rm -f "$NODE_TAR"
fi

# Create sea-config.json
cat > "$OUT_DIR/sea-config.json" << EOF
{
  "main": "sea-main.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true
}
EOF

# Generate blob
(cd "$OUT_DIR" && node --experimental-sea-config sea-config.json)

# Copy single-arch node binary
cp "$NODE_BIN" "$SEA_BINARY"

# macOS: remove signature -> inject -> re-sign
if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign --remove-signature "$SEA_BINARY" 2>/dev/null || true
  npx postject "$SEA_BINARY" NODE_SEA_BLOB "$OUT_DIR/sea-prep.blob" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
  codesign --sign - "$SEA_BINARY" 2>/dev/null || true
else
  npx postject "$SEA_BINARY" NODE_SEA_BLOB "$OUT_DIR/sea-prep.blob" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
fi

# Cleanup temp files (keep index.cjs - needed at runtime by sea-main.cjs)
rm -f "$OUT_DIR/sea-prep.blob" "$OUT_DIR/sea-config.json" "$OUT_DIR/sea-main.cjs"

BINARY_SIZE=$(du -h "$SEA_BINARY" | cut -f1)
echo "[sea] Done! Output: bundle/hive-server ($BINARY_SIZE)"
echo "[sea] Ship: hive-server + node_modules/"
