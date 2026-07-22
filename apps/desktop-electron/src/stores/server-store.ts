import { create } from "zustand";

const SERVER_URL = "http://127.0.0.1:4450";
const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 30_000;

interface ServerState {
  restarting: boolean;
  startRestart: () => Promise<void>;
}

/** Check if we're running inside Electron (vs browser dev mode). */
function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.hive;
}

export const useServerStore = create<ServerState>((set, get) => ({
  restarting: false,

  startRestart: async () => {
    set({ restarting: true });

    if (isElectron()) {
      try {
        await window.hive!.server.restart();
      } catch (err) {
        set({ restarting: false });
        throw err;
      }
    }

    const start = Date.now();
    for (;;) {
      if (!get().restarting) return;

      try {
        const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          set({ restarting: false });
          if (isElectron()) {
            window.hive!.notify.show("Hive", "Server restarted successfully").catch(() => {});
          }
          return;
        }
      } catch {
        // Server not ready yet, continue polling
      }

      if (Date.now() - start > POLL_TIMEOUT_MS) {
        set({ restarting: false });
        if (isElectron()) {
          window.hive!.notify.show("Hive", "Server restart timed out").catch(() => {});
        }
        throw new Error("Server restart timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  },
}));
