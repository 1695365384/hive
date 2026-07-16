/**
 * Browser-mode persistence for Vite preview (`pnpm dev:ui`).
 * Tauri builds use SQLite via @tauri-apps/plugin-sql instead.
 */

import type { MessageRow, SessionRow } from "./db-types";

export type { MessageRow, SessionRow };

const STORAGE_KEY = "hive.browser-db.v1";

interface BrowserDb {
  sessions: SessionRow[];
  messages: MessageRow[];
  currentId: string | null;
}

/** In-process cache; localStorage is the reload-durable source of truth in browsers. */
let memoryCache: BrowserDb | null = null;

function emptyDb(): BrowserDb {
  return { sessions: [], messages: [], currentId: null };
}

function readDb(): BrowserDb {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        memoryCache = emptyDb();
        return memoryCache;
      }
      const parsed = JSON.parse(raw) as Partial<BrowserDb>;
      memoryCache = {
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        currentId: typeof parsed.currentId === "string" ? parsed.currentId : null,
      };
      return memoryCache;
    } catch {
      // fall through to memory
    }
  }
  if (!memoryCache) memoryCache = emptyDb();
  return memoryCache;
}

function writeDb(data: BrowserDb): void {
  memoryCache = data;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota / private mode — keep memory only
  }
}

export function browserListSessions(): SessionRow[] {
  const data = readDb();
  return [...data.sessions].sort((a, b) => b.updated_at - a.updated_at);
}

export function browserGetSession(id: string): SessionRow | null {
  return readDb().sessions.find((s) => s.id === id) ?? null;
}

export function browserCreateSession(id: string, title?: string): void {
  const data = readDb();
  const now = Date.now();
  data.sessions.unshift({
    id,
    title: title ?? "New Chat",
    created_at: now,
    updated_at: now,
    message_count: 0,
  });
  data.currentId = id;
  writeDb(data);
}

export function browserDeleteSession(id: string): void {
  const data = readDb();
  data.sessions = data.sessions.filter((s) => s.id !== id);
  data.messages = data.messages.filter((m) => m.session_id !== id);
  if (data.currentId === id) {
    data.currentId = data.sessions[0]?.id ?? null;
  }
  writeDb(data);
}

export function browserRenameSession(id: string, title: string): void {
  const data = readDb();
  const now = Date.now();
  data.sessions = data.sessions.map((s) =>
    s.id === id ? { ...s, title, updated_at: now } : s
  );
  writeDb(data);
}

export function browserTouchSession(id: string): void {
  const data = readDb();
  const now = Date.now();
  data.sessions = data.sessions.map((s) =>
    s.id === id ? { ...s, updated_at: now } : s
  );
  writeDb(data);
}

export function browserListMessages(sessionId: string): MessageRow[] {
  return readDb()
    .messages.filter((m) => m.session_id === sessionId)
    .sort((a, b) => a.created_at - b.created_at);
}

export function browserInsertMessage(
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  contentJson: string,
  createdAt: number
): void {
  const data = readDb();
  if (data.messages.some((m) => m.id === id)) return;
  data.messages.push({
    id,
    session_id: sessionId,
    role,
    content: contentJson,
    created_at: createdAt,
  });
  data.sessions = data.sessions.map((s) =>
    s.id === sessionId
      ? {
          ...s,
          updated_at: createdAt,
          message_count: data.messages.filter((m) => m.session_id === sessionId).length,
        }
      : s
  );
  writeDb(data);
}

export function browserUpdateMessageContent(messageId: string, contentJson: string): void {
  const data = readDb();
  data.messages = data.messages.map((m) =>
    m.id === messageId ? { ...m, content: contentJson } : m
  );
  writeDb(data);
}

export function browserDeleteSessionMessages(sessionId: string): void {
  const data = readDb();
  data.messages = data.messages.filter((m) => m.session_id !== sessionId);
  data.sessions = data.sessions.map((s) =>
    s.id === sessionId ? { ...s, message_count: 0 } : s
  );
  writeDb(data);
}

/** Test helper — wipe browser DB */
export function browserReset(): void {
  memoryCache = null;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
