import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChatWsClient } from "../hooks/use-chat-ws-client";
import { useFileUpload } from "../hooks/use-file-upload";
import { FilePreviewList } from "../components/FilePreview";
import { ImagePreview } from "../components/ImagePreview";
import {
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Loader2,
  Bot,
  Brain,
  Paperclip,
  Sparkles,
  Cpu,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: ContentPart[];
  createdAt: number;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown; result?: unknown; isError?: boolean; workerId?: string }
  | { type: "worker-start"; workerId: string; workerType: string; description?: string }
  | { type: "worker-complete"; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }
  | { type: "file-attachment"; name: string; size: number; mimeType: string; path: string; src?: string };

type GroupedContent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown; result?: unknown; isError?: boolean; workerId?: string }
  | { type: "worker"; workerId: string; workerType: string; description?: string; children: GroupedContent[]; status: "running" | "completed" | "failed"; duration?: number; error?: string }
  | { type: "file-attachment"; name: string; size: number; mimeType: string; path: string; src?: string };

// ============================================
// Chat Page
// ============================================

export function ChatPage() {
  const { request, onEvent } = useChatWsClient();
  const { pendingFiles, uploading, addFiles, removeFile, clearFiles } = useFileUpload();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const activeToolStartRef = useRef<number | null>(null);
  const [activeToolTime, setActiveToolTime] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTextSeqRef = useRef(0);
  const lastReasoningSeqRef = useRef(0);

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

  // Elapsed time timer for active tool calls
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (timerActive && activeToolStartRef.current) {
      const update = () => {
        if (activeToolStartRef.current) {
          setActiveToolTime(Math.floor((Date.now() - activeToolStartRef.current) / 1000));
        }
      };
      update();
      timerRef.current = setInterval(update, 1000);
    } else {
      setActiveToolTime(null);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerActive]);

  // Message mutation helpers (stable references, no deps)
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
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.role !== "assistant") return msg;
        return {
          ...msg,
          content: msg.content.map((part) =>
            part.type === "tool-call" && part.toolCallId === toolCallId
              ? { ...part, result, isError }
              : part
          ),
        };
      })
    );
  }, []);

  // Stable WS event handlers — useCallback ensures dedup in WsClient Set
  // across React.StrictMode double-mount cycles
  const handleReasoning = useCallback((data: { threadId: string; text: string; seq: number }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    if (data.seq <= lastReasoningSeqRef.current) return;
    lastReasoningSeqRef.current = data.seq;
    appendPart({ type: "reasoning", text: data.text });
  }, [appendPart]);

  const handleTextDelta = useCallback((data: { threadId: string; text: string; seq: number }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    if (data.seq !== undefined && data.seq <= lastTextSeqRef.current) return;
    if (data.seq !== undefined) lastTextSeqRef.current = data.seq;
    appendPart({ type: "text", text: data.text });
  }, [appendPart]);

  const handleWorkerStart = useCallback((data: { threadId: string; workerId: string; workerType: string; description?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    appendPart({ type: "worker-start", workerId: data.workerId, workerType: data.workerType, description: data.description });
  }, [appendPart]);

  const handleWorkerComplete = useCallback((data: { threadId: string; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    appendPart({ type: "worker-complete", workerId: data.workerId, workerType: data.workerType, success: data.success, error: data.error, duration: data.duration });
  }, [appendPart]);

  const handleToolCall = useCallback((data: { threadId: string; toolCallId: string; toolName: string; args: unknown; workerId?: string; workerType?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    activeToolStartRef.current = Date.now();
    setTimerActive(true);
    appendPart({ type: "tool-call", toolCallId: data.toolCallId, toolName: data.toolName, args: data.args, workerId: data.workerId });
  }, [appendPart]);

  const handleToolResult = useCallback((data: { threadId: string; toolCallId: string; toolName: string; result: unknown; isError?: boolean; workerId?: string; workerType?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    activeToolStartRef.current = null;
    setTimerActive(false);
    updateToolResult(data.toolCallId, data.result, data.isError);
  }, [updateToolResult]);

  const handleComplete = useCallback((data: { threadId?: string; cancelled?: boolean }) => {
    if (data.threadId && data.threadId !== activeThreadIdRef.current) return;
    setIsRunning(false);
    activeThreadIdRef.current = null;
    activeToolStartRef.current = null;
    setTimerActive(false);
    if (data.cancelled) {
      appendPart({ type: "text", text: "\n\n*Execution cancelled*" });
    }
  }, [appendPart]);

  const handleFile = useCallback((data: { threadId: string; name: string; path: string; size: number; mimeType: string; type: string; src?: string }) => {
    if (data.threadId !== activeThreadIdRef.current) return;
    appendPart({ type: "file-attachment", name: data.name, size: data.size, mimeType: data.mimeType, path: data.path, src: data.src });
  }, [appendPart]);

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
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [onEvent, handleReasoning, handleTextDelta, handleWorkerStart, handleWorkerComplete, handleToolCall, handleToolResult, handleComplete, handleFile]);

  const handleCancel = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    try {
      await request("chat.cancel", { threadId });
    } catch {
      // Ignore cancel errors — agent.complete event will reset state
    }
  }, [request]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || isRunning) return;

    setError(null);
    const threadId = crypto.randomUUID();
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

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      createdAt: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: [],
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    clearFiles();
    setIsRunning(true);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const attachments = pendingFiles.map(f => ({ type: f.type, path: f.path, name: f.name, size: f.size, mimeType: f.mimeType }));
      await request("chat.send", { prompt: text || undefined, threadId, attachments: attachments.length > 0 ? attachments : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setIsRunning(false);
    }
  }, [input, pendingFiles, isRunning, request, clearFiles]);

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
    <div className="flex flex-col h-full bg-stone-950">
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isLast={msg === messages[messages.length - 1]} isRunning={isRunning && msg === messages[messages.length - 1]} activeToolTime={activeToolTime} onOpenImage={setLightboxSrc} />
            ))}
            {isRunning && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1].content.length === 0 && (
              <div className="flex items-center gap-2 px-1 py-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:300ms]" />
                </div>
                {activeToolTime !== null && activeToolTime > 2 && (
                  <span className="text-[11px] text-stone-600 tabular-nums">{activeToolTime}s</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-auto max-w-3xl w-full px-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300">&times;</button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="shrink-0 border-t border-stone-800/60">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* File previews */}
          {pendingFiles.length > 0 && (
            <div className="mb-2">
              <FilePreviewList files={pendingFiles} onRemove={removeFile} />
            </div>
          )}
          <div
            className="relative flex items-end gap-2 bg-stone-900/80 border border-stone-800 rounded-2xl px-3 py-2.5 focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all duration-200"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <button
              onClick={handleFileSelect}
              className="shrink-0 self-center p-1 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
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
              className="flex-1 bg-transparent text-stone-100 placeholder-stone-600 text-sm resize-none outline-none leading-relaxed max-h-[200px] py-0.5"
              disabled={isRunning || uploading}
            />
            <button
              onClick={isRunning ? handleCancel : handleSend}
              disabled={!isRunning && (!input.trim() && pendingFiles.length === 0) || uploading}
              className={`shrink-0 p-2 rounded-xl transition-all duration-200 ${
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
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && <ImagePreview src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

// ============================================
// Content Grouping — flat ContentPart[] → nested GroupedContent[]
// ============================================

function groupContentParts(parts: ContentPart[]): GroupedContent[] {
  const result: GroupedContent[] = [];
  const activeWorkers = new Map<string, GroupedContent & { type: "worker" }>();

  for (const part of parts) {
    if (part.type === "worker-start") {
      const group: GroupedContent & { type: "worker" } = {
        type: "worker",
        workerId: part.workerId,
        workerType: part.workerType,
        description: part.description,
        children: [],
        status: "running",
      };
      activeWorkers.set(part.workerId, group);
      result.push(group);
    } else if (part.type === "worker-complete") {
      const group = activeWorkers.get(part.workerId);
      if (group) {
        group.status = part.success ? "completed" : "failed";
        group.duration = part.duration;
        group.error = part.error;
        activeWorkers.delete(part.workerId);
      }
    } else if (part.type === "tool-call" || part.type === "reasoning") {
      const wid = "workerId" in part ? (part as { workerId?: string }).workerId : undefined;
      const group = wid ? activeWorkers.get(wid) : undefined;
      if (group) {
        group.children.push(part as GroupedContent);
      } else {
        result.push(part as GroupedContent);
      }
    } else {
      result.push(part as GroupedContent);
    }
  }

  return result;
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 select-none">
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 bg-amber-500/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo mark */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-amber-400" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400/80 animate-pulse" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-stone-200">Talk to Hive</h2>
          <p className="text-sm text-stone-500 max-w-xs leading-relaxed">
            Your multi-agent collaboration framework. Ask questions, explore code, or let agents solve tasks for you.
          </p>
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap justify-center gap-2 mt-2 max-w-md">
          {["Analyze the project structure", "Help me debug an issue", "Explain the architecture"].map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 rounded-full text-xs text-stone-400 bg-stone-900/60 border border-stone-800 hover:border-amber-500/30 hover:text-amber-400/80 transition-all duration-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Message Bubble
// ============================================

function MessageBubble({ message, isLast, isRunning, activeToolTime, onOpenImage }: { message: ChatMessage; isLast: boolean; isRunning: boolean; activeToolTime: number | null; onOpenImage: (src: string) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] group">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-[11px] text-stone-600">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-[11px] font-medium text-stone-500">You</span>
          </div>
          <div className="px-4 py-2.5 rounded-2xl rounded-tr-md bg-stone-800/80 border border-stone-700/50">
            {message.content.map((part, idx) => {
              if (part.type === "file-attachment") {
                const isImage = part.mimeType?.startsWith("image/");
                return isImage ? (
                  <img
                    key={idx}
                    src={`http://127.0.0.1:4450${part.src}`}
                    alt={part.name}
                    className="max-w-[200px] max-h-[150px] rounded-lg mb-1 object-cover cursor-pointer"
                    onClick={() => onOpenImage(`http://127.0.0.1:4450${part.src}`)}
                  />
                ) : (
                  <a
                    key={idx}
                    href={`http://127.0.0.1:4450${part.src}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs mb-1 text-amber-400/80 hover:text-amber-300 transition-colors"
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span>{part.name}</span>
                    <span className="text-stone-600">{part.size >= 1024 ? `${(part.size / 1024).toFixed(1)}KB` : `${part.size}B`}</span>
                  </a>
                );
              }
              return null;
            })}
            {message.content.some(p => p.type === "text") && (
              <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
                {(message.content.find(p => p.type === "text") as { type: "text"; text: string })?.text}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
            <Bot className="w-3 h-3 text-amber-400" />
          </div>
          <span className="text-[11px] font-medium text-stone-500">Hive Agent</span>
          <span className="text-[11px] text-stone-700">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div className="space-y-3">
          {groupContentParts(message.content).map((part, idx) => (
            <GroupedContentRenderer key={idx} part={part} activeToolTime={isLast && isRunning ? activeToolTime : null} />
          ))}
          {/* Streaming cursor */}
          {isRunning && isLast && message.content.length > 0 && message.content[message.content.length - 1].type === "text" && (
            <span className="inline-block w-2 h-4 bg-amber-400/70 animate-pulse ml-0.5 rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Grouped Content Renderer (recursive)
// ============================================

function GroupedContentRenderer({ part, activeToolTime }: { part: GroupedContent; activeToolTime: number | null }) {
  switch (part.type) {
    case "reasoning":
      return <ReasoningBlock text={part.text} />;
    case "text":
      return <TextBlock text={part.text} />;
    case "tool-call":
      return <ToolCallBlock toolCallId={part.toolCallId} toolName={part.toolName} args={part.args} result={part.result} isError={part.isError} elapsedSeconds={activeToolTime} workerId={part.workerId} />;
    case "worker":
      return <WorkerBlock workerType={part.workerType} description={part.description} children={part.children} status={part.status} duration={part.duration} error={part.error} />;
    case "file-attachment": {
      const isImage = part.mimeType?.startsWith("image/");
      return isImage ? (
        <img
          src={`http://127.0.0.1:4450${part.src}`}
          alt={part.name}
          className="max-w-[300px] max-h-[200px] rounded-lg object-cover cursor-pointer"
          onClick={() => window.dispatchEvent(new CustomEvent('open-lightbox', { detail: `http://127.0.0.1:4450${part.src}` }))}
        />
      ) : (
        <a
          href={`http://127.0.0.1:4450${part.src}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-300 transition-colors"
        >
          <FileText className="w-3 h-3 shrink-0" />
          <span>{part.name}</span>
          <span className="text-stone-600">{part.size >= 1024 ? `${(part.size / 1024).toFixed(1)}KB` : `${part.size}B`}</span>
        </a>
      );
    }
  }
}

// ============================================
// Text Block (Markdown-like)
// ============================================

function TextBlock({ text }: { text: string }) {
  if (!text) return null;

  // Simple rendering: code blocks + inline code + links + bold
  const rendered = text.split("\n").map((line, i) => {
    // Code block
    if (line.startsWith("```")) return null; // Simplified: strip markers
    // Bold
    const boldProcessed = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-stone-100 font-semibold">$1</strong>');
    // Inline code
    const codeProcessed = boldProcessed.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-stone-800 text-amber-400/90 text-[13px] font-mono">$1</code>');
    // Links
    const linkProcessed = codeProcessed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-amber-400/80 hover:text-amber-300 underline underline-offset-2">$1</a>');
    // File paths: [File: name.ext (size)] /path/to/file → extract filename for /files/ route
    const fileProcessed = linkProcessed.replace(
      /\[File: ([^\]]+)\] (\/[^\s<]+)/g,
      (_, name, fullPath) => {
        const fileName = fullPath.split("/").pop() || fullPath;
        return `<a href="http://127.0.0.1:4450/files/${fileName}" class="text-amber-400/80 hover:text-amber-300 underline underline-offset-2">[File: ${name}] ${fileName}</a>`;
      }
    );

    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: fileProcessed }} />
        {i < text.split("\n").length - 1 && <br />}
      </span>
    );
  });

  return (
    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md bg-stone-900/50 border border-stone-800/50">
      <p className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
        {rendered}
      </p>
    </div>
  );
}

