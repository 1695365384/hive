/**
 * Server lifecycle management for the Electron main process.
 *
 * Spawns `bun dist/main.js` as a child process, watches for crashes,
 * auto-restarts with exponential backoff, and exposes status to the tray/UI.
 *
 * Equivalent to the Tauri lib.rs server management logic (~350 lines of Rust).
 */
import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { app } from "electron";

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = [500, 1000, 2000, 4000, 8000];

export interface ServerStatus {
  state: "running" | "stopped" | "failed";
  pid: number | null;
  restartCount: number;
}

let serverProcess: ChildProcess | null = null;
let restartCount = 0;
let shutdownRequested = false;
let onStatusChange: ((status: ServerStatus) => void) | null = null;

export function setStatusCallback(cb: (status: ServerStatus) => void): void {
  onStatusChange = cb;
}

function emit(status: ServerStatus): void {
  onStatusChange?.(status);
}

function resolveServerBinary(): { bin: string; args: string[]; cwd: string } {
  const isDev = !app.isPackaged;
  if (isDev) {
    return {
      bin: "bun",
      args: ["dist/main.js"],
      cwd: path.resolve(__dirname, "../../../server"),
    };
  }
  // Packaged: server bundle lives in extraResources
  const serverDir = path.join(process.resourcesPath!, "server");
  return {
    bin: process.platform === "win32" ? "bun.exe" : "bun",
    args: ["main.js"],
    cwd: serverDir,
  };
}

function doSpawn(): void {
  const { bin, args, cwd } = resolveServerBinary();

  serverProcess = spawn(bin, args, {
    cwd,
    env: { ...process.env, HIVE_WORKING_DIR: cwd },
    stdio: "inherit",
  });

  const pid = serverProcess.pid ?? null;
  emit({ state: "running", pid, restartCount });

  serverProcess.on("exit", (_code, _signal) => {
    emit({ state: "stopped", pid: null, restartCount });

    if (shutdownRequested) return;

    if (restartCount < MAX_RESTARTS) {
      const delay = RESTART_DELAY_MS[restartCount] ?? 8000;
      restartCount++;
      setTimeout(doSpawn, delay);
    } else {
      emit({ state: "failed", pid: null, restartCount });
    }
  });
}

export function startServer(): void {
  shutdownRequested = false;
  restartCount = 0;
  doSpawn();
}

export function stopServer(): Promise<void> {
  shutdownRequested = true;
  if (!serverProcess) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
      resolve();
    }, 5000);

    serverProcess!.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    serverProcess!.kill("SIGTERM");
  });
}

export function getStatus(): ServerStatus {
  return {
    state: serverProcess && !serverProcess.killed ? "running" : "stopped",
    pid: serverProcess?.pid ?? null,
    restartCount,
  };
}
