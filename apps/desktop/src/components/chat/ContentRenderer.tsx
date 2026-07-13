import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { TextBlock } from "../TextBlock";
import { ThinkingCard } from "./ThinkingCard";
import { ToolCallBlock } from "./ToolCallBlock";
import { FileAttachmentBlock } from "./FileAttachmentBlock";
import { ActivityCard } from "./ActivityCard";
import { formatToolLabel } from "./activity-labels";
import { formatWorkerTitle, formatScenarioLabel } from "./worker-labels";
import type { GroupedContent } from "./types";

export type GroupedContentRendererProps = {
  part: GroupedContent;
  sourceMessageId?: string;
  autoPreview?: boolean;
  isStreaming?: boolean;
  isReasoningStreaming?: boolean;
};

export function GroupedContentRenderer({
  part,
  sourceMessageId,
  autoPreview,
  isStreaming,
  isReasoningStreaming,
}: GroupedContentRendererProps) {
  switch (part.type) {
    case "reasoning":
      return <ThinkingCard text={part.text} isStreaming={isReasoningStreaming} />;
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
        <div className="activity-standalone">
          <ToolCallBlock
            toolCallId={part.toolCallId}
            toolName={part.toolName}
            args={part.args}
            result={part.result}
            isError={part.isError}
            workerId={part.workerId}
            startedAt={part.startedAt}
            durationMs={part.durationMs}
          />
        </div>
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
          servedPath={part.servedPath}
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
  const label = formatToolLabel(toolName, (children[0] as { args?: unknown })?.args);

  return (
    <div className="activity-standalone">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="activity-step__row activity-step__row--clickable w-full"
      >
        <span className="activity-step__label">{label}</span>
        <span className="activity-step__time">×{count}</span>
        <ChevronRight
          className={`activity-step__chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200 ml-auto ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="activity-card__steps">
          {children.map((child, idx) => {
            if (child.type !== "tool-call") return null;
            return (
              <ToolCallBlock
                key={child.toolCallId || idx}
                toolCallId={child.toolCallId}
                toolName={child.toolName}
                args={child.args}
                result={child.result}
                isError={child.isError}
                startedAt={child.startedAt}
                durationMs={child.durationMs}
                nested
              />
            );
          })}
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
  const title = formatWorkerTitle(workerType, description, scenarioId);
  const scenarioLabel = scenarioId ? formatScenarioLabel(scenarioId) : undefined;
  const toolSteps = children.filter((c) => c.type === "tool-call");
  const deliverables = children.filter((c) => c.type === "file-attachment");
  const steps = children.filter((c) => c.type !== "file-attachment");
  const isRunning = status === "running";

  const deliverableNodes =
    deliverables.length > 0
      ? deliverables.map((child, idx) => (
          <FileAttachmentBlock
            key={`${child.path}-${child.name}-${idx}`}
            name={child.name}
            size={child.size}
            mimeType={child.mimeType}
            path={child.path}
            servedPath={child.servedPath}
            src={child.src}
          />
        ))
      : undefined;

  return (
    <ActivityCard
      title={title}
      status={status}
      durationMs={duration}
      stepCount={toolSteps.length}
      badge={scenarioLabel && description?.trim() ? scenarioLabel : workerType}
      deliverables={deliverableNodes}
    >
      {steps.map((child, idx) => {
        if (child.type === "tool-call") {
          return (
            <ToolCallBlock
              key={child.toolCallId || idx}
              toolCallId={child.toolCallId}
              toolName={child.toolName}
              args={child.args}
              result={child.result}
              isError={child.isError}
              startedAt={child.startedAt}
              durationMs={child.durationMs}
              nested
            />
          );
        }
        if (child.type === "reasoning") {
          return (
            <ThinkingCard
              key={idx}
              text={child.text}
              isStreaming={isRunning && idx === children.length - 1}
            />
          );
        }
        if (child.type === "text") {
          return (
            <div key={idx} className="activity-step__text text-sm text-stone-400 whitespace-pre-wrap px-2 py-1">
              {child.text}
            </div>
          );
        }
        return null;
      })}
    </ActivityCard>
  );
}

const WorkerBlock = memo(WorkerBlockInner);

export { WorkerBlock, ToolBatchBlock };
