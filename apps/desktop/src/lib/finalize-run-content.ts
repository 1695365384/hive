import type { ContentPart } from "../types/chat";

export type FinalizeRunOptions = {
  cancelled?: boolean;
  success?: boolean;
  error?: string;
};

/**
 * Close out in-flight tool rows / workers so the chat UI cannot keep spinning
 * after a turn ends (or after we reload a stale persisted snapshot).
 */
export function finalizeRunContent(
  content: ContentPart[],
  opts: FinalizeRunOptions = {},
): ContentPart[] {
  const cancelled = !!opts.cancelled;
  const failed = opts.success === false || cancelled;
  const endLabel = cancelled
    ? "已取消"
    : failed
      ? opts.error?.slice(0, 200) || "未完成"
      : "已结束";

  const startedWorkers = new Map<
    string,
    { workerId: string; workerType: string }
  >();
  const completedWorkers = new Set<string>();

  const next = content.map((part) => {
    if (part.type === "worker-start") {
      startedWorkers.set(part.workerId, {
        workerId: part.workerId,
        workerType: part.workerType,
      });
      return part;
    }
    if (part.type === "worker-complete") {
      completedWorkers.add(part.workerId);
      return part;
    }
    if (part.type === "tool-call" && part.result === undefined) {
      const startedAt = part.startedAt;
      return {
        ...part,
        result: endLabel,
        isError: failed,
        durationMs:
          part.durationMs ??
          (startedAt != null ? Math.max(0, Date.now() - startedAt) : undefined),
      };
    }
    return part;
  });

  for (const [workerId, meta] of startedWorkers) {
    if (completedWorkers.has(workerId)) continue;
    next.push({
      type: "worker-complete",
      workerId,
      workerType: meta.workerType,
      success: !failed,
      error: failed ? endLabel : undefined,
      duration: 0,
    });
  }

  return next;
}

/** True when content still has open tools/workers that would spin in the UI. */
export function hasOpenRunParts(content: ContentPart[]): boolean {
  const started = new Set<string>();
  const completed = new Set<string>();
  for (const part of content) {
    if (part.type === "worker-start") started.add(part.workerId);
    if (part.type === "worker-complete") completed.add(part.workerId);
    if (part.type === "tool-call" && part.result === undefined) return true;
  }
  for (const id of started) {
    if (!completed.has(id)) return true;
  }
  return false;
}
