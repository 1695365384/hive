import { getChatWsClient } from "./ws-client";
import { finalizeRunContent } from "./finalize-run-content";
import { persistAssistantNow } from "./persist-assistant";
import { appendContentPart, patchAssistantMessage } from "./chat-message-ops";
import { useRunStore } from "../stores/run-store";
import { useActivityStore } from "../stores/activity-store";
import i18n from "../i18n";

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
    const cancelledLabel = i18n.t("chat.executionCancelled");
    const next = patchAssistantMessage(cached, run.assistantMsgId, (content) => {
      const hasCancelText = content.some(
        (p) => p.type === "text" && p.text.trim() === cancelledLabel,
      );
      let c = hasCancelText
        ? content
        : appendContentPart(content, { type: "text", text: cancelledLabel });
      return finalizeRunContent(c, { cancelled: true });
    });
    store.setMessageCache(sessionId, next);
    const assistant = next.find((m) => m.id === run.assistantMsgId);
    if (assistant) persistAssistantNow(assistant.id, assistant.content);
  }

  store.setPendingAsk(sessionId, null);
  store.clearToastsForSession(sessionId);
  store.beginSettling(sessionId);

  // Sidebar stop does not go through ChatPage.handleCancel — clear the global dock here.
  if (store.viewingSessionId === sessionId) {
    useActivityStore.getState().setCompleted();
  }

  window.setTimeout(() => {
    const still = useRunStore.getState().runs[sessionId];
    if (still?.phase === "settling") {
      useRunStore.getState().clearRun(sessionId);
    }
  }, 2_050);

  return { ok: rpcOk, error: rpcError };
}
