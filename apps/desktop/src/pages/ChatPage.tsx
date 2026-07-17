import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
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
import { ArtifactsStrip } from "../components/chat/ArtifactsStrip";
import { ColdStartPulse } from "../components/chat/ColdStartPulse";
import { formatToolLabel } from "../components/chat/activity-labels";
import { formatWorkerTitle, formatScenarioLabel } from "../components/chat/worker-labels";
import { useActivityStore } from "../stores/activity-store";
import * as db from "../lib/db";
import { finalizeRunContent, hasOpenRunParts } from "../lib/finalize-run-content";
import { patchAssistantMessage, appendContentPart } from "../lib/chat-message-ops";
import { schedulePersistAssistant, flushPersistAssistant, persistAssistantNow } from "../lib/persist-assistant";
import { cancelSessionRun } from "../lib/cancel-session-run";
import { useRunStore, RUN_SETTLE_MS } from "../stores/run-store";
import type { ChatMessage, ContentPart } from "../types/chat";
import { AskUserCard } from "../components/AskUserCard";
import { BgToastHost } from "../components/chat/BgToastHost";
import { ArrowUp, Plus, Square } from "lucide-react";

function truncateActivityLabel(text: string, max = 48): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Match .chat-composer__input line-height (1.25rem @ 16px root) */
const COMPOSER_INPUT_LINE_PX = 20;

/** ThinkingCard collapse animation (~450ms) + markdown/table layout settle */
const SCROLL_SETTLE_MS = [0, 80, 200, 480, 900];

function syncComposerInputHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.max(COMPOSER_INPUT_LINE_PX, Math.min(el.scrollHeight, 200))}px`;
  const multiline = el.scrollHeight > COMPOSER_INPUT_LINE_PX + 2;
  el.closest(".chat-composer")?.classList.toggle("chat-composer--multiline", multiline);
}

// ============================================
// Chat Page
// ============================================

export function ChatPage() {
  const { t } = useTranslation();
  const { state: chatState, request, onEvent } = useChatWsClient();
  const { pendingFiles, uploading, addFiles, removeFile, clearFiles } = useFileUpload();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Ask-user interaction state
  const [askUserData, setAskUserData] = useState<{
    askId: string;
    question: string;
    options: Array<{ label: string; description?: string }>;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const messagesRailRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const wasRunningRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Currently viewed session's in-flight thread (null when viewing a settled session). */
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
  /** Derived from run-store so sidebar stop / background complete stay in sync. */
  const isRunning = useRunStore((s) => {
    if (!currentId) return false;
    const run = s.runs[currentId];
    return !!run && (run.phase === "running" || run.phase === "waiting");
  });
  const currentIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  currentIdRef.current = currentId;

  const isViewingThread = useCallback((threadId: string) => currentIdRef.current === threadId, []);

  /**
   * Ensure a live run exists for inbound WS events.
   * Revives from messageCache after HMR / accidental store loss so background
   * sessions keep receiving stream updates after a lens switch.
   */
  const ensureLiveRun = useCallback((threadId: string): boolean => {
    const store = useRunStore.getState();
    if (store.getRun(threadId)) return true;
    // Do not revive a session that just completed/cancelled
    if (store.getRunOrSettling(threadId)?.phase === "settling") return false;

    const cached = store.getMessageCache(threadId);
    const assistant = cached
      ? [...cached].reverse().find((m) => m.role === "assistant")
      : undefined;
    if (!assistant) return false;

    store.beginRun({
      sessionId: threadId,
      assistantMsgId: assistant.id,
      title: truncateActivityLabel(
        cached?.find((m) => m.role === "user")?.content
          ?.filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
          .map((p) => p.text)
          .join(" ") || i18n.t("activity.processing"),
      ),
    });
    return !!useRunStore.getState().getRun(threadId);
  }, []);

  /** Apply message updates to the viewed session or a background cache. */
  const mutateThreadMessages = useCallback(
    (threadId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const store = useRunStore.getState();
      const run = store.getRun(threadId) ?? store.getRunOrSettling(threadId);
      const assistantMsgId = run?.assistantMsgId;

      const applyUpdate = (prev: ChatMessage[]) => {
        const next = updater(prev);
        if (assistantMsgId) {
          const prevAssistant = prev.find((m) => m.id === assistantMsgId);
          const nextAssistant = next.find((m) => m.id === assistantMsgId);
          if (nextAssistant && (!prevAssistant || nextAssistant.content !== prevAssistant.content)) {
            schedulePersistAssistant(nextAssistant.id, nextAssistant.content);
          }
        }
        return next;
      };

      if (isViewingThread(threadId)) {
        // Compute outside setState so Zustand cache writes never run during React render
        // (calling setMessageCache inside setMessages updater re-renders ChatPage mid-render).
        const next = applyUpdate(messagesRef.current);
        store.setMessageCache(threadId, next);
        setMessages(next);
        return;
      }
      // Seed cache if missing so background WS updates are not silently dropped
      if (!store.getMessageCache(threadId) && assistantMsgId) {
        store.setMessageCache(threadId, [
          {
            id: assistantMsgId,
            role: "assistant",
            content: [],
            createdAt: Date.now(),
          },
        ]);
      }
      store.updateMessageCache(threadId, applyUpdate);
    },
    [isViewingThread],
  );

  // Init store on mount
  useEffect(() => {
    initStore();
  }, [initStore]);

  // When session changes: cache the outgoing transcript, keep background runs alive
  useEffect(() => {
    if (!currentId) return;

    const store = useRunStore.getState();
    const prevId = prevSessionIdRef.current;
    if (prevId && prevId !== currentId) {
      store.setMessageCache(prevId, messagesRef.current);
      const prevRun = store.getRun(prevId) ?? store.getRunOrSettling(prevId);
      if (prevRun) {
        flushPersistAssistant(prevRun.assistantMsgId);
      }
    }
    prevSessionIdRef.current = currentId;
    store.setViewingSessionId(currentId);

    setError(null);
    usePreviewStore.getState().clear();

    if (store.hasLiveRun(currentId)) {
      activeThreadIdRef.current = currentId;
      const run = store.getRun(currentId);
      activitySetWorking({ title: run?.title ?? i18n.t("activity.processing") });
      const pendingAsk = store.getPendingAsk(currentId);
      setAskUserData(pendingAsk ?? null);
      if (pendingAsk) {
        activitySetWaiting(truncateActivityLabel(pendingAsk.question));
      }
    } else {
      activeThreadIdRef.current = null;
      setAskUserData(null);
      useActivityStore.getState().reset();
    }

    const cached = store.getMessageCache(currentId);
    if (cached) {
      setMessages(cached);
      return;
    }

    const load = async () => {
      try {
        const rows = await db.listMessages(currentId);
        let msgs: ChatMessage[] = rows.map((r) => ({
          id: r.id,
          role: r.role as "user" | "assistant",
          content: JSON.parse(r.content) as ContentPart[],
          createdAt: r.created_at,
        }));

        // Heal stale spinners only when nothing is in-flight app-wide.
        // If another lens still has a live run, skip — this session may be that run
        // after a store blip, and persisting "已中断" would falsely kill the transcript.
        const runStore = useRunStore.getState();
        if (!runStore.hasLiveRun(currentId) && !runStore.getInFlightSessionId()) {
          let healed = false;
          msgs = msgs.map((m) => {
            if (m.role !== "assistant" || !hasOpenRunParts(m.content)) return m;
            healed = true;
            const delivered = m.content.some((p) => p.type === "file-attachment");
            return {
              ...m,
              content: finalizeRunContent(m.content, {
                success: delivered,
                error: delivered ? undefined : "已中断",
              }),
            };
          });
          if (healed) {
            const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
            if (lastAssistant) {
              persistAssistantNow(lastAssistant.id, lastAssistant.content);
            }
          }
        }

        if (currentIdRef.current === currentId) {
          setMessages(msgs);
          useRunStore.getState().setMessageCache(currentId, msgs);
        }
      } catch {
        // DB not available — stay with empty messages
      }
    };
    load();
  }, [currentId, activitySetWorking, activitySetWaiting]);

  // Create first session if none exists
  useEffect(() => {
    if (!storeLoading && sessions.length === 0) {
      createSession();
    }
  }, [storeLoading, sessions.length, createSession]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const anchor = scrollAnchorRef.current;
    const scroller = scrollRef.current;
    const apply = () => {
      if (anchor) {
        anchor.scrollIntoView({ block: "end", behavior });
      } else if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 96;
  }, []);

  // Same-session live→idle (sidebar stop / cancel): sync messages from cache
  const wasLiveForSessionRef = useRef<{ id: string | null; live: boolean }>({
    id: null,
    live: false,
  });
  useEffect(() => {
    const prev = wasLiveForSessionRef.current;
    if (currentId && prev.id === currentId && prev.live && !isRunning) {
      const cached = useRunStore.getState().getMessageCache(currentId);
      if (cached) setMessages(cached);
      setAskUserData(null);
      activeThreadIdRef.current = null;
      activitySetIdle();
    }
    wasLiveForSessionRef.current = { id: currentId, live: isRunning };
  }, [currentId, isRunning, activitySetIdle]);

  // Stick to bottom while streaming when user hasn't scrolled up
  useEffect(() => {
    if (!stickToBottomRef.current && !isRunning) return;
    scrollToBottom();
  }, [messages, isRunning, scrollToBottom]);

  // Response finished: layout still shifts (collapse, tables, dock) without new messages
  useEffect(() => {
    const completed = wasRunningRef.current && !isRunning;
    if (completed) {
      stickToBottomRef.current = true;
      const ids = SCROLL_SETTLE_MS.map((ms) => window.setTimeout(() => scrollToBottom(), ms));
      wasRunningRef.current = isRunning;
      return () => ids.forEach((id) => window.clearTimeout(id));
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, scrollToBottom]);

  // ResizeObserver — catch streamdown/table height changes after complete
  useEffect(() => {
    const rail = messagesRailRef.current;
    if (!rail) return;

    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current || isRunning) {
        scrollToBottom();
      }
    });
    ro.observe(rail);
    return () => ro.disconnect();
  }, [isRunning, scrollToBottom, messages.length]);

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

  const upsertFilePart = useCallback((threadId: string, part: Extract<ContentPart, { type: "file-attachment" }>) => {
    const store = useRunStore.getState();
    const run = store.getRunOrSettling(threadId);
    mutateThreadMessages(threadId, (prev) =>
      patchAssistantMessage(prev, run?.assistantMsgId, (content) => {
        const updated = content.slice();
        const idx = updated.findIndex(
          (p) =>
            p.type === "file-attachment" &&
            (p.path === part.path || p.name === part.name),
        );
        if (idx >= 0) updated[idx] = part;
        else updated.push(part);
        persistAssistantNow(run?.assistantMsgId, updated);
        return updated;
      }),
    );
  }, [mutateThreadMessages]);

  const appendPart = useCallback((threadId: string, part: ContentPart) => {
    const run = useRunStore.getState().getRun(threadId);
    mutateThreadMessages(threadId, (prev) =>
      patchAssistantMessage(prev, run?.assistantMsgId, (content) => appendContentPart(content, part)),
    );
  }, [mutateThreadMessages]);

  const updateToolResult = useCallback((threadId: string, toolCallId: string, result: unknown, isError?: boolean) => {
    const now = Date.now();
    const run = useRunStore.getState().getRun(threadId);
    mutateThreadMessages(threadId, (prev) =>
      patchAssistantMessage(prev, run?.assistantMsgId, (content) =>
        content.map((part) => {
          if (part.type !== "tool-call" || part.toolCallId !== toolCallId) return part;
          const durationMs = part.startedAt != null ? now - part.startedAt : undefined;
          return { ...part, result, isError, durationMs };
        }),
      ),
    );
  }, [mutateThreadMessages]);

  const failPendingRun = useCallback((threadId: string, message: string) => {
    const store = useRunStore.getState();
    store.clearRun(threadId);
    store.setPendingAsk(threadId, null);

    const patchEmptyAssistant = (prev: ChatMessage[]): ChatMessage[] => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant" || last.content.length > 0) return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: [{ type: "text", text: t("chat.processFailed", { detail: message }) }] },
      ];
    };

    if (isViewingThread(threadId)) {
      setError(message);
      activeThreadIdRef.current = null;
      activitySetIdle();
      const next = patchEmptyAssistant(messagesRef.current);
      store.setMessageCache(threadId, next);
      setMessages(next);
    } else {
      store.updateMessageCache(threadId, patchEmptyAssistant);
    }
  }, [activitySetIdle, isViewingThread, t]);

  // Stable WS event handlers — useCallback ensures dedup in WsClient Set
  // across React.StrictMode double-mount cycles.
  // Events are accepted for any registered run (including background sessions).
  const handleAgentStart = useCallback((data: { threadId: string }) => {
    ensureLiveRun(data.threadId);
  }, [ensureLiveRun]);

  const handleReasoning = useCallback((data: { threadId: string; text: string; seq: number; workerId?: string; workerType?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (data.seq <= lastReasoningSeqRef.current) return;
    lastReasoningSeqRef.current = data.seq;
    if (isViewingThread(data.threadId)) {
      activitySetWorking({ detail: i18n.t("activity.thinking") });
    }
    appendPart(data.threadId, { type: "reasoning", text: data.text, workerId: data.workerId, workerType: data.workerType });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleTextDelta = useCallback((data: { threadId: string; text: string; seq: number }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (data.seq !== undefined && data.seq <= lastTextSeqRef.current) return;
    if (data.seq !== undefined) lastTextSeqRef.current = data.seq;
    appendPart(data.threadId, { type: "text", text: data.text });
  }, [appendPart, ensureLiveRun]);

  const handleRoute = useCallback((data: {
    threadId: string;
    mode: "direct" | "inquiry" | "delegate" | "hint";
    scenarioId?: string;
    workerType?: string;
    workerTypes?: string[];
    title?: string;
  }) => {
    if (!ensureLiveRun(data.threadId)) return;

    const dockTitle =
      data.mode === "inquiry"
        ? i18n.t("activity.route.dockInquiry")
        : data.mode === "delegate"
          ? i18n.t("activity.route.dockDelegate")
          : data.mode === "hint"
            ? i18n.t("activity.route.dockHint")
            : i18n.t("activity.route.dockDirect");

    const types = data.workerTypes?.length
      ? data.workerTypes
      : data.workerType
        ? [data.workerType]
        : [];
    const detail =
      data.title?.trim() ||
      (types.length > 1
        ? types.map((wt) => formatWorkerTitle(wt, undefined, data.scenarioId)).join(" ∥ ")
        : types.length === 1
          ? formatWorkerTitle(types[0]!, undefined, data.scenarioId)
          : formatScenarioLabel(data.scenarioId));

    if (isViewingThread(data.threadId)) {
      activitySetWorking({ title: dockTitle, detail: detail || undefined });
    }
    appendPart(data.threadId, {
      type: "route",
      mode: data.mode,
      scenarioId: data.scenarioId,
      workerType: data.workerType,
      workerTypes: data.workerTypes,
      title: data.title,
    });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleWorkerStart = useCallback((data: { threadId: string; workerId: string; workerType: string; description?: string; scenarioId?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const title = formatWorkerTitle(data.workerType, data.description, data.scenarioId);
    if (isViewingThread(data.threadId)) {
      activitySetWorking({ title, detail: undefined });
    }
    appendPart(data.threadId, { type: "worker-start", workerId: data.workerId, workerType: data.workerType, description: data.description, scenarioId: data.scenarioId });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleWorkerComplete = useCallback((data: { threadId: string; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const title = formatWorkerTitle(data.workerType);
    if (isViewingThread(data.threadId)) {
      activitySetLastCompleted(`${data.success ? "✓" : "✗"} ${title}`);
    }
    appendPart(data.threadId, { type: "worker-complete", workerId: data.workerId, workerType: data.workerType, success: data.success, error: data.error, duration: data.duration });
  }, [appendPart, activitySetLastCompleted, isViewingThread, ensureLiveRun]);

  const handleOfficeProgress = useCallback((data: {
    threadId: string;
    phase: "routed" | "creating" | "adding_slide" | "validating" | "delivering" | "blocked";
    slide?: number;
    slideTotal?: number;
    message?: string;
    workerId?: string;
  }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const detail =
      data.phase === "blocked" && data.message
        ? data.message
        : data.phase === "adding_slide" && data.slide != null
          ? (data.slideTotal != null ? `第 ${data.slide}/${data.slideTotal} 页` : `第 ${data.slide} 页`)
          : undefined;
    if (isViewingThread(data.threadId)) {
      activitySetWorking({
        title:
          data.phase === "routed"
            ? "已交给 Office"
            : data.phase === "creating"
              ? "正在建稿"
              : data.phase === "validating"
                ? "检查版式"
                : data.phase === "delivering"
                  ? "正在交付"
                  : data.phase === "blocked"
                    ? "需要修正"
                    : "Office 进行中",
        detail,
      });
    }
    appendPart(data.threadId, {
      type: "office-progress",
      phase: data.phase,
      slide: data.slide,
      slideTotal: data.slideTotal,
      message: data.message,
      workerId: data.workerId,
    });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleToolCall = useCallback((data: { threadId: string; toolCallId: string; toolName: string; args: unknown; workerId?: string; workerType?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (isViewingThread(data.threadId)) {
      activitySetWorking({ detail: formatToolLabel(data.toolName, data.args) });
    }
    appendPart(data.threadId, {
      type: "tool-call",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      args: data.args,
      workerId: data.workerId,
      startedAt: Date.now(),
    });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleToolResult = useCallback((data: { threadId: string; toolCallId: string; toolName: string; result: unknown; isError?: boolean; workerId?: string; workerType?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (isViewingThread(data.threadId)) {
      activitySetLastCompleted(formatToolLabel(data.toolName, undefined));
    }
    updateToolResult(data.threadId, data.toolCallId, data.result, data.isError);
  }, [updateToolResult, activitySetLastCompleted, isViewingThread, ensureLiveRun]);

  const handleComplete = useCallback((data: { threadId?: string; cancelled?: boolean; success?: boolean; error?: string }) => {
    const store = useRunStore.getState();
    const tid = data.threadId ?? activeThreadIdRef.current ?? undefined;
    if (!tid || !store.getRun(tid)) return;

    const run = store.getRun(tid)!;
    store.beginSettling(tid);
    store.setPendingAsk(tid, null);

    const viewing = isViewingThread(tid);
    const isError = data.success === false && !!data.error;

    mutateThreadMessages(tid, (prev) =>
      patchAssistantMessage(prev, run.assistantMsgId, (content) => {
        let c = content;
        if (data.cancelled) {
          c = appendContentPart(c, { type: "text", text: t("chat.executionCancelled") });
        } else if (isError) {
          c = appendContentPart(c, { type: "text", text: t("chat.processFailed", { detail: data.error }) });
        }
        c = finalizeRunContent(c, {
          cancelled: data.cancelled,
          success: data.success,
          error: data.error,
        });
        if (c.length === 0) {
          const fallbackText = isError
            ? t("chat.processFailed", { detail: data.error })
            : (data as { text?: string }).text ?? t("chat.taskNoOutput");
          c = [{ type: "text", text: fallbackText }];
        }
        return c;
      }),
    );

    if (!viewing && !isError && !data.cancelled) {
      store.pushToast({
        sessionId: tid,
        kind: "complete",
        title: run.title,
      });
    }

    if (viewing) {
      setAskUserData(null);
      activeThreadIdRef.current = null;
      activitySetIdle();
      if (isError) setError(data.error!);
    }

    flushPersistAssistant(run.assistantMsgId);

    window.setTimeout(() => {
      store.clearRun(tid);
    }, RUN_SETTLE_MS + 50);
  }, [activitySetIdle, isViewingThread, mutateThreadMessages, t]);

  const handleFile = useCallback((data: { threadId: string; name: string; path: string; servedPath?: string; size: number; mimeType: string; type: string; src?: string }) => {
    const run = useRunStore.getState().getRunOrSettling(data.threadId);
    if (!run) return;
    upsertFilePart(data.threadId, {
      type: "file-attachment",
      name: data.name,
      size: data.size,
      mimeType: data.mimeType,
      path: data.path,
      servedPath: data.servedPath,
      src: data.src,
    });

    if (!isViewingThread(data.threadId)) return;

    const previewType = isPreviewableFile(data.name);
    if (!previewType) return;

    const previewStore = usePreviewStore.getState();
    // Codex-style: never auto-open; only live-refresh when sidebar already open on this file
    if (!previewStore.isOpen || !previewStore.activeId) return;

    const fileId = `file-${data.path || data.name}`;
    const activeId = previewStore.activeId;
    const active = previewStore.previews.find((p) => p.id === activeId);
    const sameTurn =
      activeId === fileId ||
      active?.sourceMessageId === data.threadId ||
      (typeof activeId === "string" && (activeId.endsWith(data.name) || activeId.includes(data.path)));
    if (!sameTurn) return;

    const previewSrc = data.src?.startsWith("/files/") ? data.src : (data.path || data.src || "");
    if (!previewSrc && previewType !== "html" && previewType !== "svg") return;

    if (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx") {
      previewStore.upsertPreview({
        id: activeId,
        title: data.name,
        type: previewType,
        content: "",
        src: previewSrc,
        filePath: data.path,
        servedPath: data.servedPath,
        sourceMessageId: data.threadId,
      });
    } else if (data.src) {
      fetch(`http://127.0.0.1:4450${data.src}`)
        .then((r) => r.text())
        .then((content) => {
          const latest = usePreviewStore.getState();
          if (!latest.isOpen || latest.activeId !== activeId) return;
          latest.upsertPreview({
            id: activeId,
            title: data.name,
            type: previewType as "html" | "svg",
            content,
            sourceMessageId: data.threadId,
          });
        })
        .catch(() => {});
    }
  }, [upsertFilePart, isViewingThread]);

  // Ask-user handler — keep question in the transcript; restore card when switching back
  const handleAskUser = useCallback((data: { askId: string; threadId: string; question: string; options: Array<{ label: string; description?: string }> }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const store = useRunStore.getState();
    const pending = { askId: data.askId, question: data.question, options: data.options };
    store.setPendingAsk(data.threadId, pending);
    store.setPhase(data.threadId, "waiting");
    appendPart(data.threadId, { type: "text", text: data.question });
    if (!isViewingThread(data.threadId)) {
      const run = store.getRun(data.threadId);
      store.pushToast({
        sessionId: data.threadId,
        kind: "waiting",
        title: run?.title ?? truncateActivityLabel(data.question),
      });
      return;
    }
    activitySetWaiting(truncateActivityLabel(data.question));
    setAskUserData(pending);
  }, [activitySetWaiting, appendPart, isViewingThread, ensureLiveRun]);

  const handleAskUserTimeout = useCallback((data: { askId: string; threadId: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const store = useRunStore.getState();
    store.setPendingAsk(data.threadId, null);
    store.clearToastsForSession(data.threadId);
    if (store.getRun(data.threadId)?.phase === "waiting") {
      store.setPhase(data.threadId, "running");
    }
    if (!isViewingThread(data.threadId)) return;
    setAskUserData((prev) => (prev?.askId === data.askId ? null : prev));
    if (isRunning) activityClearWaiting();
  }, [isRunning, activityClearWaiting, isViewingThread, ensureLiveRun]);

  // Listen to WS events
  useEffect(() => {
    const unsubs = [
      onEvent("agent.start", handleAgentStart),
      onEvent("agent.reasoning", handleReasoning),
      onEvent("agent.text-delta", handleTextDelta),
      onEvent("agent.route", handleRoute),
      onEvent("agent.worker-start", handleWorkerStart),
      onEvent("agent.worker-complete", handleWorkerComplete),
      onEvent("agent.office-progress", handleOfficeProgress),
      onEvent("agent.tool-call", handleToolCall),
      onEvent("agent.tool-result", handleToolResult),
      onEvent("agent.complete", handleComplete),
      onEvent("agent.file", handleFile),
      onEvent("agent.ask-user", handleAskUser),
      onEvent("agent.ask-user-timeout", handleAskUserTimeout),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [onEvent, handleAgentStart, handleReasoning, handleTextDelta, handleRoute, handleWorkerStart, handleWorkerComplete, handleOfficeProgress, handleToolCall, handleToolResult, handleComplete, handleFile, handleAskUser, handleAskUserTimeout]);

  const handleCancel = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    await cancelSessionRun(threadId);
    if (isViewingThread(threadId)) {
      setAskUserData(null);
      activeThreadIdRef.current = null;
      activitySetIdle();
      const cached = useRunStore.getState().getMessageCache(threadId);
      if (cached) setMessages(cached);
    }
  }, [activitySetIdle, isViewingThread]);

  // Submit ask-user answer — leave it in the transcript as a user turn
  const handleAskUserSubmit = useCallback(async (answer: string) => {
    if (!askUserData) return;
    const q = askUserData;
    try {
      await request("chat.answerAskUser", { askId: q.askId, answer });
    } catch {
      // Ignore — server may have timed out
    }
    setAskUserData(null);
    if (currentId) useRunStore.getState().setPendingAsk(currentId, null);
    if (isRunning) activityClearWaiting();

    const sessionId = currentId;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text: answer }],
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (sessionId) {
      db.insertMessage(userMsg.id, sessionId, "user", JSON.stringify(userMsg.content), userMsg.createdAt).catch(() => {});
    }
  }, [askUserData, request, isRunning, activityClearWaiting, currentId]);

  const handleAskUserDismiss = useCallback(() => {
    if (!askUserData) return;
    const skip = t("askUser.skipAnswer");
    request("chat.answerAskUser", { askId: askUserData.askId, answer: skip }).catch(() => {});
    setAskUserData(null);
    if (currentId) useRunStore.getState().setPendingAsk(currentId, null);
    if (isRunning) activityClearWaiting();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text: skip }],
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (currentId) {
      db.insertMessage(userMsg.id, currentId, "user", JSON.stringify(userMsg.content), userMsg.createdAt).catch(() => {});
    }
  }, [askUserData, request, isRunning, activityClearWaiting, t, currentId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || isRunning) return;
    stickToBottomRef.current = true;

    setError(null);
    let threadId = currentId;

    try {
      await getChatWsClient().waitForConnected();

      // Use current session as threadId, or create one
      if (!threadId) {
        threadId = await createSession();
      }
      if (!threadId) {
        throw new Error(t("chat.sendFailed", { detail: "no session" }));
      }
      const activeThreadId = threadId;

      // Agent is single-dispatch today — don't start another session while one runs.
      const inFlight = useRunStore.getState().getInFlightSessionId();
      if (inFlight && inFlight !== activeThreadId) {
        setError(t("chat.turnBusyHint"));
        return;
      }

      activeThreadIdRef.current = activeThreadId;
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

      const titleSrc = text || pendingFiles.map((f) => f.name).slice(0, 3).join(", ");
      useRunStore.getState().beginRun({
        sessionId: activeThreadId,
        assistantMsgId,
        title: titleSrc || i18n.t("activity.processing"),
      });

      const next = [...messagesRef.current, userMsg, assistantMsg];
      useRunStore.getState().setMessageCache(activeThreadId, next);
      setMessages(next);
      setInput("");
      clearFiles();
      activityBeginRun();

      // Persist user + empty assistant placeholder (updated as stream progresses)
      db.insertMessage(userMsgId, activeThreadId, "user", JSON.stringify(userContent), now).catch(() => {});
      db.insertMessage(assistantMsgId, activeThreadId, "assistant", "[]", now).catch(() => {});

      // Auto-title from first user message
      if (titleSrc) autoTitle(activeThreadId, titleSrc);

      if (inputRef.current) {
        inputRef.current.style.height = `${COMPOSER_INPUT_LINE_PX}px`;
        inputRef.current.closest(".chat-composer")?.classList.remove("chat-composer--multiline");
      }

      const attachments = pendingFiles.map(f => ({ type: f.type, path: f.path, name: f.name, size: f.size, mimeType: f.mimeType }));
      await request("chat.send", { prompt: text || undefined, threadId: activeThreadId, attachments: attachments.length > 0 ? attachments : undefined });
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : t("chat.sendFailed", { detail: JSON.stringify(err) });
      if (threadId) failPendingRun(threadId, errorMessage);
      else setError(errorMessage);
    }
  }, [input, pendingFiles, isRunning, request, clearFiles, currentId, createSession, autoTitle, failPendingRun, activityBeginRun, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    syncComposerInputHeight(e.target);
  };

  const handleFileSelect = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        title: t("chat.selectFiles"),
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
  const previewOpen = usePreviewStore((s) => s.isOpen);

  return (
    <div className={`chat-stage chat-shell${previewOpen ? " chat-stage--preview-open" : ""}`}>
      <BgToastHost />
      <div ref={scrollRef} className="chat-stage__scroll scrollbar-thin" onScroll={handleScroll}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div ref={messagesRailRef} className="chat-rail chat-rail--messages py-6 space-y-6">
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
              !messages[messages.length - 1].content.some(
                (p) =>
                  p.type === "worker-start" ||
                  p.type === "tool-call" ||
                  p.type === "reasoning" ||
                  p.type === "text" ||
                  p.type === "route",
              ) && <ColdStartPulse />}
            <div ref={scrollAnchorRef} className="chat-scroll-anchor" aria-hidden />
          </div>
        )}
      </div>

      <div className="chat-stage__footer">
        {error && (
          <div className="chat-composer-shell pt-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300 app-no-drag">&times;</button>
            </div>
          </div>
        )}

        {chatState !== "connected" && (
          <div className="chat-composer-shell pb-2 pt-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
              <span>
                {chatState === "failed"
                  ? t("chat.disconnected")
                  : t("chat.connecting")}
              </span>
            </div>
          </div>
        )}

        {askUserData ? (
          <div className="chat-composer-shell">
            <ArtifactsStrip messages={messages} isRunning={isRunning} />
            <ActivityDock />
            <AskUserCard
              question={askUserData.question}
              options={askUserData.options}
              onAnswer={handleAskUserSubmit}
              onDismiss={handleAskUserDismiss}
            />
            {isRunning && (
              <div className="ask-user__stop-row">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="ask-user__stop-btn app-no-drag"
                  title={t("chat.stop")}
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                  <span>{t("chat.stop")}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="chat-composer-shell">
            <ArtifactsStrip messages={messages} isRunning={isRunning} />
            <ActivityDock />
            {pendingFiles.length > 0 && (
              <div className="mb-2">
                <FilePreviewList files={pendingFiles} onRemove={removeFile} />
              </div>
            )}
            <div
              className="chat-composer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <button
                type="button"
                onClick={handleFileSelect}
                disabled={isRunning || uploading || chatState !== "connected"}
                className="chat-composer__attach app-no-drag"
                title={t("chat.attachFiles")}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.placeholder")}
                rows={1}
                className="chat-composer__input app-no-drag"
                disabled={isRunning || uploading || chatState !== "connected"}
              />
              <button
                type="button"
                onClick={isRunning ? handleCancel : handleSend}
                disabled={(!isRunning && (!input.trim() && pendingFiles.length === 0)) || uploading || (!isRunning && chatState !== "connected")}
                className={`chat-composer__send app-no-drag ${
                  isRunning
                    ? "chat-composer__send--running"
                    : input.trim() || pendingFiles.length > 0
                      ? "chat-composer__send--ready"
                      : "chat-composer__send--idle"
                }`}
                title={isRunning ? t("chat.stop") : t("chat.send")}
              >
                {isRunning ? (
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.25} />
                )}
              </button>
            </div>
            <p className="chat-composer__hint">
              {isRunning ? t("chat.turnBusyHint") : t("chat.disclaimer")}
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 select-none">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.svg" alt={t("app.name")} className="w-10 h-10 opacity-40" />
        <p className="text-sm text-stone-600">{t("chat.empty")}</p>
      </div>
    </div>
  );
}