// ============================================
// Reasoning Block (Collapsible)
// ============================================

function ReasoningBlock({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!text) return null;

  return (
    <div className="group">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-stone-500 hover:text-stone-400 transition-colors w-full"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Brain className="w-3 h-3 text-amber-500/60" />
        <span>Thinking</span>
        <span className="text-stone-700">· {text.length} chars</span>
      </button>
      {isOpen && (
        <div className="mt-1 ml-5 pl-3 border-l border-amber-500/15">
          <p className="text-xs text-stone-500 whitespace-pre-wrap leading-relaxed font-mono">{text}</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Tool Call Block (compact single-line)
// ============================================

type ToolCallBlockProps = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  elapsedSeconds?: number | null;
  workerId?: string;
};

function ToolCallBlock({ toolName, args, result, isError, elapsedSeconds }: ToolCallBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDone = result !== undefined;
  const isRunning = !isDone;

  const dotColor = isDone
    ? isError ? "bg-red-400" : "bg-emerald-400"
    : "bg-amber-400";

  // Format first arg value for compact display
  const argsPreview = useMemo(() => {
    if (typeof args !== "object" || args === null) return String(args ?? "");
    const entries = Object.entries(args as Record<string, unknown>)
      .filter(([key]) => key !== "type" && key !== "id");
    if (entries.length === 0) return "";
    const [key, val] = entries[0];
    const valStr = typeof val === "string" && val.length > 50 ? val.slice(0, 50) + "..." : String(val);
    return `${key}=${valStr}`;
  }, [args]);

  const timeText = isRunning
    ? elapsedSeconds != null && elapsedSeconds > 0 ? `${elapsedSeconds}s` : ""
    : elapsedSeconds != null && elapsedSeconds > 0 ? `${elapsedSeconds}s` : "";

  return (
    <div className="group flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-white/[0.02] cursor-pointer transition-colors"
      onClick={() => setIsOpen(!isOpen)}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${isRunning ? "animate-pulse" : ""}`} />
      <span className="text-[11px] font-mono text-stone-400">{toolName}</span>
      {argsPreview && (
        <span className="text-[10px] text-stone-600 truncate font-mono">{argsPreview}</span>
      )}
      {timeText && (
        <span className="text-[10px] text-stone-600 ml-auto shrink-0 tabular-nums">{timeText}</span>
      )}
      {isDone && isError && (
        <span className="text-[10px] text-red-400 shrink-0">failed</span>
      )}
      {isOpen ? <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-30" /> : null}

      {isOpen && (
        <div className="absolute left-4 right-4 mt-1 z-10 rounded-lg border border-stone-700/60 bg-stone-900 shadow-xl">
          <div className="p-2.5 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-600 mb-1">Input</p>
              <pre className="text-[11px] font-mono text-stone-400 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
              </pre>
            </div>
            {result !== undefined && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-600 mb-1">Output</p>
                <pre className="text-[11px] font-mono text-stone-400 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Worker Type Colors
// ============================================

const WORKER_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  explore: { border: "border-blue-500/30", bg: "bg-blue-500/5", text: "text-blue-400", dot: "bg-blue-400" },
  plan: { border: "border-purple-500/30", bg: "bg-purple-500/5", text: "text-purple-400", dot: "bg-purple-400" },
  general: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400", dot: "bg-emerald-400" },
};

function getWorkerColor(workerType: string) {
  return WORKER_COLORS[workerType] ?? WORKER_COLORS.general;
}

// ============================================
// Worker Block (unified: start + children + complete)
// ============================================

function WorkerBlock({ workerType, description, children, status, duration, error }: {
  workerType: string;
  description?: string;
  children: GroupedContent[];
  status: "running" | "completed" | "failed";
  duration?: number;
  error?: string;
}) {
  const color = getWorkerColor(workerType);
  const isRunning = status === "running";
  // Default open while running, closed when completed
  const [isOpen, setIsOpen] = useState(isRunning);

  const toolCount = children.filter(c => c.type === "tool-call").length;
  const timeStr = duration != null ? `${(duration / 1000).toFixed(1)}s` : "";

  return (
    <div className={`rounded-lg border ${color.border} ${color.bg} overflow-hidden`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Cpu className={`w-3 h-3 shrink-0 ${color.text}`} />
        <span className={`text-[11px] font-medium ${color.text} uppercase tracking-wider`}>
          {workerType}
        </span>
        {description && (
          <span className="text-[10px] text-stone-500 truncate">{description}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {isRunning ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin text-stone-500" />
          ) : status === "completed" ? (
            <CheckCircle2 className={`w-2.5 h-2.5 ${color.text}`} />
          ) : (
            <XCircle className="w-2.5 h-2.5 text-red-400" />
          )}
          {!isRunning && toolCount > 0 && (
            <span className="text-[10px] text-stone-600">{toolCount} tools</span>
          )}
          {!isRunning && timeStr && (
            <span className="text-[10px] text-stone-600 tabular-nums">{timeStr}</span>
          )}
          {isRunning && (
            <span className="text-[10px] text-stone-500">Running...</span>
          )}
        </span>
        {isOpen ? <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-30" /> : <ChevronRight className="w-2.5 h-2.5 shrink-0 opacity-30" />}
      </button>

      {isOpen && children.length > 0 && (
        <div className={`border-t ${color.border}`}>
          <div className="px-2 py-1">
            {children.map((child, idx) => (
              <GroupedContentRenderer key={idx} part={child} activeToolTime={null} />
            ))}
          </div>
        </div>
      )}

      {isOpen && isRunning && children.length === 0 && (
        <div className={`px-2.5 pb-1.5 border-t ${color.border}`}>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1 h-1 rounded-full ${color.dot} animate-pulse`} />
            <span className="text-[10px] text-stone-500">Waiting...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="px-2.5 py-1 border-t border-red-500/20 bg-red-500/5">
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}
