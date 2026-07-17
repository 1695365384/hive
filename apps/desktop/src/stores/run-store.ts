import { create } from "zustand";
import type { ChatMessage } from "../types/chat";

export type RunPhase = "running" | "waiting" | "settling";

export type SessionRun = {
  sessionId: string;
  assistantMsgId: string;
  phase: RunPhase;
  title: string;
  startedAt: number;
  lastError?: string;
  /** settling until timestamp (ms) */
  settleUntil?: number;
};

export type PendingAsk = {
  askId: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
};

export type BgToastKind = "complete" | "waiting";

export type BgToast = {
  id: string;
  sessionId: string;
  kind: BgToastKind;
  title: string;
  createdAt: number;
};

/** Keep accepting late agent.file briefly after agent.complete. */
export const RUN_SETTLE_MS = 2_000;

type RunState = {
  runs: Record<string, SessionRun>;
  pendingAsk: Record<string, PendingAsk>;
  messageCache: Record<string, ChatMessage[]>;
  toasts: BgToast[];
  viewingSessionId: string | null;

  setViewingSessionId: (id: string | null) => void;

  beginRun: (opts: {
    sessionId: string;
    assistantMsgId: string;
    title: string;
  }) => void;
  setPhase: (sessionId: string, phase: RunPhase, extra?: Partial<SessionRun>) => void;
  beginSettling: (sessionId: string) => void;
  clearRun: (sessionId: string) => void;

  getRun: (sessionId: string) => SessionRun | undefined;
  getRunOrSettling: (sessionId: string) => SessionRun | undefined;
  hasLiveRun: (sessionId: string) => boolean;
  getInFlightSessionId: () => string | null;

  setPendingAsk: (sessionId: string, ask: PendingAsk | null) => void;
  getPendingAsk: (sessionId: string) => PendingAsk | undefined;

  setMessageCache: (sessionId: string, messages: ChatMessage[]) => void;
  getMessageCache: (sessionId: string) => ChatMessage[] | undefined;
  updateMessageCache: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => ChatMessage[] | undefined;

  pushToast: (toast: Omit<BgToast, "id" | "createdAt">) => void;
  dismissToast: (id: string) => void;
  clearToastsForSession: (sessionId: string) => void;
};

export const useRunStore = create<RunState>((set, get) => ({
  runs: {},
  pendingAsk: {},
  messageCache: {},
  toasts: [],
  viewingSessionId: null,

  setViewingSessionId: (id) => set({ viewingSessionId: id }),

  beginRun: ({ sessionId, assistantMsgId, title }) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [sessionId]: {
          sessionId,
          assistantMsgId,
          phase: "running",
          title,
          startedAt: Date.now(),
        },
      },
    })),

  setPhase: (sessionId, phase, extra) =>
    set((state) => {
      const prev = state.runs[sessionId];
      if (!prev) return state;
      return {
        runs: {
          ...state.runs,
          [sessionId]: { ...prev, ...extra, phase },
        },
      };
    }),

  beginSettling: (sessionId) =>
    set((state) => {
      const prev = state.runs[sessionId];
      if (!prev) return state;
      return {
        runs: {
          ...state.runs,
          [sessionId]: {
            ...prev,
            phase: "settling",
            settleUntil: Date.now() + RUN_SETTLE_MS,
          },
        },
      };
    }),

  clearRun: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.runs;
      const { [sessionId]: __, ...askRest } = state.pendingAsk;
      return { runs: rest, pendingAsk: askRest };
    }),

  getRun: (sessionId) => {
    const run = get().runs[sessionId];
    if (!run) return undefined;
    if (run.phase === "settling") return undefined;
    return run;
  },

  getRunOrSettling: (sessionId) => {
    const run = get().runs[sessionId];
    if (!run) return undefined;
    if (run.phase === "settling") {
      if (run.settleUntil != null && Date.now() > run.settleUntil) {
        // Never clearRun synchronously here — callers may run during React render
        // (and Zustand setState mid-render throws / corrupts subscribers).
        queueMicrotask(() => {
          const still = get().runs[sessionId];
          if (
            still?.phase === "settling" &&
            still.settleUntil != null &&
            Date.now() > still.settleUntil
          ) {
            get().clearRun(sessionId);
          }
        });
        return undefined;
      }
    }
    return run;
  },

  hasLiveRun: (sessionId) => {
    const run = get().runs[sessionId];
    return !!run && (run.phase === "running" || run.phase === "waiting");
  },

  getInFlightSessionId: () => {
    const runs = get().runs;
    for (const id of Object.keys(runs)) {
      const r = runs[id]!;
      if (r.phase === "running" || r.phase === "waiting") return id;
    }
    return null;
  },

  setPendingAsk: (sessionId, ask) =>
    set((state) => {
      if (!ask) {
        const { [sessionId]: _, ...rest } = state.pendingAsk;
        return { pendingAsk: rest };
      }
      return { pendingAsk: { ...state.pendingAsk, [sessionId]: ask } };
    }),

  getPendingAsk: (sessionId) => get().pendingAsk[sessionId],

  setMessageCache: (sessionId, messages) =>
    set((state) => ({
      messageCache: { ...state.messageCache, [sessionId]: messages },
    })),

  getMessageCache: (sessionId) => get().messageCache[sessionId],

  updateMessageCache: (sessionId, updater) => {
    const prev = get().messageCache[sessionId];
    if (!prev) return undefined;
    const next = updater(prev);
    set((state) => ({
      messageCache: { ...state.messageCache, [sessionId]: next },
    }));
    return next;
  },

  pushToast: (toast) =>
    set((state) => {
      const dedupeKey = `${toast.sessionId}:${toast.kind}`;
      const filtered = state.toasts.filter(
        (t) => `${t.sessionId}:${t.kind}` !== dedupeKey,
      );
      return {
        toasts: [
          ...filtered,
          {
            ...toast,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
          },
        ],
      };
    }),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToastsForSession: (sessionId) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.sessionId !== sessionId),
    })),
}));
