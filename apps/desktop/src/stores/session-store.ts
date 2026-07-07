import { create } from "zustand";
import * as db from "../lib/db";
import type { Session } from "../types/chat";

interface SessionState {
  /** All sessions (sorted by updated_at desc) */
  sessions: Session[];
  /** Currently active session ID */
  currentId: string | null;
  /** Whether DB is loading */
  loading: boolean;
  /** Whether DB is available */
  available: boolean;
  /** Error message */
  error: string | null;

  // ── Actions ──

  /** Initialize: detect Tauri env, load sessions, select most recent */
  init: () => Promise<void>;
  /** Reload session list from DB */
  loadSessions: () => Promise<void>;
  /** Create a new session and select it */
  createSession: () => Promise<string>;
  /** Delete a session (and its messages) */
  deleteSession: (id: string) => Promise<void>;
  /** Rename a session */
  renameSession: (id: string, title: string) => Promise<void>;
  /** Switch to a session */
  selectSession: (id: string) => Promise<void>;
  /** Auto-title from first user message */
  autoTitle: (id: string, text: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentId: null,
  loading: true,
  available: false,
  error: null,

  // ── Init ──

  init: async () => {
    set({ loading: true, error: null });
    try {
      // Probe whether Tauri SQL is available
      const list = await db.listSessions().catch(() => null);
      if (list === null) {
        // Browser mode or SQL unavailable
        set({ available: false, loading: false, sessions: [] });
        return;
      }
      set({ available: true, sessions: mapSessions(list) });
      // Auto-select most recent
      const sorted = [...list].sort((a, b) => b.updated_at - a.updated_at);
      if (sorted.length > 0) {
        set({ currentId: sorted[0].id });
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    } finally {
      set({ loading: false });
    }
  },

  // ── Sessions ──

  loadSessions: async () => {
    try {
      const list = await db.listSessions();
      set({ sessions: mapSessions(list) });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createSession: async () => {
    const id = crypto.randomUUID();
    try {
      await db.createSession(id);
      await get().loadSessions();
      set({ currentId: id });
      return id;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteSession: async (id: string) => {
    try {
      await db.deleteSession(id);
      const { currentId, sessions } = get();
      // If deleting the current session, switch to the next one
      if (currentId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        const nextId = remaining.length > 0 ? remaining[0].id : null;
        set({ currentId: nextId });
      }
      await get().loadSessions();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  renameSession: async (id: string, title: string) => {
    try {
      await db.renameSession(id, title);
      await get().loadSessions();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  selectSession: async (id: string) => {
    set({ currentId: id });
  },

  autoTitle: async (id: string, text: string) => {
    if (!text || text.length > 80) return;
    try {
      await db.renameSession(id, text);
      await get().loadSessions();
    } catch {
      // Silently fail — not critical
    }
  },
}));

// ── Helpers ──

function mapSessions(rows: db.SessionRow[]): Session[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}
