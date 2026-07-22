import { create } from "zustand";

export interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  timestamp: number;
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface LogState {
  logs: LogEntry[];
  unreadCount: number;
  errorCount: number;
  lastId: string | null;
  selectedDate: string | null; // null = today (live mode)
  addLogs: (entries: LogEntry[]) => void;
  clearUnread: () => void;
  clearLogs: () => void;
  setSelectedDate: (date: string | null) => void;
  setHistoryLogs: (entries: LogEntry[]) => void;
}

const MAX_LOGS = 5000;

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  unreadCount: 0,
  errorCount: 0,
  lastId: null,
  selectedDate: null,

  addLogs: (entries) =>
    set((state) => {
      if (entries.length === 0) return state;

      // Deduplicate by id (React StrictMode remount can cause duplicate fetches)
      const existingIds = new Set(state.logs.map((e) => e.id));
      const unique = entries.filter((e) => !existingIds.has(e.id));
      if (unique.length === 0) return state;

      const newErrors = unique.filter((e) => e.level === "error").length;
      const newUnread = unique.length;
      const merged = [...state.logs, ...unique].slice(-MAX_LOGS);
      const lastId = unique[unique.length - 1]?.id ?? state.lastId;

      return {
        logs: merged,
        errorCount: state.errorCount + newErrors,
        unreadCount: state.unreadCount + newUnread,
        lastId,
      };
    }),

  clearUnread: () => set({ unreadCount: 0 }),

  clearLogs: () => set({ logs: [], unreadCount: 0, errorCount: 0, lastId: null }),

  setSelectedDate: (date) => set({ selectedDate: date, logs: [], unreadCount: 0, errorCount: 0, lastId: null }),

  setHistoryLogs: (entries) =>
    set(() => ({
      logs: entries,
      lastId: entries.length > 0 ? entries[entries.length - 1].id : null,
    })),
}));

export function isLiveMode(): boolean {
  return useLogStore.getState().selectedDate === null;
}

export function getTodayDateStr(): string {
  return getTodayStr();
}
