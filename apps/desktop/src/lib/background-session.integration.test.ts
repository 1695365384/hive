import { beforeEach, describe, expect, it } from "vitest";
import { useRunStore } from "../stores/run-store";
import { appendContentPart, patchAssistantMessage } from "./chat-message-ops";
import { finalizeRunContent } from "./finalize-run-content";
import type { ChatMessage, ContentPart } from "../types/chat";

/**
 * Simulates ChatPage background mutate path (WS → messageCache by threadId)
 * without mounting React — switch viewing session must not cancel the run.
 */
function applyBackgroundTextDelta(threadId: string, delta: string) {
  const store = useRunStore.getState();
  const run = store.getRun(threadId);
  if (!run) return;
  store.updateMessageCache(threadId, (prev) =>
    patchAssistantMessage(prev, run.assistantMsgId, (content) =>
      appendContentPart(content, { type: "text", text: delta }),
    ),
  );
}

function completeBackgroundRun(threadId: string, opts?: { error?: string; cancelled?: boolean }) {
  const store = useRunStore.getState();
  const run = store.getRun(threadId);
  if (!run) return;
  const isError = !!opts?.error;
  store.updateMessageCache(threadId, (prev) =>
    patchAssistantMessage(prev, run.assistantMsgId, (content) =>
      finalizeRunContent(content, {
        cancelled: opts?.cancelled,
        success: !isError && !opts?.cancelled,
        error: opts?.error,
      }),
    ),
  );
  store.beginSettling(threadId);
  if (!isError && !opts?.cancelled && store.viewingSessionId !== threadId) {
    store.pushToast({ sessionId: threadId, kind: "complete", title: run.title });
  }
}

describe("background session (mock WS path)", () => {
  beforeEach(() => {
    useRunStore.setState({
      runs: {},
      pendingAsk: {},
      messageCache: {},
      toasts: [],
      viewingSessionId: null,
    });
  });

  it("keeps run + updates cache after switching away", () => {
    const store = useRunStore.getState();
    const assistantMsgId = "asst-a";
    const msgs: ChatMessage[] = [
      { id: "u1", role: "user", content: [{ type: "text", text: "go" }], createdAt: 1 },
      { id: assistantMsgId, role: "assistant", content: [], createdAt: 2 },
    ];

    store.beginRun({ sessionId: "A", assistantMsgId, title: "Task A" });
    store.setMessageCache("A", msgs);
    store.setViewingSessionId("A");
    expect(store.hasLiveRun("A")).toBe(true);
    expect(useRunStore.getState().getInFlightSessionId()).toBe("A");

    // Switch lens to B — no cancel
    store.setViewingSessionId("B");
    expect(useRunStore.getState().hasLiveRun("A")).toBe(true);
    expect(useRunStore.getState().runs["A"]?.phase).toBe("running");

    applyBackgroundTextDelta("A", "hello ");
    applyBackgroundTextDelta("A", "world");

    const cached = useRunStore.getState().getMessageCache("A")!;
    const assistant = cached.find((m) => m.id === assistantMsgId)!;
    const texts = (assistant.content as ContentPart[])
      .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("");
    expect(texts).toContain("hello");
    expect(texts).toContain("world");

    // Badge still live; busy blocks another session send
    expect(useRunStore.getState().getInFlightSessionId()).toBe("A");
  });

  it("toasts complete when not viewing; no toast on error", () => {
    const store = useRunStore.getState();
    store.beginRun({ sessionId: "A", assistantMsgId: "m1", title: "A" });
    store.setMessageCache("A", [
      { id: "m1", role: "assistant", content: [{ type: "text", text: "x" }], createdAt: 1 },
    ]);
    store.setViewingSessionId("B");

    completeBackgroundRun("A");
    expect(useRunStore.getState().toasts).toHaveLength(1);
    expect(useRunStore.getState().toasts[0]!.kind).toBe("complete");
    expect(useRunStore.getState().hasLiveRun("A")).toBe(false);

    useRunStore.setState({ toasts: [], runs: {} });
    store.beginRun({ sessionId: "A", assistantMsgId: "m2", title: "A2" });
    store.setMessageCache("A", [
      { id: "m2", role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "Bash", args: {} }], createdAt: 1 },
    ]);
    store.setViewingSessionId("B");
    completeBackgroundRun("A", { error: "boom" });
    expect(useRunStore.getState().toasts).toHaveLength(0);
    expect(useRunStore.getState().hasLiveRun("A")).toBe(false);
  });

  it("waiting toast when ask-user arrives off-lens", () => {
    const store = useRunStore.getState();
    store.beginRun({ sessionId: "A", assistantMsgId: "m1", title: "Need you" });
    store.setViewingSessionId("B");
    store.setPendingAsk("A", { askId: "q1", question: "OK?", options: [] });
    store.setPhase("A", "waiting");
    store.pushToast({ sessionId: "A", kind: "waiting", title: "Need you" });

    expect(useRunStore.getState().runs["A"]?.phase).toBe("waiting");
    expect(useRunStore.getState().toasts[0]!.kind).toBe("waiting");
    expect(useRunStore.getState().getPendingAsk("A")?.askId).toBe("q1");
  });
});
