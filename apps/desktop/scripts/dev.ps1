#!/usr/bin/env pwsh
# Dev launcher for Windows (alternative to dev.sh)
# Usage: .\apps\desktop\scripts\dev.ps1
# Or:    pwsh apps/desktop/scripts/dev.ps1

$ErrorActionPreference = 'Stop'

Write-Host "[dev] Building server..." -ForegroundColor Cyan
& pnpm --filter @bundy-lmw/hive-server build

Write-Host "[dev] Starting server..." -ForegroundColor Cyan
$serverJob = Start-Job -ScriptBlock {
  node "$using:PWD\apps\server\dist\main.js"
}

Write-Host "[dev] Waiting for server on port 4450..." -ForegroundColor Cyan
$maxWait = 30
for ($i = 0; $i -lt $maxWait; $i++) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('localhost', 4450)
    $tcp.Close()
    Write-Host "[dev] Server ready on port 4450" -ForegroundColor Green
    break
  } catch {
    Start-Sleep -Milliseconds 500
  }
  if ($i -eq $maxWait - 1) {
    Write-Host "[dev] WARNING: Server did not start in time" -ForegroundColor Yellow
  }
}

# Start Vite in foreground
try {
  Write-Host "[dev] Starting Vite..." -ForegroundColor Cyan
  & pnpm dev:ui
} finally {
  Write-Host "[dev] Stopping server..." -ForegroundColor Cyan
  Stop-Job $serverJob -ErrorAction SilentlyContinue
  Remove-Job $serverJob -ErrorAction SilentlyContinue
}
