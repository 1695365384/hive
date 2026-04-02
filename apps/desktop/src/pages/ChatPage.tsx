import { useState, useRef, useEffect, useCallback } from "react";
import { useChatWsClient } from "../hooks/use-chat-ws-client";
import {
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Loader2,
  Bot,
  Wrench,
  Brain,
  Sparkles,
  Cpu,
  CheckCircle2,
  XCircle,
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
  | { type: "worker-complete"; workerId: string; workerType: string; success: boolean; error?: string; duration?: number };

// ============================================
// Chat Page
// ============================================

export function ChatPage() {
  const { request, onEvent } = useChatWsClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const activeToolStartRef = useRef<number | null>(null);
  const [activeToolTime, setActiveToolTime] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  // Listen to WS events
  useEffect(() => {
    const unsubs = [
      onEvent("agent.reasoning", (data: { threadId: string; text: string }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        appendPart({ type: "reasoning", text: data.text });
      }),
      onEvent("agent.text-delta", (data: { threadId: string; text: string }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        appendPart({ type: "text", text: data.text });
      }),
      onEvent("agent.worker-start", (data: { threadId: string; workerId: string; workerType: string; description?: string }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        appendPart({ type: "worker-start", workerId: data.workerId, workerType: data.workerType, description: data.description });
      }),
      onEvent("agent.worker-complete", (data: { threadId: string; workerId: string; success: boolean; error?: string; duration?: number }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        appendPart({ type: "worker-complete", workerId: data.workerId, success: data.success, error: data.error, duration: data.duration });
      }),
      onEvent("agent.tool-call", (data: { threadId: string; toolCallId: string; toolName: string; args: unknown; workerId?: string; workerType?: string }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        activeToolStartRef.current = Date.now();
        setTimerActive(true);
        appendPart({ type: "tool-call", toolCallId: data.toolCallId, toolName: data.toolName, args: data.args, workerId: data.workerId });
      }),
      onEvent("agent.tool-result", (data: { threadId: string; toolCallId: string; toolName: string; result: unknown; isError?: boolean; workerId?: string; workerType?: string }) => {
        if (data.threadId !== activeThreadIdRef.current) return;
        activeToolStartRef.current = null;
        setTimerActive(false);
        updateToolResult(data.toolCallId, data.result, data.isError);
      }),
      onEvent("agent.complete", (data: { threadId?: string; cancelled?: boolean }) => {
        if (data.threadId && data.threadId !== activeThreadIdRef.current) return;
        setIsRunning(false);
        activeThreadIdRef.current = null;
        activeToolStartRef.current = null;
        setTimerActive(false);
        if (data.cancelled) {
          appendPart({ type: "text", text: "\n\n*Execution cancelled*" });
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [onEvent]);

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
    if (!text || isRunning) return;

    setError(null);
    const threadId = crypto.randomUUID();
    activeThreadIdRef.current = threadId;

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      createdAt: Date.now(),
    };

    // Add empty assistant message
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: [],
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsRunning(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      await request("chat.send", { prompt: text, threadId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setIsRunning(false);
    }
  }, [input, isRunning, request]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

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
              <MessageBubble key={msg.id} message={msg} isLast={msg === messages[messages.length - 1]} isRunning={isRunning && msg === messages[messages.length - 1]} activeToolTime={activeToolTime} />
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
          <div className="relative flex items-end gap-2 bg-stone-900/80 border border-stone-800 rounded-2xl px-4 py-3 focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all duration-200">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask Hive anything..."
              rows={1}
              className="flex-1 bg-transparent text-stone-100 placeholder-stone-600 text-sm resize-none outline-none leading-relaxed max-h-[200px]"
              disabled={isRunning}
            />
            <button
              onClick={isRunning ? handleCancel : handleSend}
              disabled={!input.trim() && !isRunning}
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
    </div>
  );
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

function MessageBubble({ message, isLast, isRunning, activeToolTime }: { message: ChatMessage; isLast: boolean; isRunning: boolean; activeToolTime: number | null }) {
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
            <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
              {(message.content[0] as { type: "text"; text: string })?.text}
            </p>
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
          {message.content.map((part, idx) => (
            <ContentPartRenderer key={idx} part={part} activeToolTime={isLast && isRunning ? activeToolTime : null} />
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
// Content Part Renderer
// ============================================

function ContentPartRenderer({ part, activeToolTime }: { part: ContentPart; activeToolTime: number | null }) {
  switch (part.type) {
    case "reasoning":
      return <ReasoningBlock text={part.text} />;
    case "text":
      return <TextBlock text={part.text} />;
    case "tool-call":
      return <ToolCallBlock toolCallId={part.toolCallId} toolName={part.toolName} args={part.args} result={part.result} isError={part.isError} elapsedSeconds={activeToolTime} workerId={part.workerId} />;
    case "worker-start":
      return <WorkerStartBlock workerId={part.workerId} workerType={part.workerType} description={part.description} />;
    case "worker-complete":
      return <WorkerCompleteBlock workerId={part.workerId} success={part.success} error={part.error} duration={part.duration} />;
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

    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: linkProcessed }} />
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
// Tool Call Block
// ============================================

function ToolCallBlock({
  toolName,
  args,
  result,
  isError,
  elapsedSeconds,
  workerId,
}: {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  elapsedSeconds?: number | null;
  workerId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const statusColor = result !== undefined
    ? isError
      ? "text-red-400 bg-red-400/10 border-red-400/20"
      : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
    : "text-amber-400 bg-amber-400/10 border-amber-400/20";

  const statusIcon = result !== undefined
    ? isError
      ? <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
    : <Loader2 className="w-3 h-3 animate-spin" />;

  const statusText = result !== undefined
    ? isError ? "failed" : "done"
    : elapsedSeconds != null && elapsedSeconds > 0
      ? `${elapsedSeconds}s`
      : "running";

  // Capture final elapsed time when result arrives
  const finalElapsed = result !== undefined && elapsedSeconds != null && elapsedSeconds > 0
    ? `${elapsedSeconds}s`
    : null;

  // Format args for display
  const argsDisplay = typeof args === "object" && args !== null
    ? Object.entries(args as Record<string, unknown>)
        .filter(([key]) => key !== "type" && key !== "id")
        .map(([key, val]) => `${key}: ${typeof val === "string" && val.length > 60 ? val.slice(0, 60) + "..." : String(val)}`)
        .join(", ")
    : String(args ?? "");

  return (
    <div className={`rounded-xl border overflow-hidden ${statusColor} transition-colors duration-300`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Wrench className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="text-xs font-mono font-medium">{toolName}</span>
        {argsDisplay && (
          <span className="text-[11px] opacity-50 truncate font-mono">{argsDisplay}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[10px] uppercase tracking-wider">
          {statusIcon}
          {statusText}
          {finalElapsed && <span className="text-stone-600 normal-case">{finalElapsed}</span>}
        </span>
        {isOpen ? <ChevronDown className="w-3 h-3 shrink-0 opacity-40" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 border-t border-inherit/20">
          {/* Args */}
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Input</p>
            <pre className="text-[11px] font-mono opacity-70 whitespace-pre-wrap break-all bg-black/20 rounded-lg p-2.5 max-h-40 overflow-auto">
              {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {/* Result */}
          {result !== undefined && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Output</p>
              <pre className="text-[11px] font-mono opacity-70 whitespace-pre-wrap break-all bg-black/20 rounded-lg p-2.5 max-h-40 overflow-auto">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
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
// Worker Start Block
// ============================================

function WorkerStartBlock({ workerType, description }: { workerId: string; workerType: string; description?: string }) {
  const color = getWorkerColor(workerType);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={`rounded-xl border ${color.border} ${color.bg} overflow-hidden`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors`}
      >
        <Cpu className={`w-3.5 h-3.5 shrink-0 ${color.text}`} />
        <span className={`text-xs font-medium ${color.text} uppercase tracking-wider`}>
          {workerType}
        </span>
        {description && (
          <span className="text-[11px] text-stone-500 truncate">{description}</span>
        )}
        <Loader2 className="w-3 h-3 animate-spin text-stone-500 ml-auto shrink-0" />
        {isOpen ? <ChevronDown className="w-3 h-3 shrink-0 opacity-40" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />}
      </button>
      {isOpen && (
        <div className={`px-3 pb-2 border-t ${color.border}`}>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${color.dot} animate-pulse`} />
            <span className="text-[11px] text-stone-500">Running...</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Worker Complete Block
// ============================================

function WorkerCompleteBlock({ workerType, success, error, duration }: { workerId: string; workerType: string; success: boolean; error?: string; duration?: number }) {
  const color = getWorkerColor(workerType);

  return (
    <div className={`rounded-lg border ${color.border} ${color.bg} px-3 py-1.5 flex items-center gap-2`}>
      {success ? (
        <CheckCircle2 className={`w-3.5 h-3.5 ${color.text} shrink-0`} />
      ) : (
        <XCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
      )}
      <span className={`text-xs font-medium ${color.text} uppercase tracking-wider`}>
        {workerType}
      </span>
      <span className="text-[11px] text-stone-500">
        {success ? "completed" : "failed"}
        {duration != null && ` in ${(duration / 1000).toFixed(1)}s`}
      </span>
      {error && (
        <span className="text-[11px] text-red-400 truncate ml-auto">{error}</span>
      )}
    </div>
  );
}
