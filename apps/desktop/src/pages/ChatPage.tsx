import { useState, useRef, useEffect, useCallback } from "react";
import { useChatWsClient } from "../hooks/use-chat-ws-client";
import { getChatWsClient } from "../lib/ws-client";
import { useFileUpload } from "../hooks/use-file-upload";
import { FilePreviewList } from "../components/FilePreview";
import { ImagePreview } from "../components/ImagePreview";
import { PreviewSidebar } from "../components/preview/PreviewSidebar";
import { isPreviewableFile } from "../components/preview/detect-preview";
import { usePreviewStore } from "../stores/preview-store";
import { useSessionStore } from "../stores/session-store";
import { MessageBubble } from "../components/chat/MessageBubble";
import { ActivityDock } from "../components/chat/ActivityDock";
import { ColdStartPulse } from "../components/chat/ColdStartPulse";
import { formatToolLabel } from "../components/chat/activity-labels";
import { formatWorkerTitle } from "../components/chat/worker-labels";
import { useActivityStore } from "../stores/activity-store";
import * as db from "../lib/db";
import type { ChatMessage, ContentPart } from "../types/chat";
import { AskUserCard } from "../components/AskUserCard";
import { Send, Square, Paperclip } from "lucide-react";

function truncateActivityLabel(text: string, max = 48): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

// ============================================
// Chat Page
// ============================================

