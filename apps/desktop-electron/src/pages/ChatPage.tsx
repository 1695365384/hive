import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
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
import { ArrowUp, Plus, Square, Presentation, FileText, MessageSquare, BarChart3 } from "lucide-react";

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
  const activeWorkersRef = useRef<Map<string, Map<string, string>>>(new Map());
  const activityBeginRun = useActivityStore((s) => s.beginRun);
  const activitySetWorking = useActivityStore((s) => s.setWorking);
  const activitySetWaiting = useActivityStore((s) => s.setWaiting);
  const activitySetLastCompleted = useActivityStore((s) => s.setLastCompleted);
  const activityClearWaiting = useActivityStore((s) => s.clearWaiting);
  const activitySetCompleted = useActivityStore((s) => s.setCompleted);
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

  const upsertActiveWorker = useCallback((threadId: string, workerId: string, label: string) => {
    const next = new Map(activeWorkersRef.current.get(threadId) ?? []);
    next.set(workerId, label);
    activeWorkersRef.current.set(threadId, next);
    return next;
  }, []);

  const removeActiveWorker = useCallback((threadId: string, workerId: string) => {
    const next = new Map(activeWorkersRef.current.get(threadId) ?? []);
    next.delete(workerId);
    if (next.size === 0) activeWorkersRef.current.delete(threadId);
    else activeWorkersRef.current.set(threadId, next);
    return next;
  }, []);

  const formatActiveWorkerDetail = useCallback((threadId: string) => {
    const labels = [...(activeWorkersRef.current.get(threadId)?.values() ?? [])];
    if (labels.length === 0) return undefined;
    if (labels.length === 1) return labels[0];
    const preview = labels.slice(0, 2).join(" · ");
    return labels.length > 2
      ? `并行 ${labels.length} 个 Worker · ${preview} 等`
      : `并行 ${labels.length} 个 Worker · ${preview}`;
  }, []);

  const syncWorkerActivity = useCallback((threadId: string, fallbackTitle?: string) => {
    if (!isViewingThread(threadId)) return;
    const labels = [...(activeWorkersRef.current.get(threadId)?.values() ?? [])];
    const title = labels.length > 1
      ? "并行执行"
      : labels[0] ?? fallbackTitle ?? i18n.t("activity.processing");
    activitySetWorking({ title, detail: formatActiveWorkerDetail(threadId) });
  }, [activitySetWorking, formatActiveWorkerDetail, isViewingThread]);

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

  /** After reload/reconnect, rehydrate blocked Goal banner from server. */
  /** After reload/reconnect, rehydrate blocked Goal banner from server. */
  const restoreIncompleteGoal = useCallback(async (threadId: string) => {
    try {
      const result = await request("chat.getGoal", { threadId }) as {
        goal?: {
          status: string;
          text?: string;
          reasons?: string[];
        } | null;
      };
      const goal = result?.goal;
      if (!goal) return;
      if (goal.status !== "blocked" && goal.status !== "active") return;

      const store = useRunStore.getState();
      const existing = store.getMessageCache(threadId) ?? (isViewingThread(threadId) ? messagesRef.current : []);
      const hasBlocked = existing.some((m) =>
        Array.isArray(m.content) && m.content.some((part: any) => part?.type === "task-progress" && part?.phase === "blocked")
      );
      if (hasBlocked) return;

      const reasons = goal.reasons?.length ? goal.reasons : ["任务未完成，可继续"];
      const blockedPart = {
        type: "task-progress" as const,
        phase: "blocked" as const,
        message: "任务未完成，可继续",
        reasons,
        actions: [
          { id: "continue" as const, label: "继续完成" },
          { id: "provide-info" as const, label: "补充信息" },
          { id: "cancel" as const, label: "取消" },
        ],
      };

      const lastAssistant = [...existing].reverse().find((m) => m.role === "assistant");
      if (lastAssistant && Array.isArray(lastAssistant.content)) {
        appendPart(threadId, blockedPart);
      } else {
        const assistantMsg = {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: [blockedPart],
          createdAt: Date.now(),
        };
        const next = [...existing, assistantMsg];
        store.setMessageCache(threadId, next);
        if (isViewingThread(threadId)) setMessages(next);
        db.insertMessage(assistantMsg.id, threadId, "assistant", JSON.stringify(assistantMsg.content), assistantMsg.createdAt).catch(() => {});
      }

      if (isViewingThread(threadId)) {
        activitySetWorking({
          title: "需要处理",
          detail: reasons[0],
        });
      }
    } catch (err) {
      console.debug("[chat] getGoal restore skipped", err);
    }
  }, [request, appendPart, isViewingThread, activitySetWorking]);

  // Restore blocked Goal banner when switching sessions / after server restart
  useEffect(() => {
    if (!currentId) return;
    if (useRunStore.getState().hasLiveRun(currentId)) return;
    void restoreIncompleteGoal(currentId);
  }, [currentId, restoreIncompleteGoal]);



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
    activeWorkersRef.current.delete(data.threadId);
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

  const handleSkill = useCallback((data: { threadId: string; name: string; description?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (isViewingThread(data.threadId)) {
      activitySetWorking({
        title: i18n.t("activity.skill.dockTitle"),
        detail: data.name,
      });
    }
    appendPart(data.threadId, {
      type: "skill",
      name: data.name,
      description: data.description,
    });
  }, [appendPart, activitySetWorking, isViewingThread, ensureLiveRun]);

  const handleWorkerStart = useCallback((data: { threadId: string; workerId: string; workerType: string; description?: string; scenarioId?: string }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const title = formatWorkerTitle(data.workerType, data.description, data.scenarioId);
    upsertActiveWorker(data.threadId, data.workerId, title);
    syncWorkerActivity(data.threadId, title);
    appendPart(data.threadId, { type: "worker-start", workerId: data.workerId, workerType: data.workerType, description: data.description, scenarioId: data.scenarioId });
  }, [appendPart, ensureLiveRun, syncWorkerActivity, upsertActiveWorker]);

  const handleWorkerComplete = useCallback((data: { threadId: string; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const title = formatWorkerTitle(data.workerType);
    removeActiveWorker(data.threadId, data.workerId);
    if (isViewingThread(data.threadId)) {
      activitySetLastCompleted(`${data.success ? "✓" : "✗"} ${title}`);
      syncWorkerActivity(data.threadId, i18n.t("activity.processing"));
    }
    appendPart(data.threadId, { type: "worker-complete", workerId: data.workerId, workerType: data.workerType, success: data.success, error: data.error, duration: data.duration });
  }, [appendPart, activitySetLastCompleted, ensureLiveRun, isViewingThread, removeActiveWorker, syncWorkerActivity]);

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
              : data.phase === "adding_slide"
                ? "正在添加页面"
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

  const handleTaskProgress = useCallback((data: {
    threadId: string;
    phase: "understand" | "plan" | "execute" | "verify" | "continue" | "blocked" | "done";
    message?: string;
    reasons?: string[];
    actions?: Array<{ id: "continue" | "cancel" | "provide-info"; label: string }>;
    attempt?: number;
    maxAttempts?: number;
  }) => {
    if (!ensureLiveRun(data.threadId)) return;
    const titleMap: Record<string, string> = {
      understand: "理解任务",
      plan: "规划中",
      execute: "执行中",
      verify: "检查交付",
      continue: "自动续跑",
      blocked: "需要处理",
      done: "已完成",
    };
    if (isViewingThread(data.threadId)) {
      if (data.phase === "done") {
        activitySetLastCompleted(data.message || titleMap.done);
      } else if (data.phase === "blocked") {
        activitySetWorking({
          title: titleMap.blocked,
          detail: data.message || data.reasons?.[0],
        });
      } else {
        activitySetWorking({
          title: titleMap[data.phase] || "处理中",
          detail: data.message,
        });
      }
    }
    appendPart(data.threadId, {
      type: "task-progress",
      phase: data.phase,
      message: data.message,
      reasons: data.reasons,
      actions: data.actions,
      attempt: data.attempt,
      maxAttempts: data.maxAttempts,
    });
  }, [appendPart, activitySetWorking, activitySetLastCompleted, isViewingThread, ensureLiveRun]);

  const handleHeartbeat = useCallback((data: {
    threadId: string;
    message?: string;
    silentMs?: number;
  }) => {
    if (!ensureLiveRun(data.threadId)) return;
    if (isViewingThread(data.threadId)) {
      activitySetWorking({
        title: "仍在处理",
        detail: data.message || "请稍候…",
      });
    }
    appendPart(data.threadId, {
      type: "heartbeat",
      message: data.message,
      silentMs: data.silentMs,
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

  const handleComplete = useCallback((data: { threadId?: string; cancelled?: boolean; success?: boolean; error?: string; text?: string }) => {
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
        const hasText = c.some((p) => p.type === "text" && p.text.trim());
        if (!hasText) {
          const fallbackText = isError
            ? t("chat.processFailed", { detail: data.error })
            : data.text?.trim() || t("chat.taskNoOutput");
          c = appendContentPart(c, { type: "text", text: fallbackText });
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

    activeWorkersRef.current.delete(tid);

    if (viewing) {
      setAskUserData(null);
      activeThreadIdRef.current = null;
      activitySetCompleted();
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
      onEvent("agent.skill", handleSkill),
      onEvent("agent.worker-start", handleWorkerStart),
      onEvent("agent.worker-complete", handleWorkerComplete),
      onEvent("agent.office-progress", handleOfficeProgress),
      onEvent("agent.task-progress", handleTaskProgress),
      onEvent("agent.heartbeat", handleHeartbeat),
      onEvent("agent.tool-call", handleToolCall),
      onEvent("agent.tool-result", handleToolResult),
      onEvent("agent.complete", handleComplete),
      onEvent("agent.file", handleFile),
      onEvent("agent.ask-user", handleAskUser),
      onEvent("agent.ask-user-timeout", handleAskUserTimeout),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [onEvent, handleAgentStart, handleReasoning, handleTextDelta, handleRoute, handleSkill, handleWorkerStart, handleWorkerComplete, handleOfficeProgress, handleTaskProgress, handleHeartbeat, handleToolCall, handleToolResult, handleComplete, handleFile, handleAskUser, handleAskUserTimeout]);

  const handleCancel = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    await cancelSessionRun(threadId);
    if (isViewingThread(threadId)) {
      setAskUserData(null);
      activeThreadIdRef.current = null;
      activitySetCompleted();
      const cached = useRunStore.getState().getMessageCache(threadId);
      if (cached) setMessages(cached);
    }
  }, [activitySetIdle, isViewingThread]);

  /** Blocked banner actions: continue same Goal / provide info / cancel Goal */
  const handleBlockedAction = useCallback(async (action: "continue" | "provide-info" | "cancel") => {
    const threadId = currentIdRef.current;
    if (!threadId) return;

    if (action === "provide-info") {
      setInput("");
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.placeholder = "补充完成该任务所需的信息…";
      });
      return;
    }

    if (action === "cancel") {
      try {
        await request("chat.cancelGoal", { threadId });
      } catch (err) {
        console.warn("[chat] cancelGoal failed", err);
      }
      activitySetIdle();
      return;
    }

    // continue — same Goal
    if (isRunning) {
      setError("当前任务仍在执行，请稍候或先取消");
      return;
    }

    const assistantMsgId = crypto.randomUUID();
    const now = Date.now();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: [],
      createdAt: now,
    };

    activeThreadIdRef.current = threadId;
    lastTextSeqRef.current = 0;
    lastReasoningSeqRef.current = 0;

    useRunStore.getState().beginRun({
      sessionId: threadId,
      assistantMsgId,
      title: "继续完成",
    });

    const next = [...messagesRef.current, assistantMsg];
    useRunStore.getState().setMessageCache(threadId, next);
    setMessages(next);
    activityBeginRun();
    activeWorkersRef.current.delete(threadId);
    db.insertMessage(assistantMsgId, threadId, "assistant", "[]", now).catch(() => {});

    try {
      await request("chat.continueGoal", { threadId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failPendingRun(threadId, errorMessage);
    }
  }, [request, isRunning, activityBeginRun, activitySetIdle, failPendingRun]);

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
      activeWorkersRef.current.delete(activeThreadId);

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
      if (!window.hive) return;
      const paths = await window.hive.file.showOpenDialog({
        title: t("chat.selectFiles"),
      });
      if (paths && paths.length > 0) {
        addFiles(paths as unknown as File[]);
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
  const previewWidthPx = usePreviewStore((s) => s.panelWidthPx);

  return (
    <div
      className={`chat-stage chat-shell${previewOpen ? " chat-stage--preview-open" : ""}`}
      style={
        previewOpen
          ? ({ ["--preview-width" as string]: `${previewWidthPx}px` } as CSSProperties)
          : undefined
      }
    >
      <BgToastHost />
      <div ref={scrollRef} className="chat-stage__scroll scrollbar-thin" onScroll={handleScroll}>
        {isEmpty ? (
          <EmptyState onScenarioSelect={setInput} />
        ) : (
          <div ref={messagesRailRef} className="chat-rail chat-rail--messages py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={msg === messages[messages.length - 1]}
                isRunning={isRunning && msg === messages[messages.length - 1]}
                onOpenImage={setLightboxSrc}
                onBlockedAction={handleBlockedAction}
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
                  p.type === "route" ||
                  p.type === "skill",
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
                aria-label={t("chat.attachFiles")}
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
                aria-label={isRunning ? t("chat.stop") : t("chat.send")}
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

function EmptyState({ onScenarioSelect }: { onScenarioSelect: (text: string) => void }) {
  const { t } = useTranslation();
  const scenarios = [
    { id: "ppt", icon: Presentation, label: t("chat.emptyScenarios.ppt"), hint: t("chat.emptyScenarioHintPpt"), prompt: "帮我做一份项目汇报 PPT，包含项目背景、进展、风险和下一步计划" },
    { id: "doc", icon: FileText, label: t("chat.emptyScenarios.doc"), hint: t("chat.emptyScenarioHintDoc"), prompt: "帮我写本周周报，主要完成了用户登录模块开发和接口联调" },
    { id: "meeting", icon: MessageSquare, label: t("chat.emptyScenarios.meeting"), hint: t("chat.emptyScenarioHintMeeting"), prompt: "帮我整理下面会议纪要的要点和待办事项" },
    { id: "data", icon: BarChart3, label: t("chat.emptyScenarios.data"), hint: t("chat.emptyScenarioHintData"), prompt: "帮我分析这份数据，给出关键指标和趋势" },
  ] as const;
  const quickPrompts: string[] = t("chat.emptyQuickPrompts", { returnObjects: true }) as unknown as string[] ?? [];

  const handleScenario = (prompt: string) => {
    onScenarioSelect(prompt);
  };

  return (
    <div className="chat-empty-state">
      <div className="chat-empty-state__greeting">
        <h2>{t("chat.emptyGreeting")}</h2>
        <p>{t("chat.emptySubtitle")}</p>
      </div>

      <div className="chat-empty-state__cards">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chat-empty-state__card app-no-drag"
            onClick={() => handleScenario(s.prompt)}
          >
            <span className="chat-empty-state__card-icon">
              <s.icon className="w-4 h-4" />
            </span>
            <span className="chat-empty-state__card-label">{s.label}</span>
            <span className="chat-empty-state__card-hint">{s.hint}</span>
          </button>
        ))}
      </div>

      {quickPrompts.length > 0 && (
        <div className="chat-empty-state__prompt-row">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              type="button"
              className="chat-empty-state__prompt-chip app-no-drag"
              onClick={() => handleScenario(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
