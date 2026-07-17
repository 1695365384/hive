import { getChatWsClient } from "./ws-client";
import { finalizeRunContent } from "./finalize-run-content";
import { persistAssistantNow } from "./persist-assistant";
import { patchAssistantMessage } from "./chat-message-ops";
import { useRunStore } from "../stores/run-store";

/**
 * Cancel an in-flight session run (sidebar stop / delete-before-cancel).
 * On RPC failure still locally finalize (M9).
 */
export async function cancelSessionRun(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const store = useRunStore.getState();
  const run = store.getRun(sessionId) ?? store.getRunOrSettling(sessionId);
  if (!run || run.phase === "settling") {
    return { ok: true };
  }

  let rpcOk = true;
  let rpcError: string | undefined;
  try {
    await getChatWsClient().request("chat.cancel", { threadId: sessionId });
  } catch (err) {
    rpcOk = false;
    rpcError = err instanceof Error ? err.message : String(err);
    console.warn("[run] chat.cancel failed", sessionId, rpcError);
  }

  // Local finalize immediately so UI cannot keep spinning if complete event is late/lost
  const cached = store.getMessageCache(sessionId);
  if (cached && run.assistantMsgId) {
    const next = patchAssistantMessage(cached, run.assistantMsgId, (content) =>
      finalizeRunContent(content, { cancelled: true }),
    );
    store.setMessageCache(sessionId, next);
    const assistant = next.find((m) => m.id === run.assistantMsgId);
    if (assistant) persistAssistantNow(assistant.id, assistant.content);
  }

  store.setPendingAsk(sessionId, null);
  store.clearToastsForSession(sessionId);
  store.beginSettling(sessionId);
  window.setTimeout(() => {
    const still = useRunStore.getState().runs[sessionId];
    if (still?.phase === "settling") {
      useRunStore.getState().clearRun(sessionId);
    }
  }, 2_050);

  return { ok: rpcOk, error: rpcError };
}
