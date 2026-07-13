import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";

export type ToolCallBlockProps = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  elapsedSeconds?: number | null;
  workerId?: string;
};

function ToolCallBlockInner({ toolName, result, isError, elapsedSeconds }: ToolCallBlockProps) {
  const isDone = result !== undefined;
  const isRunning = !isDone;
  const timeText = elapsedSeconds != null && elapsedSeconds > 0 ? `${elapsedSeconds}s` : "";
  const [isOpen, setIsOpen] = useState(false);
  const hasOutput = isDone && result !== undefined;

  return (
    <div>
      <button
        onClick={() => hasOutput && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 text-[11px] w-full text-left ${hasOutput ? "cursor-pointer hover:text-stone-300" : ""}`}
      >
        <span className="text-stone-500 font-mono">{toolName}</span>
        {isRunning && <span className="w-1 h-1 rounded-full bg-amber-400/60 animate-pulse shrink-0" />}
        {isError && <span className="text-red-400/80">failed</span>}
        {timeText && <span className="text-stone-700 tabular-nums ml-auto">{timeText}</span>}
        {hasOutput && (
          <ChevronRight
            className={`w-3 h-3 text-stone-700 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {isOpen && result !== undefined && (
        <div className="mt-0.5 ml-2 pl-2 border-l border-stone-800/50 text-[11px] text-stone-600 leading-relaxed max-h-32 overflow-auto">
          {typeof result === "string" ? result : JSON.stringify(result)}
        </div>
      )}
    </div>
  );
}

export const ToolCallBlock = memo(ToolCallBlockInner);
