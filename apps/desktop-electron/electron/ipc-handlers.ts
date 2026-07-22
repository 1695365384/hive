/**
 * IPC handlers — registers all ipcMain.handle channels.
 *
 * Equivalent to all #[tauri::command] functions in lib.rs.
 * Every channel MUST have a corresponding entry in preload.ts.
 */
import { ipcMain, dialog, shell, Notification, app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { startServer, stopServer, getStatus, setStatusCallback } from "./server";
import { createTray, updateTrayStatus } from "./tray";
import type { ServerStatus } from "./server";
import { findInstalledApps } from "./open-targets";

// ============================================
// Server
// ============================================

export function registerIpcHandlers(): void {
  ipcMain.handle("server:status", () => {
    return getStatus();
  });

  ipcMain.handle("server:restart", async () => {
    await stopServer();
    startServer();
  });

  // ============================================
  // File operations
  // ============================================

  ipcMain.handle("file:copy", async (_event, src: string, dest?: string) => {
    if (!dest) {
      throw new Error("dest required for file copy");
    }
    await fs.promises.copyFile(src, dest);
  });

  ipcMain.handle("file:write", async (_event, data: ArrayBuffer, name: string) => {
    const tmpDir = path.join(app.getPath("temp"), "hive");
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const dest = path.join(tmpDir, name);
    await fs.promises.writeFile(dest, Buffer.from(data));
    return dest;
  });

  ipcMain.handle("file:readHtml", async (_event, filePath: string) => {
    return fs.promises.readFile(filePath, "utf-8");
  });

  ipcMain.handle("file:openPath", async (_event, filePath: string, _appName?: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle("file:revealInFolder", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("file:showOpenDialog", async (_event, options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title,
      properties: ["openFile", "multiSelections"],
      filters: options?.filters,
    });
    return result.canceled ? null : result.filePaths;
  });

  ipcMain.handle("file:showSaveDialog", async (_event, options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showSaveDialog({
      title: options?.title,
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    return result.canceled ? null : result.filePath;
  });

  // ============================================
  // Notifications
  // ============================================

  ipcMain.handle("notify:show", (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // ============================================
  // App targets (installed apps probe)
  // ============================================

  ipcMain.handle("app:getOpenTargets", async (_event, ext: string) => {
    return findInstalledApps(ext);
  });

  // ============================================
  // Tray + Server wiring
  // ============================================

  createTray();

  setStatusCallback((status: ServerStatus) => {
    updateTrayStatus(status);
    // Forward to renderer
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("server:statusChange", status);
    }
  });
}
