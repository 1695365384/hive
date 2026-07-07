/**
 * db.ts — Local SQLite database service
 *
 * Uses @tauri-apps/plugin-sql for persistent session + message storage.
 * Falls back gracefully when running in browser (dev:ui) where Tauri APIs are unavailable.
 */

import type Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;
let _isTauri = false;

/** Check if we're running inside Tauri (vs browser dev mode) */
function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Get or initialize the database connection */
async function getDb(): Promise<Database> {
  if (db) return db;

  if (!isTauriEnv()) {
    _isTauri = false;
    throw new Error("SQLite not available in browser mode");
  }
  _isTauri = true;

  const { default: SqlDatabase } = await import("@tauri-apps/plugin-sql");
  db = await SqlDatabase.load("sqlite:hive.db");

  // Migrate: create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_session
    ON messages(session_id, created_at)
  `);

  return db;
}

// ============================================
// Session CRUD
// ============================================

export interface SessionRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export async function listSessions(): Promise<SessionRow[]> {
  const d = await getDb();
  return d.select<SessionRow[]>(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            COALESCE(cnt.c, 0) AS message_count
     FROM sessions s
     LEFT JOIN (SELECT session_id, COUNT(*) AS c FROM messages GROUP BY session_id) cnt
       ON cnt.session_id = s.id
     ORDER BY s.updated_at DESC`
  );
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const d = await getDb();
  const rows = await d.select<SessionRow[]>(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            COALESCE(cnt.c, 0) AS message_count
     FROM sessions s
     LEFT JOIN (SELECT session_id, COUNT(*) AS c FROM messages GROUP BY session_id) cnt
       ON cnt.session_id = s.id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createSession(id: string, title?: string): Promise<void> {
  const d = await getDb();
  const now = Date.now();
  await d.execute(
    "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, title ?? "New Chat", now, now]
  );
}

export async function deleteSession(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM messages WHERE session_id = ?", [id]);
  await d.execute("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function renameSession(id: string, title: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
    [title, Date.now(), id]
  );
}

export async function touchSession(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", [Date.now(), id]);
}

// ============================================
// Messages
// ============================================

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  const d = await getDb();
  return d.select<MessageRow[]>(
    "SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
    [sessionId]
  );
}

export async function insertMessage(
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  contentJson: string,
  createdAt: number
): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT OR IGNORE INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, sessionId, role, contentJson, createdAt]
  );
}

export async function updateMessageContent(
  messageId: string,
  contentJson: string
): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE messages SET content = ? WHERE id = ?", [
    contentJson,
    messageId,
  ]);
}

export async function deleteSessionMessages(sessionId: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM messages WHERE session_id = ?", [sessionId]);
}

/** Check if the database is available (Tauri mode) */
export function isDbAvailable(): boolean {
  return _isTauri || isTauriEnv();
}
