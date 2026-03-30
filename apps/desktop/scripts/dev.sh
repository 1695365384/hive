#!/bin/bash
set -e

# 1. Build server first
echo "[dev] Building server..."
pnpm --filter @hive/server build

# 2. Start server in background
echo "[dev] Starting server..."
node ../../apps/server/dist/main.js &
SERVER_PID=$!

# 3. Wait for server to be ready
for i in $(seq 1 30); do
  if nc -z localhost 4450 2>/dev/null; then
    echo "[dev] Server ready on port 4450"
    break
  fi
  sleep 0.5
done

# 4. Start Vite (foreground — Tauri waits for this)
echo "[dev] Starting Vite..."
exec pnpm dev:ui
