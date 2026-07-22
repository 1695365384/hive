/**
 * Electron main process entry point.
 *
 * Creates the BrowserWindow, registers IPC handlers, starts the hive server,
 * wires up the system tray, and handles graceful shutdown.
 */
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { startServer, stopServer, setStatusCallback } from "./server";
import { registerIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Hive",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:1420");
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers();
  startServer();

  // Forward server status changes to all renderer windows
  setStatusCallback((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("server:statusChange", status);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", async () => {
  await stopServer();
});
