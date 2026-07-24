/**
 * Server lifecycle management for the Electron main process.
 *
 * Spawns `bun dist/main.js` as a child process, watches for crashes,
 * auto-restarts with exponential backoff, and exposes status to the tray/UI.
 *
 * Equivalent to the Tauri lib.rs server management logic (~350 lines of Rust).
 */
import { ChildProcess, spawn, execSync } from "node:child_process";
import fs from "node:fs";
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

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveBun(): string {
  const candidates: string[] = [];

  // 1. BUN_INSTALL env var (usually ~/.bun)
  const bunInstall = process.env.BUN_INSTALL;
  if (bunInstall) {
    candidates.push(
      process.platform === "win32"
        ? path.join(bunInstall, "bin", "bun.exe")
        : path.join(bunInstall, "bin", "bun"),
    );
  }

  // 2. Common install locations
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) {
    if (process.platform === "win32") {
      candidates.push(path.join(home, ".bun", "bin", "bun.exe"));
    } else {
      candidates.push(
        path.join(home, ".bun", "bin", "bun"),
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
      );
    }
  }

  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }

  // 3. Fallback: which / where
  try {
    const found = execSync(process.platform === "win32" ? "where bun" : "which bun", {
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/)[0];
    if (found && isExecutable(found)) return found;
  } catch {
    /* not on PATH */
  }

  throw new Error(
    "bun not found. Install bun (https://bun.sh) or set BUN_INSTALL so Hive can start the local server.",
  );
}

function resolveServerBinary(): { bin: string; args: string[]; cwd: string } {
  const isDev = !app.isPackaged;
  const bunBin = resolveBun();

  if (isDev) {
    // dist-electron/ → ../ = desktop-electron, ../../ = apps, ../../server = apps/server
    const serverDir = path.resolve(__dirname, "../../server");
    if (!fs.existsSync(path.join(serverDir, "dist", "main.js"))) {
      throw new Error(
        `Hive server build missing at ${path.join(serverDir, "dist", "main.js")}. Run: pnpm --filter @bundy-lmw/hive-server build`,
      );
    }
    return {
      bin: bunBin,
      args: ["dist/main.js"],
      cwd: serverDir,
    };
  }

  // Packaged: server bundle lives in extraResources
  const serverDir = path.join(process.resourcesPath!, "server");
  return {
    bin: bunBin,
    args: ["main.js"],
    cwd: serverDir,
  };
}

function scheduleRestart(): void {
  if (shutdownRequested) return;

  if (restartCount < MAX_RESTARTS) {
    const delay = RESTART_DELAY_MS[restartCount] ?? 8000;
    restartCount++;
    setTimeout(doSpawn, delay);
  } else {
    emit({ state: "failed", pid: null, restartCount });
  }
}

function doSpawn(): void {
  let bin: string;
  let args: string[];
  let cwd: string;

  try {
    ({ bin, args, cwd } = resolveServerBinary());
  } catch (err) {
    console.error("[hive-server]", err instanceof Error ? err.message : err);
    emit({ state: "failed", pid: null, restartCount });
    return;
  }

  console.log(`[hive-server] starting: ${bin} ${args.join(" ")} (cwd=${cwd})`);

  try {
    const hiveBin = path.join(cwd, ".hive", "bin");
    const pathEnv = process.env.PATH || "";
    const nextPath = pathEnv.split(path.delimiter).includes(hiveBin)
      ? pathEnv
      : `${hiveBin}${path.delimiter}${pathEnv}`;
    serverProcess = spawn(bin, args, {
      cwd,
      env: { ...process.env, HIVE_WORKING_DIR: cwd, PATH: nextPath },
      stdio: "inherit",
    });
  } catch (err) {
    // Synchronous spawn failures (rare)
    console.error("[hive-server] spawn failed:", err instanceof Error ? err.message : err);
    serverProcess = null;
    emit({ state: "stopped", pid: null, restartCount });
    scheduleRestart();
    return;
  }

  // Async spawn failures (ENOENT when cwd/binary missing) land here.
  // Without this listener Electron shows the "A JavaScript error occurred in the main process" dialog.
  serverProcess.on("error", (err) => {
    console.error("[hive-server] process error:", err.message);
    serverProcess = null;
    emit({ state: "stopped", pid: null, restartCount });
    scheduleRestart();
  });

  const pid = serverProcess.pid ?? null;
  emit({ state: "running", pid, restartCount });

  serverProcess.on("exit", (_code, _signal) => {
    emit({ state: "stopped", pid: null, restartCount });
    serverProcess = null;
    scheduleRestart();
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
