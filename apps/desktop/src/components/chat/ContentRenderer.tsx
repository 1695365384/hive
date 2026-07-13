import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { TextBlock } from "../TextBlock";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { FileAttachmentBlock } from "./FileAttachmentBlock";
import { formatWorkerTitle, formatScenarioLabel } from "./worker-labels";
import type { GroupedContent } from "./types";

export type GroupedContentRendererProps = {
  part: GroupedContent;
  activeToolTime: number | null;
  sourceMessageId?: string;
  autoPreview?: boolean;
  isStreaming?: boolean;
};

export function GroupedContentRenderer({
  part,
  activeToolTime,
  sourceMessageId,
  autoPreview,
  isStreaming,
}: GroupedContentRendererProps) {
  switch (part.type) {
    case "reasoning":
      return <ReasoningBlock text={part.text} />;
    case "text":
      return (
        <TextBlock
          text={part.text}
          sourceMessageId={sourceMessageId}
          autoPreview={autoPreview}
          isStreaming={isStreaming}
        />
      );
    case "tool-call":
      return (
        <ToolCallBlock
          toolCallId={part.toolCallId}
          toolName={part.toolName}
          args={part.args}
          result={part.result}
          isError={part.isError}
          elapsedSeconds={activeToolTime}
          workerId={part.workerId}
        />
      );
    case "tool-batch":
      return <ToolBatchBlock toolName={part.toolName} count={part.count} children={part.children} />;
    case "worker":
      return (
        <WorkerBlock
          workerType={part.workerType}
          description={part.description}
          scenarioId={part.scenarioId}
          children={part.children}
          status={part.status}
          duration={part.duration}
          error={part.error}
        />
      );
    case "file-attachment":
      return (
        <FileAttachmentBlock
          name={part.name}
          size={part.size}
          mimeType={part.mimeType}
          path={part.path}
          src={part.src}
        />
      );
  }
}

function ToolBatchBlock({
  toolName,
  count,
  children,
}: {
  toolName: string;
  count: number;
  children: GroupedContent[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs w-full text-left hover:text-stone-300"
      >
        <span className="text-stone-500 font-mono">{toolName}</span>
        <span className="text-stone-600">×{count}</span>
        <ChevronRight
          className={`w-3 h-3 text-stone-700 shrink-0 transition-transform ml-auto ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="ml-3 pl-2 border-l border-stone-800/50 space-y-0">
          {children.map((child, idx) => (
            <GroupedContentRenderer key={idx} part={child} activeToolTime={null} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerBlockInner({
  workerType,
  description,
  scenarioId,
  children,
  status,
  duration,
}: {
  workerType: string;
  description?: string;
  scenarioId?: string;
  children: GroupedContent[];
  status: "running" | "completed" | "failed";
  duration?: number;
  error?: string;
}) {
  const isRunning = status === "running";
  const [isOpen, setIsOpen] = useState(false);
  const timeStr = duration != null ? `${(duration / 1000).toFixed(1)}s` : "";
  const title = formatWorkerTitle(workerType, description, scenarioId);
  const scenarioLabel = scenarioId ? formatScenarioLabel(scenarioId) : undefined;
  const toolNames = children
    .filter((c) => c.type === "tool-call")
    .map((c) => (c as { toolName: string }).toolName)
    .join(", ");

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs w-full text-left hover:text-stone-300"
      >
        <span className="text-stone-500">{title}</span>
        {scenarioLabel && description?.trim() && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-900/30 text-amber-400/80 shrink-0">
            {scenarioLabel}
          </span>
        )}
        {isRunning && <span className="w-1 h-1 rounded-full bg-amber-400/60 animate-pulse" />}
        {!isRunning && timeStr && <span className="text-stone-700">{timeStr}</span>}
        {!isRunning && toolNames && <span className="text-stone-700 truncate">{toolNames}</span>}
        {children.length > 0 && (
          <ChevronRight
            className={`w-3 h-3 text-stone-700 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        )}
      </button>

      {isOpen && children.length > 0 && (
        <div className="ml-3 pl-2 border-l border-stone-800/50 space-y-0">
          {children.map((child, idx) => (
            <GroupedContentRenderer key={idx} part={child} activeToolTime={null} />
          ))}
        </div>
      )}
    </div>
  );
}

const WorkerBlock = memo(WorkerBlockInner);

export { WorkerBlock, ToolBatchBlock };
