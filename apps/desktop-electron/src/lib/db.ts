/**
 * db.ts — Local session + message storage for Electron.
 *
 * Uses browser-db.ts (localStorage) when running in Electron renderer.
 * For production, a better-sqlite3 IPC backend can be added later.
 */
import type { MessageRow, SessionRow } from "./db-types";
import * as browser from "./browser-db";

export type { MessageRow, SessionRow };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _isElectron = false;

/** Check if we're running inside Electron (vs Vite dev server in browser). */
function isElectronEnv(): boolean {
  return typeof window !== "undefined" && !!window.hive;
}

function useBrowserStore(): boolean {
  return !isElectronEnv();
}

// In Electron renderer, use browser-db (localStorage) for now.
// Future: add better-sqlite3 IPC for proper SQLite.

// ============================================
// Session CRUD
// ============================================

export async function listSessions(): Promise<SessionRow[]> {
  if (useBrowserStore()) return browser.browserListSessions();
  return browser.browserListSessions();
}

export async function getSession(id: string): Promise<SessionRow | null> {
  if (useBrowserStore()) return browser.browserGetSession(id);
  return browser.browserGetSession(id);
}

export async function createSession(id: string, title?: string): Promise<void> {
  if (useBrowserStore()) return browser.browserCreateSession(id, title);
  return browser.browserCreateSession(id, title);
}

export async function deleteSession(id: string): Promise<void> {
  if (useBrowserStore()) return browser.browserDeleteSession(id);
  return browser.browserDeleteSession(id);
}

export async function renameSession(id: string, title: string): Promise<void> {
  if (useBrowserStore()) return browser.browserRenameSession(id, title);
  return browser.browserRenameSession(id, title);
}

export async function touchSession(id: string): Promise<void> {
  if (useBrowserStore()) return browser.browserTouchSession(id);
  return browser.browserTouchSession(id);
}

// ============================================
// Messages
// ============================================

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  if (useBrowserStore()) return browser.browserListMessages(sessionId);
  return browser.browserListMessages(sessionId);
}

export async function insertMessage(
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  contentJson: string,
  createdAt: number,
): Promise<void> {
  if (useBrowserStore()) {
    browser.browserInsertMessage(id, sessionId, role, contentJson, createdAt);
    return;
  }
  browser.browserInsertMessage(id, sessionId, role, contentJson, createdAt);
}

export async function updateMessageContent(
  messageId: string,
  contentJson: string,
): Promise<void> {
  if (useBrowserStore()) {
    browser.browserUpdateMessageContent(messageId, contentJson);
    return;
  }
  browser.browserUpdateMessageContent(messageId, contentJson);
}

export async function deleteSessionMessages(sessionId: string): Promise<void> {
  if (useBrowserStore()) {
    browser.browserDeleteSessionMessages(sessionId);
    return;
  }
  browser.browserDeleteSessionMessages(sessionId);
}

/** Always true in Electron (browser-db is always available). */
export function isDbAvailable(): boolean {
  return true;
}
