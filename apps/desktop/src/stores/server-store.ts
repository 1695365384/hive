import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

const SERVER_URL = "http://127.0.0.1:4450";
const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 30_000;

interface ServerState {
  restarting: boolean;
  startRestart: () => Promise<void>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  restarting: false,

  startRestart: async () => {
    set({ restarting: true });

    try {
      await invoke("restart_server");
    } catch (err) {
      set({ restarting: false });
      throw err;
    }

    // Poll health endpoint until server is ready or timeout
    const start = Date.now();
    const poll = async (): Promise<void> => {
      if (!get().restarting) return;

      try {
        const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          set({ restarting: false });
          invoke("show_notification", { title: "Hive", body: "Server restarted successfully" }).catch(() => {});
          return;
        }
      } catch {
        // Server not ready yet, continue polling
      }

      if (Date.now() - start > POLL_TIMEOUT_MS) {
        set({ restarting: false });
        invoke("show_notification", { title: "Hive", body: "Server restart timed out" }).catch(() => {});
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  },
}));
