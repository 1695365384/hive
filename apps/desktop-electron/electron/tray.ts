/**
 * System tray with server status display.
 *
 * Equivalent to the Tauri lib.rs build_tray() function (~50 lines of Rust).
 */
import { Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";
import type { ServerStatus } from "./server";

let tray: Tray | null = null;
let currentStatus: ServerStatus = { state: "stopped", pid: null, restartCount: 0 };
let onRestartRequested: (() => void) | null = null;

export function setRestartCallback(cb: () => void): void {
  onRestartRequested = cb;
}

function buildMenu(): Menu {
  const statusLabels: Record<ServerStatus["state"], string> = {
    running: "Running",
    stopped: "Stopped",
    failed: "Failed — max restarts reached",
  };
  return Menu.buildFromTemplate([
    { label: `Server: ${statusLabels[currentStatus.state]}`, enabled: false },
    { type: "separator" },
    {
      label: "Restart Server",
      click: () => onRestartRequested?.(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

export function createTray(): void {
  // Use a 16x16 icon; fall back to a simple empty image if missing
  const iconPath = path.join(__dirname, "..", "assets", "tray-icon.png");
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error("empty icon");
  } catch {
    // Create a 16x16 placeholder
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Hive");
  tray.setContextMenu(buildMenu());
}

export function updateTrayStatus(status: ServerStatus): void {
  currentStatus = status;
  if (tray) {
    tray.setContextMenu(buildMenu());
  }
}
