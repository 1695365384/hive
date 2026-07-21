import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { TextBlock } from "../TextBlock";
import { ThinkingCard } from "./ThinkingCard";
import { ToolCallBlock } from "./ToolCallBlock";
import { FileAttachmentBlock } from "./FileAttachmentBlock";
import { ActivityCard } from "./ActivityCard";
import { RouteChip } from "./RouteChip";
import { SkillChip } from "./SkillChip";
import { formatToolLabel } from "./activity-labels";
import { formatWorkerTitle, formatScenarioLabel } from "./worker-labels";
import { playMotion } from "../../motion";
import type { GroupedContent } from "./types";

export type BlockedActionId = "continue" | "provide-info" | "cancel";

export type GroupedContentRendererProps = {
  part: GroupedContent;
  sourceMessageId?: string;
  autoPreview?: boolean;
  isStreaming?: boolean;
  isReasoningStreaming?: boolean;
  onBlockedAction?: (action: BlockedActionId) => void;
};

export function GroupedContentRenderer({
  part,
  sourceMessageId,
  autoPreview,
  isStreaming,
  isReasoningStreaming,
  onBlockedAction,
}: GroupedContentRendererProps) {
  switch (part.type) {
    case "route":
      return (
        <RouteChip
          mode={part.mode}
          scenarioId={part.scenarioId}
          workerType={part.workerType}
          workerTypes={part.workerTypes}
          title={part.title}
        />
      );
    case "skill":
      return <SkillChip name={part.name} description={part.description} />;
    case "office-progress":
      return <OfficeProgressBanner part={part} />;
    case "task-progress":
      return <TaskProgressBanner part={part} onBlockedAction={onBlockedAction} />;
    case "heartbeat":
      return <HeartbeatPulse part={part} />;
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
    case "worker-lane":
      return <WorkerLaneBlock part={part} />;
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
          sourceMessageId={sourceMessageId}
        />
      );
    case "image-gallery":
      return (
        <div className="image-gallery" role="list">
          {part.images.map((img, idx) => (
            <FileAttachmentBlock
              key={`${img.path}-${img.name}-${idx}`}
              name={img.name}
              size={img.size}
              mimeType={img.mimeType}
              path={img.path}
              servedPath={img.servedPath}
              src={img.src}
              sourceMessageId={sourceMessageId}
            />
          ))}
        </div>
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const firstArgs = (children[0] as { args?: unknown } | undefined)?.args;
  const isFileOps = toolName === "file-ops" || toolName === "__file-ops__";
  const isOfficeOps = toolName === "office-ops";
  const detail = isFileOps
    ? t("activity.tool.fileOps", { count })
    : isOfficeOps
      ? t("activity.tool.officeOps", { count })
      : formatToolLabel(toolName, firstArgs);
  const label =
    !isFileOps && !isOfficeOps && count > 1
      ? t("activity.tool.batch", { label: detail, count })
      : detail;

  return (
    <div className="activity-standalone">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="activity-step__row activity-step__row--clickable w-full"
      >
        <span className="activity-step__label">{label}</span>
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

function countWorkerSteps(children: GroupedContent[]): number {
  let n = 0;
  for (const child of children) {
    if (child.type === "tool-call") n += 1;
    else if (child.type === "tool-batch") n += child.count;
  }
  return n;
}

const OFFICE_PROGRESS_LABEL: Record<
  "routed" | "creating" | "adding_slide" | "validating" | "delivering" | "blocked",
  string
> = {
  routed: "已交给 Office",
  creating: "正在建稿",
  adding_slide: "正在加页",
  validating: "检查版式",
  delivering: "正在交付",
  blocked: "需要修正",
};

function OfficeProgressBanner({
  part,
}: {
  part: Extract<GroupedContent, { type: "office-progress" }>;
}) {
  const base = OFFICE_PROGRESS_LABEL[part.phase] ?? part.phase;
  let label = base;
  if (part.phase === "adding_slide" && part.slide != null) {
    label =
      part.slideTotal != null
        ? `第 ${part.slide}/${part.slideTotal} 页`
        : `第 ${part.slide} 页`;
  }
  if (part.phase === "blocked" && part.message) {
    label = part.message;
  }
  return (
    <div
      className={`office-progress-banner${part.phase === "blocked" ? " office-progress-banner--blocked" : ""}`}
      role="status"
    >
      {label}
    </div>
  );
}

const TASK_PROGRESS_LABEL: Record<string, string> = {
  understand: "理解任务",
  plan: "规划中",
  execute: "执行中",
  verify: "检查交付",
  continue: "自动续跑",
  blocked: "需要处理",
  done: "已完成",
};

function TaskProgressBanner({
  part,
  onBlockedAction,
}: {
  part: Extract<GroupedContent, { type: "task-progress" }>;
  onBlockedAction?: (action: BlockedActionId) => void;
}) {
  const base = TASK_PROGRESS_LABEL[part.phase] ?? part.phase;
  let label = part.message?.trim() ? part.message : base;
  if (part.phase === "continue" && part.attempt != null && part.maxAttempts != null) {
    label = part.message?.trim()
      ? part.message
      : `自动续跑 (${part.attempt}/${part.maxAttempts})`;
  }
  const blocked = part.phase === "blocked";
  return (
    <div
      className={`task-progress-banner${blocked ? " task-progress-banner--blocked" : ""}${part.phase === "continue" ? " task-progress-banner--continue" : ""}`}
      role="status"
    >
      <div className="task-progress-banner__phase">{base}</div>
      <div className="task-progress-banner__message">{label}</div>
      {blocked && part.reasons && part.reasons.length > 0 ? (
        <ul className="task-progress-banner__reasons">
          {part.reasons.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {blocked && part.actions && part.actions.length > 0 ? (
        <div className="task-progress-banner__actions">
          {part.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="task-progress-banner__action-chip task-progress-banner__action-btn"
              onClick={() => onBlockedAction?.(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeartbeatPulse({
  part,
}: {
  part: Extract<GroupedContent, { type: "heartbeat" }>;
}) {
  return (
    <div className="task-heartbeat-pulse" role="status">
      {part.message?.trim() || "仍在处理，请稍候…"}
    </div>
  );
}

function WorkerLaneBlock({
  part,
}: {
  part: Extract<GroupedContent, { type: "worker-lane" }>;
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const running = part.runningCount;
  const workerKey = part.workers.map((w) => w.workerId).join("|");
  const label =
    running > 0
      ? t("activity.workerLane.running", { count: part.workers.length })
      : t("activity.workerLane.done", { count: part.workers.length });

  useEffect(() => {
    playMotion("worker-card-enter", gridRef.current, {
      childSelector: ":scope > .worker-lane__cell",
    });
  }, [workerKey]);

  return (
    <div className="worker-lane" role="group" aria-label={label}>
      <div className="worker-lane__banner">{label}</div>
      <div ref={gridRef} className="worker-lane__grid">
        {part.workers.map((worker) => (
          <div key={worker.workerId} className="worker-lane__cell">
            <WorkerBlock
              workerType={worker.workerType}
              description={worker.description}
              scenarioId={worker.scenarioId}
              children={worker.children}
              status={worker.status}
              duration={worker.duration}
              error={worker.error}
            />
          </div>
        ))}
      </div>
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
  error,
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
  const stepCount = countWorkerSteps(children);
  const deliverables = children.filter((c) => c.type === "file-attachment");
  const steps = children.filter((c) => c.type !== "file-attachment");
  const isRunning = status === "running";
  // Explore/plan/office flood low-level ops — keep compact unless user expands
  const defaultCollapsed =
    workerType === "explore" ||
    workerType === "plan" ||
    workerType === "office" ||
    workerType === "librarian" ||
    workerType === "metis" ||
    workerType === "momus" ||
    workerType === "oracle" ||
    stepCount >= 8;

  const progressParts = children.filter((c) => c.type === "office-progress");
  const latestProgress =
    progressParts.length > 0
      ? (progressParts[progressParts.length - 1] as Extract<
          GroupedContent,
          { type: "office-progress" }
        >)
      : null;

  const deliverableNodes = (
    <>
      {latestProgress ? <OfficeProgressBanner part={latestProgress} /> : null}
      {deliverables.map((child, idx) => (
        <FileAttachmentBlock
          key={`${child.path}-${child.name}-${idx}`}
          name={child.name}
          size={child.size}
          mimeType={child.mimeType}
          path={child.path}
          servedPath={child.servedPath}
          src={child.src}
        />
      ))}
    </>
  );

  const hasDeliverables = !!latestProgress || deliverables.length > 0;

  return (
    <ActivityCard
      title={title}
      status={status}
      durationMs={duration}
      stepCount={stepCount}
      badge={scenarioLabel && title !== scenarioLabel ? scenarioLabel : undefined}
      defaultCollapsed={defaultCollapsed}
      deliverables={hasDeliverables ? deliverableNodes : undefined}
    >
      {steps.map((child, idx) => {
        if (child.type === "office-progress") return null;
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
        if (child.type === "tool-batch") {
          return (
            <ToolBatchBlock
              key={`batch-${child.toolName}-${idx}`}
              toolName={child.toolName}
              count={child.count}
              children={child.children}
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
      {status === "failed" && error ? (
        <div className="px-2 py-1.5 text-xs text-red-400/90 whitespace-pre-wrap">{error}</div>
      ) : null}
    </ActivityCard>
  );
}

const WorkerBlock = memo(WorkerBlockInner);

export { WorkerBlock, ToolBatchBlock };
