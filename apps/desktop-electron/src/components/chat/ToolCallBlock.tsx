import { memo, useEffect, useState } from "react";
import { ActivityStepRow } from "./ActivityStepRow";
import { formatToolLabel } from "./activity-labels";

export type ToolCallBlockProps = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  elapsedSeconds?: number | null;
  workerId?: string;
  startedAt?: number;
  durationMs?: number;
  nested?: boolean;
};

function formatResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function ToolCallBlockInner({
  toolName,
  args,
  result,
  isError,
  startedAt,
  durationMs,
  nested = false,
}: ToolCallBlockProps) {
  const isRunning = result === undefined;
  const status = isRunning ? "running" : isError ? "error" : "done";
  const label = formatToolLabel(toolName, args);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning || !startedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [isRunning, startedAt]);

  const liveElapsedMs = isRunning && startedAt ? Date.now() - startedAt : undefined;
  const resolvedDurationMs =
    durationMs ?? (!isRunning && startedAt ? Date.now() - startedAt : undefined);

  const detail = !isRunning ? formatResult(result) : undefined;

  return (
    <ActivityStepRow
      label={label}
      status={status}
      durationMs={!isRunning ? resolvedDurationMs : undefined}
      liveElapsedMs={liveElapsedMs}
      detail={detail || undefined}
      nested={nested}
    />
  );
}

export const ToolCallBlock = memo(ToolCallBlockInner);
