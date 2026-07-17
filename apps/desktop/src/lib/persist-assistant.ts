import * as db from "./db";
import type { ContentPart } from "../types/chat";

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, ContentPart[]>();

const DEBOUNCE_MS = 1500;

/** Debounced persist of assistant content (D3.3). */
export function schedulePersistAssistant(
  msgId: string | null | undefined,
  content: ContentPart[],
): void {
  if (!msgId) return;
  pending.set(msgId, content);
  const prev = timers.get(msgId);
  if (prev) clearTimeout(prev);
  timers.set(
    msgId,
    setTimeout(() => {
      timers.delete(msgId);
      const latest = pending.get(msgId);
      pending.delete(msgId);
      if (!latest) return;
      db.updateMessageContent(msgId, JSON.stringify(latest)).catch((err) => {
        console.warn("[persist] updateMessageContent failed", msgId, err);
      });
    }, DEBOUNCE_MS),
  );
}

/** Flush immediately (session switch / complete). */
export function flushPersistAssistant(msgId: string | null | undefined): void {
  if (!msgId) return;
  const prev = timers.get(msgId);
  if (prev) clearTimeout(prev);
  timers.delete(msgId);
  const latest = pending.get(msgId);
  pending.delete(msgId);
  if (!latest) return;
  db.updateMessageContent(msgId, JSON.stringify(latest)).catch((err) => {
    console.warn("[persist] flush failed", msgId, err);
  });
}

/** Immediate persist without debounce (file upsert / heal). */
export function persistAssistantNow(
  msgId: string | null | undefined,
  content: ContentPart[],
): void {
  if (!msgId) return;
  const t = timers.get(msgId);
  if (t) clearTimeout(t);
  timers.delete(msgId);
  pending.delete(msgId);
  db.updateMessageContent(msgId, JSON.stringify(content)).catch((err) => {
    console.warn("[persist] immediate failed", msgId, err);
  });
}
