/**
 * Preload script — exposes a safe, typed API to the renderer via contextBridge.
 *
 * Every IPC channel here MUST have a corresponding ipcMain.handle in ipc-handlers.ts.
 * This is the ONLY place where ipcRenderer is imported.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface HiveServerStatus {
  state: "running" | "stopped" | "failed";
  pid: number | null;
  restartCount: number;
}

export interface HiveAPI {
  server: {
    getStatus: () => Promise<HiveServerStatus>;
    restart: () => Promise<void>;
    onStatusChange: (cb: (status: HiveServerStatus) => void) => void;
  };
  file: {
    copy: (src: string, dest?: string) => Promise<void>;
    write: (data: ArrayBuffer, name: string) => Promise<string>;
    readHtml: (filePath: string) => Promise<string>;
    readBytes: (filePath: string) => Promise<ArrayBuffer>;
    openPath: (path: string, appName?: string) => Promise<void>;
    revealInFolder: (path: string) => Promise<void>;
    showOpenDialog: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[] | null>;
    showSaveDialog: (options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  };
  db: {
    execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    select: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
  };
  notify: {
    show: (title: string, body: string) => Promise<void>;
  };
  app: {
    getOpenTargets: (ext: string) => Promise<Array<{ label: string; openWith: string; icon?: string | null }>>;
  };
}

const api: HiveAPI = {
  server: {
    getStatus: () => ipcRenderer.invoke("server:status"),
    restart: () => ipcRenderer.invoke("server:restart"),
    onStatusChange: (cb: (status: HiveServerStatus) => void) => {
      ipcRenderer.on("server:statusChange", (_event, status) => cb(status));
    },
  },
  file: {
    copy: (src: string, dest?: string) => ipcRenderer.invoke("file:copy", src, dest),
    write: (data: ArrayBuffer, name: string) => ipcRenderer.invoke("file:write", data, name),
    readHtml: (filePath: string) => ipcRenderer.invoke("file:readHtml", filePath),
    readBytes: (filePath: string) => ipcRenderer.invoke("file:readBytes", filePath),
    openPath: (path: string, appName?: string) => ipcRenderer.invoke("file:openPath", path, appName),
    revealInFolder: (path: string) => ipcRenderer.invoke("file:revealInFolder", path),
    showOpenDialog: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke("file:showOpenDialog", options),
    showSaveDialog: (options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke("file:showSaveDialog", options),
  },
  db: {
    execute: (sql: string, params?: unknown[]) => ipcRenderer.invoke("db:execute", sql, params),
    select: <T = unknown>(sql: string, params?: unknown[]) => ipcRenderer.invoke("db:select", sql, params) as Promise<T[]>,
  },
  notify: {
    show: (title: string, body: string) => ipcRenderer.invoke("notify:show", title, body),
  },
  app: {
    getOpenTargets: (ext: string) => ipcRenderer.invoke("app:getOpenTargets", ext),
  },
};

contextBridge.exposeInMainWorld("hive", api);