export function ChatPage() {
  const { state: chatState, request, onEvent } = useChatWsClient();
  const { pendingFiles, uploading, addFiles, removeFile, clearFiles } = useFileUpload();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Ask-user interaction state
  const [askUserData, setAskUserData] = useState<{
    askId: string;
    question: string;
    options: Array<{ label: string; description?: string }>;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const lastTextSeqRef = useRef(0);
  const lastReasoningSeqRef = useRef(0);
  const activityBeginRun = useActivityStore((s) => s.beginRun);
  const activitySetWorking = useActivityStore((s) => s.setWorking);
  const activitySetWaiting = useActivityStore((s) => s.setWaiting);
  const activitySetLastCompleted = useActivityStore((s) => s.setLastCompleted);
  const activityClearWaiting = useActivityStore((s) => s.clearWaiting);
  const activitySetIdle = useActivityStore((s) => s.setIdle);

  // ── Session store integration ──
  const currentId = useSessionStore((s) => s.currentId);
  const sessions = useSessionStore((s) => s.sessions);
  const initStore = useSessionStore((s) => s.init);
  const createSession = useSessionStore((s) => s.createSession);
  const autoTitle = useSessionStore((s) => s.autoTitle);
  const storeLoading = useSessionStore((s) => s.loading);
  /** Track the assistant message ID so we can persist it on complete */
  const assistantMsgIdRef = useRef<string | null>(null);
  const assistantThreadIdRef = useRef<string | null>(null);

  const persistAssistantContent = useCallback((content: ContentPart[]) => {
    const msgId = assistantMsgIdRef.current;
    if (!msgId) return;
    db.updateMessageContent(msgId, JSON.stringify(content)).catch(() => {});
  }, []);

  // Init store on mount
  useEffect(() => {
    initStore();
  }, [initStore]);

  // When session changes (or first load), load messages from DB
  useEffect(() => {
    if (!currentId) return;
    const load = async () => {
      try {
        const rows = await db.listMessages(currentId);
        const msgs: ChatMessage[] = rows.map((r) => ({
          id: r.id,
          role: r.role as "user" | "assistant",
          content: JSON.parse(r.content) as ContentPart[],
          createdAt: r.created_at,
        }));
        setMessages(msgs);
      } catch {
        // DB not available — stay with empty messages
      }
    };
    load();
  }, [currentId]);

  // Create first session if none exists
  useEffect(() => {
    if (!storeLoading && sessions.length === 0) {
      createSession();
    }
  }, [storeLoading, sessions.length, createSession]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Lightbox event listener (for GroupedContentRenderer which has no direct state access)
  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent<string>).detail;
      if (typeof src === 'string') setLightboxSrc(src);
    };
    window.addEventListener('open-lightbox', handler);
    return () => window.removeEventListener('open-lightbox', handler);
  }, []);

  // Elapsed time for tool calls is per-step (startedAt on each tool-call part).

  // Message mutation helpers (stable references, no deps)
  const upsertFilePart = useCallback((part: Extract<ContentPart, { type: "file-attachment" }>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;

      const updated = { ...last, content: [...last.content] };
      const idx = updated.content.findIndex(
        (p) =>
          p.type === "file-attachment" &&
          (p.path === part.path || p.name === part.name)
      );

      if (idx >= 0) {
        updated.content[idx] = part;
      } else {
        updated.content.push(part);
      }

      persistAssistantContent(updated.content);
      return [...prev.slice(0, -1), updated];
    });
  }, [persistAssistantContent]);

  const appendPart = useCallback((part: ContentPart) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;

      const updated = { ...last, content: [...last.content] };

      if (part.type === "text") {
        const lastPart = updated.content[updated.content.length - 1];
        if (lastPart?.type === "text") {
          updated.content[updated.content.length - 1] = { ...lastPart, text: lastPart.text + part.text };
        } else {
          updated.content.push(part);
        }
      } else if (part.type === "reasoning") {
        const lastPart = updated.content[updated.content.length - 1];
        if (lastPart?.type === "reasoning") {
          updated.content[updated.content.length - 1] = { ...lastPart, text: lastPart.text + part.text };
        } else {
          updated.content.push(part);
        }
      } else {
        updated.content.push(part);
      }

      return [...prev.slice(0, -1), updated];
    });
  }, []);

  const updateToolResult = useCallback((toolCallId: string, result: unknown, isError?: boolean) => {
    const now = Date.now();
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.role !== "assistant") return msg;
        return {
          ...msg,
          content: msg.content.map((part) => {
            if (part.type !== "tool-call" || part.toolCallId !== toolCallId) return part;
            const durationMs = part.startedAt != null ? now - part.startedAt : undefined;
            return { ...part, result, isError, durationMs };
          }),
        };
      })
    );
  }, []);

  const failPendingRun = useCallback((message: string) => {
    setError(message);
    setIsRunning(false);
    activeThreadIdRef.current = null;
    activitySetIdle();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant" || last.content.length > 0) {
        return prev;
      }

      return [
        ...prev.slice(0, -1),
        { ...last, content: [{ type: "text", text: `处理失败：${message}` }] },
      ];
    });
  }, [activitySetIdle]);

  // Stable WS event handlers — useCallback ensures dedup in WsClient Set
  // across React.StrictMode double-mount cycles
  const handleReasoning = useCallback((data: { threadId: string; text: string; seq: number; workerId?: string; workerType?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    if (data.seq <= lastReasoningSeqRef.current) return;
    lastReasoningSeqRef.current = data.seq;
    activitySetWorking({ detail: "思考中" });
    appendPart({ type: "reasoning", text: data.text, workerId: data.workerId, workerType: data.workerType });
  }, [appendPart, activitySetWorking]);

  const handleTextDelta = useCallback((data: { threadId: string; text: string; seq: number }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    if (data.seq !== undefined && data.seq <= lastTextSeqRef.current) return;
    if (data.seq !== undefined) lastTextSeqRef.current = data.seq;
    appendPart({ type: "text", text: data.text });
  }, [appendPart]);

  const handleWorkerStart = useCallback((data: { threadId: string; workerId: string; workerType: string; description?: string; scenarioId?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    const title = formatWorkerTitle(data.workerType, data.description, data.scenarioId);
    activitySetWorking({ title, detail: undefined });
    appendPart({ type: "worker-start", workerId: data.workerId, workerType: data.workerType, description: data.description, scenarioId: data.scenarioId });

    // Office Worker: open preview sidebar immediately for live preview as file materializes
    if (data.workerType === "office") {
      const previewStore = usePreviewStore.getState();
      previewStore.openFor({
        id: `office-live-${data.threadId}`,
        title: "Office 文档",
        type: "ppt",
        content: "",
        src: "",
        sourceMessageId: data.threadId,
      });
    }
  }, [appendPart, activitySetWorking]);

  const handleWorkerComplete = useCallback((data: { threadId: string; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    const title = formatWorkerTitle(data.workerType);
    activitySetLastCompleted(`${data.success ? "✓" : "✗"} ${title}`);
    appendPart({ type: "worker-complete", workerId: data.workerId, workerType: data.workerType, success: data.success, error: data.error, duration: data.duration });
  }, [appendPart, activitySetLastCompleted]);

  const handleToolCall = useCallback((data: { threadId: string; toolCallId: string; toolName: string; args: unknown; workerId?: string; workerType?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    activitySetWorking({ detail: formatToolLabel(data.toolName, data.args) });
    appendPart({
      type: "tool-call",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      workerId: data.workerId,
      startedAt: Date.now(),
    });
  }, [appendPart, activitySetWorking]);

  const handleToolResult = useCallback((data: { threadId: string; toolCallId: string; toolName: string; result: unknown; isError?: boolean; workerId?: string; workerType?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    activitySetLastCompleted(formatToolLabel(data.toolName, undefined));
    updateToolResult(data.toolCallId, data.result, data.isError);
  }, [updateToolResult, activitySetLastCompleted]);

  const handleComplete = useCallback((data: { threadId?: string; cancelled?: boolean; success?: boolean; error?: string }) => {
    const tid = activeThreadIdRef.current ?? assistantThreadIdRef.current;
    if (data.threadId && tid && data.threadId !== tid) return;
    setIsRunning(false);
    activeThreadIdRef.current = null;
    activitySetIdle();
    if (data.cancelled) {
      appendPart({ type: "text", text: "\n\n*Execution cancelled*" });
    } else if (data.success === false && data.error) {
      setError(data.error);
      appendPart({ type: "text", text: `处理失败：${data.error}` });
    }
    // Ensure the assistant message is never left empty after completion
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content.length === 0) {
        const fallbackText = data.success === false && data.error
          ? `处理失败：${data.error}`
          : (data as { text?: string }).text ?? "任务完成，未产生可见输出。";
        return [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            content: [{ type: "text", text: fallbackText }],
          },
        ];
      }
      return prev;
    });
    // Persist after stream settles (late file events may still arrive)
    if (tid && !data.cancelled) {
      window.setTimeout(() => {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === "assistant") {
            persistAssistantContent(lastMsg.content);
          }
          return prev;
        });
      }, 400);
    }
  }, [appendPart, activitySetIdle, persistAssistantContent]);

  const handleFile = useCallback((data: { threadId: string; name: string; path: string; servedPath?: string; size: number; mimeType: string; type: string; src?: string }) => {
    const threadId = activeThreadIdRef.current ?? assistantThreadIdRef.current;
    if (!threadId || data.threadId !== threadId) return;
    upsertFilePart({
      type: "file-attachment",
      name: data.name,
      size: data.size,
      mimeType: data.mimeType,
      path: data.path,
      servedPath: data.servedPath,
      src: data.src,
    });

    const previewType = isPreviewableFile(data.name);
    if (!previewType) return;

    const previewStore = usePreviewStore.getState();
    const liveId = `office-live-${data.threadId}`;
    const fileId = `file-${data.threadId}-${data.name}`;
    const previewSrc = data.src?.startsWith("/files/") ? data.src : (data.path || data.src || "");
    if (!previewSrc) return;

    const previewPayload = {
      title: data.name,
      type: previewType as "ppt" | "doc" | "pdf" | "xlsx" | "html" | "svg",
      content: "",
      src: previewSrc,
      filePath: data.path,
      servedPath: data.servedPath,
      sourceMessageId: data.threadId,
    };

    if (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx") {
      // Update live Office preview tab if worker already opened it
      if (previewStore.previews.some((p) => p.id === liveId)) {
        previewStore.openFor({ id: liveId, ...previewPayload });
      } else {
        previewStore.openFor({ id: fileId, ...previewPayload });
      }
    } else if (data.src) {
      fetch(`http://127.0.0.1:4450${data.src}`)
        .then((r) => r.text())
        .then((content) => {
          previewStore.openFor({
            id: fileId,
            title: data.name,
            type: previewType as "html" | "svg",
            content,
            sourceMessageId: data.threadId,
          });
        })
        .catch(() => {});
    }
  }, [upsertFilePart]);

  // Ask-user handler
  const handleAskUser = useCallback((data: { askId: string; threadId: string; question: string; options: Array<{ label: string; description?: string }> }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    activitySetWaiting(`等待确认 · ${truncateActivityLabel(data.question)}`);
    setAskUserData({ askId: data.askId, question: data.question, options: data.options });
  }, [activitySetWaiting]);

  // Listen to WS events
  useEffect(() => {
    const unsubs = [
      onEvent("agent.reasoning", handleReasoning),
      onEvent("agent.text-delta", handleTextDelta),
      onEvent("agent.worker-start", handleWorkerStart),
      onEvent("agent.worker-complete", handleWorkerComplete),
      onEvent("agent.tool-call", handleToolCall),
      onEvent("agent.tool-result", handleToolResult),
      onEvent("agent.complete", handleComplete),
      onEvent("agent.file", handleFile),
      onEvent("agent.ask-user", handleAskUser),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [onEvent, handleReasoning, handleTextDelta, handleWorkerStart, handleWorkerComplete, handleToolCall, handleToolResult, handleComplete, handleFile, handleAskUser]);

  const handleCancel = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await request("chat.cancel", { threadId });
    } catch {
      // Ignore cancel errors — agent.complete event will reset state
    }
  }, [request]);

  // Submit ask-user answer back to server
  const handleAskUserSubmit = useCallback(async (answer: string) => {
    if (!askUserData) return;
    try {
      await request("chat.answerAskUser", { askId: askUserData.askId, answer });
    } catch {
      // Ignore — server may have timed out
    }
    setAskUserData(null);
    if (isRunning) activityClearWaiting();
  }, [askUserData, request, isRunning, activityClearWaiting]);

  const handleAskUserDismiss = useCallback(() => {
    if (!askUserData) return;
    request("chat.answerAskUser", { askId: askUserData.askId, answer: "(已忽略)" }).catch(() => {});
    setAskUserData(null);
    if (isRunning) activityClearWaiting();
  }, [askUserData, request, isRunning, activityClearWaiting]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || isRunning) return;

    setError(null);

    try {
      await getChatWsClient().waitForConnected();

      // Use current session as threadId, or create one
      let sessionId = currentId;
      if (!sessionId) {
        sessionId = await createSession();
      }
      const threadId = sessionId;
      activeThreadIdRef.current = threadId;
      lastTextSeqRef.current = 0;
      lastReasoningSeqRef.current = 0;

      // Build user message content
      const userContent: ContentPart[] = [];
      for (const f of pendingFiles) {
        userContent.push({ type: "file-attachment", name: f.name, size: f.size, mimeType: f.mimeType, path: f.path, src: f.src });
      }
      if (text) {
        userContent.push({ type: "text", text });
      }

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();
      const now = Date.now();

      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        content: userContent,
        createdAt: now,
      };

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: [],
        createdAt: now,
      };

      assistantMsgIdRef.current = assistantMsgId;
      assistantThreadIdRef.current = threadId;

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      clearFiles();
      setIsRunning(true);
      activityBeginRun();

      // Persist user + empty assistant placeholder (updated as stream progresses)
      db.insertMessage(userMsgId, threadId, "user", JSON.stringify(userContent), now).catch(() => {});
      db.insertMessage(assistantMsgId, threadId, "assistant", "[]", now).catch(() => {});

      // Auto-title from first user message
      if (threadId) {
        const titleSrc = text || pendingFiles.map(f => f.name).slice(0, 3).join(', ');
        if (titleSrc) autoTitle(threadId, titleSrc);
      }

      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      const attachments = pendingFiles.map(f => ({ type: f.type, path: f.path, name: f.name, size: f.size, mimeType: f.mimeType }));
      await request("chat.send", { prompt: text || undefined, threadId, attachments: attachments.length > 0 ? attachments : undefined });
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : `Failed to send: ${JSON.stringify(err)}`;
      failPendingRun(errorMessage);
    }
  }, [input, pendingFiles, isRunning, request, clearFiles, currentId, createSession, autoTitle, failPendingRun, activityBeginRun]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const handleFileSelect = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        title: "Select files",
      });
      if (selected && selected.length > 0) {
        addFiles(selected as unknown as File[]);
      }
    } catch {
      // dialog not available in web preview
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-stage chat-shell">
      <div ref={scrollRef} className="chat-stage__scroll scrollbar-thin">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="chat-rail py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={msg === messages[messages.length - 1]}
                isRunning={isRunning && msg === messages[messages.length - 1]}
                onOpenImage={setLightboxSrc}
              />
            ))}
            {isRunning &&
              messages[messages.length - 1]?.role === "assistant" &&
              messages[messages.length - 1].content.length === 0 &&
              !messages[messages.length - 1].content.some(
                (p) => p.type === "worker-start" || p.type === "tool-call" || p.type === "reasoning"
              ) && <ColdStartPulse />}
          </div>
        )}
      </div>

      <div className="chat-stage__footer">
        {error && (
          <div className="chat-rail pt-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300 app-no-drag">&times;</button>
            </div>
          </div>
        )}

        {chatState !== "connected" && (
          <div className="chat-rail pb-2 pt-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
              <span>
                {chatState === "failed"
                  ? "Chat service disconnected. Reconnecting…"
                  : "Connecting to chat service…"}
              </span>
            </div>
          </div>
        )}

        {askUserData ? (
          <div className="chat-rail py-4">
            <ActivityDock />
            <AskUserCard
              question={askUserData.question}
              options={askUserData.options}
              onAnswer={handleAskUserSubmit}
              onDismiss={handleAskUserDismiss}
            />
          </div>
        ) : (
          <div className="chat-rail py-4">
            <ActivityDock />
            {pendingFiles.length > 0 && (
              <div className="mb-2">
                <FilePreviewList files={pendingFiles} onRemove={removeFile} />
              </div>
            )}
            <div
              className="relative flex items-end gap-2 bg-stone-900 border border-stone-800 rounded-2xl px-3 py-2.5 focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all duration-200"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <button
                onClick={handleFileSelect}
                className="app-no-drag shrink-0 self-center p-1 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
                title="Attach files"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask Hive anything..."
                rows={1}
                className="flex-1 bg-transparent text-stone-100 placeholder-stone-500 text-base resize-none outline-none leading-relaxed max-h-[200px] py-0.5"
                disabled={isRunning || uploading || chatState !== "connected"}
              />
              <button
                onClick={isRunning ? handleCancel : handleSend}
                disabled={(!isRunning && (!input.trim() && pendingFiles.length === 0)) || uploading || (!isRunning && chatState !== "connected")}
                className={`app-no-drag shrink-0 p-2 rounded-xl transition-all duration-200 ${
                  isRunning
                    ? "bg-amber-500/20 text-amber-400"
                    : input.trim()
                      ? "bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20"
                      : "bg-stone-800 text-stone-600"
                }`}
              >
                {isRunning ? (
                  <Square className="w-4 h-4" fill="currentColor" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-center text-[11px] text-stone-700 mt-2">
              Hive may produce inaccurate information. Press Shift+Enter for new line.
            </p>
          </div>
        )}
      </div>

      <PreviewSidebar isRunning={isRunning} />

      {lightboxSrc && <ImagePreview src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 select-none">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.svg" alt="Hive" className="w-10 h-10 opacity-40" />
        <p className="text-sm text-stone-600">Send a message to get started</p>
      </div>
    </div>
  );
}
