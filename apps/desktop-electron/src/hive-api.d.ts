/**
 * Type declarations for the window.hive API exposed by the preload script.
 * Mirrors electron/preload.ts HiveAPI interface.
 */
export interface HiveServerStatus {
  state: "running" | "stopped" | "failed";
  pid: number | null;
  restartCount: number;
}

export interface OpenTargetInfo {
  label: string;
  openWith: string;
  icon?: string | null;
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
    showOpenDialog: (options?: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string[] | null>;
    showSaveDialog: (options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | null>;
  };
  db: {
    execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    select: <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
  };
  notify: {
    show: (title: string, body: string) => Promise<void>;
  };
  app: {
    getOpenTargets: (ext: string) => Promise<OpenTargetInfo[]>;
  };
}

declare global {
  interface Window {
    hive?: HiveAPI;
  }
}

export {};
