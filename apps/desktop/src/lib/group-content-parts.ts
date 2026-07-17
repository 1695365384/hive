import type { ContentPart } from "../types/chat";
import type { GroupedContent } from "../components/chat/types";

export function groupContentParts(parts: ContentPart[]): GroupedContent[] {
  const result: GroupedContent[] = [];
  const activeWorkers = new Map<string, GroupedContent & { type: "worker" }>();

  for (const part of parts) {
    if (part.type === "route") {
      result.push({
        type: "route",
        mode: part.mode,
        scenarioId: part.scenarioId,
        workerType: part.workerType,
        workerTypes: part.workerTypes,
        title: part.title,
      });
    } else if (part.type === "worker-start") {
      const group: GroupedContent & { type: "worker" } = {
        type: "worker",
        workerId: part.workerId,
        workerType: part.workerType,
        description: part.description,
        scenarioId: part.scenarioId,
        children: [],
        status: "running",
      };
      activeWorkers.set(part.workerId, group);
      result.push(group);
    } else if (part.type === "office-progress") {
      const next = {
        type: "office-progress" as const,
        phase: part.phase,
        slide: part.slide,
        slideTotal: part.slideTotal,
        message: part.message,
        workerId: part.workerId,
      };
      // Prefer nesting into the office worker so the transcript stays one card
      const nestTarget =
        (part.workerId ? activeWorkers.get(part.workerId) : undefined) ??
        [...activeWorkers.values()].find(
          (w) => w.workerType === "office" && w.status === "running",
        );
      if (nestTarget) {
        const kids = nestTarget.children;
        let lastProgressIdx = -1;
        for (let i = kids.length - 1; i >= 0; i--) {
          if (kids[i]?.type === "office-progress") {
            lastProgressIdx = i;
            break;
          }
        }
        if (lastProgressIdx >= 0) {
          kids[lastProgressIdx] = next;
        } else {
          kids.push(next);
        }
      } else {
        const last = result[result.length - 1];
        if (last?.type === "office-progress") {
          result[result.length - 1] = next;
        } else {
          result.push(next);
        }
      }
    } else if (part.type === "worker-complete") {
      const group = activeWorkers.get(part.workerId);
      if (group) {
        group.status = part.success ? "completed" : "failed";
        group.duration = part.duration;
        group.error = part.error;
        // Keep in map so late tool-call parts with this workerId still nest
      }
    } else if (part.type === "tool-call") {
      const wid = "workerId" in part ? (part as { workerId?: string }).workerId : undefined;
      const group = wid ? activeWorkers.get(wid) : undefined;
      if (group) {
        group.children.push(part as GroupedContent);
      } else {
        result.push(part as GroupedContent);
      }
    } else if (part.type === "reasoning") {
      const wid = "workerId" in part ? (part as { workerId?: string }).workerId : undefined;
      if (wid) {
        const group = activeWorkers.get(wid);
        if (group) {
          group.children.push(part as GroupedContent);
        }
      }
    } else {
      result.push(part as GroupedContent);
    }
  }

  return groupWorkerLanes(
    compactTopLevelOfficeFlood(
      groupImageGalleries(dedupeTopLevelFileAttachments(mergeToolBatches(mergeReasoning(result)))),
    ),
  );
}

/** ≥2 consecutive workers → side-by-side collaboration lane */
function groupWorkerLanes(items: GroupedContent[]): GroupedContent[] {
  const out: GroupedContent[] = [];
  let run: Array<GroupedContent & { type: "worker" }> = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push(run[0]!);
    } else {
      out.push({
        type: "worker-lane",
        workers: [...run],
        runningCount: run.filter((w) => w.status === "running").length,
      });
    }
    run = [];
  };

  for (const item of items) {
    if (item.type === "worker") {
      run.push(item);
    } else {
      flush();
      out.push(item);
    }
  }
  flush();
  return out;
}

function isImageAttachment(item: GroupedContent): item is GroupedContent & {
  type: "file-attachment";
  mimeType: string;
} {
  return item.type === "file-attachment" && !!item.mimeType?.startsWith("image/");
}

/** Consecutive screenshot/image attachments → horizontal strip */
function groupImageGalleries(items: GroupedContent[]): GroupedContent[] {
  const out: GroupedContent[] = [];
  let images: Array<{
    name: string;
    size: number;
    mimeType: string;
    path: string;
    servedPath?: string;
    src?: string;
  }> = [];

  const flushImages = () => {
    if (images.length === 0) return;
    if (images.length === 1) {
      out.push({ type: "file-attachment", ...images[0] });
    } else {
      out.push({ type: "image-gallery", images: [...images] });
    }
    images = [];
  };

  for (const item of items) {
    if (isImageAttachment(item)) {
      images.push({
        name: item.name,
        size: item.size,
        mimeType: item.mimeType,
        path: item.path,
        servedPath: item.servedPath,
        src: item.src,
      });
    } else {
      flushImages();
      if (item.type === "worker") {
        const worker = item as GroupedContent & { type: "worker"; children: GroupedContent[] };
        out.push({ ...worker, children: groupImageGalleries(worker.children) });
      } else {
        out.push(item);
      }
    }
  }
  flushImages();
  return out;
}

function fileAttachmentKey(part: { path: string; name: string }): string {
  return part.path || part.name;
}

function dedupeFileAttachments(files: GroupedContent[]): GroupedContent[] {
  const byKey = new Map<string, GroupedContent>();
  for (const file of files) {
    if (file.type !== "file-attachment") continue;
    byKey.set(fileAttachmentKey(file), file);
  }
  return Array.from(byKey.values());
}

/** Collapse consecutive duplicate file rows at top level (e.g. live Office updates). */
function dedupeTopLevelFileAttachments(items: GroupedContent[]): GroupedContent[] {
  const out: GroupedContent[] = [];
  let fileRun: GroupedContent[] = [];

  const flushFiles = () => {
    if (fileRun.length === 0) return;
    out.push(...dedupeFileAttachments(fileRun));
    fileRun = [];
  };

  for (const item of items) {
    if (item.type === "file-attachment") {
      fileRun.push(item);
    } else {
      flushFiles();
      out.push(item);
    }
  }
  flushFiles();

  return out;
}

function mergeReasoning(items: GroupedContent[]): GroupedContent[] {
  const merged: GroupedContent[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (item.type === "reasoning" && last?.type === "reasoning") {
      (last as { text: string }).text += (item as { text: string }).text;
    } else if (item.type === "worker") {
      const worker = item as GroupedContent & { type: "worker"; children: GroupedContent[] };
      merged.push({ ...worker, children: mergeReasoning(worker.children) });
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function mergeToolBatches(items: GroupedContent[]): GroupedContent[] {
  const merged: GroupedContent[] = [];
  let batch: GroupedContent[] = [];
  let batchKey: string | null = null;
  let pendingProgress: GroupedContent | null = null;

  const emitProgress = () => {
    if (!pendingProgress) return;
    merged.push(pendingProgress);
    pendingProgress = null;
  };

  const flushBatch = () => {
    if (batch.length === 0) return;
    emitProgress();
    if (batch.length === 1) {
      merged.push(batch[0]!);
    } else {
      const first = batch[0] as { type: "tool-call"; toolName: string };
      const key = batchKey ?? first.toolName;
      merged.push({
        type: "tool-batch",
        toolName:
          key === "file-ops" ? "file-ops" : key === "office-ops" ? "office-ops" : first.toolName,
        count: batch.length,
        children: batch,
      });
    }
    batch = [];
    batchKey = null;
  };

  for (const item of items) {
    if (item.type === "tool-call") {
      const tc = item as { type: "tool-call"; toolName: string; args?: unknown };
      const key = toolBatchKey(tc.toolName, tc.args);
      if (batch.length > 0 && batchKey === key) {
        batch.push(item);
      } else {
        flushBatch();
        batch.push(item);
        batchKey = key;
      }
    } else if (item.type === "office-progress") {
      // Don't shatter officecli rows — keep latest progress for the batch header
      pendingProgress = item;
    } else if (item.type === "reasoning" && batch.length > 0 && batchKey === "file-ops") {
      // Don't break file-op batches on interleaved model "thinking" inside explore
      continue;
    } else {
      flushBatch();
      emitProgress();
      if (item.type === "worker") {
        const worker = item as GroupedContent & { type: "worker"; children: GroupedContent[] };
        merged.push({
          ...worker,
          children: compactWorkerProcess(mergeToolBatches(worker.children), worker.workerType),
        });
      } else {
        merged.push(item);
      }
    }
  }
  flushBatch();
  emitProgress();

  return merged;
}

/** Read/Glob/Grep/File share one batch so explore doesn't emit one row per file. */
function toolBatchKey(toolName: string, args?: unknown): string {
  const name = toolName.toLowerCase();
  if (
    name === "read" ||
    name === "file" ||
    name === "glob" ||
    name === "grep" ||
    name === "list_dir" ||
    name === "listdir"
  ) {
    return "file-ops";
  }
  if (name.includes("officecli") || name === "office") return "office-ops";
  if ((name === "bash" || name === "shell") && isOfficeArgs(args)) return "office-ops";
  return name;
}

function isOfficeArgs(args: unknown): boolean {
  try {
    return /officecli|\.pptx|powerpoint/i.test(JSON.stringify(args ?? ""));
  } catch {
    return false;
  }
}

function isOfficeToolCall(item: GroupedContent): item is GroupedContent & { type: "tool-call" } {
  if (item.type !== "tool-call") return false;
  const name = item.toolName.toLowerCase();
  if (name.includes("office")) return true;
  if (name === "bash" || name === "shell") return isOfficeArgs(item.args);
  return isOfficeArgs(item.args);
}

function isOfficeNoisePart(item: GroupedContent): boolean {
  if (item.type === "office-progress") return true;
  if (item.type === "tool-batch") {
    return item.toolName === "office-ops" || /officecli/i.test(item.toolName);
  }
  return isOfficeToolCall(item);
}

/**
 * Historical transcripts often stored officecli steps as flat top-level tool rows
 * (no workerId). Fold those floods into one collapsed Office card.
 */
function compactTopLevelOfficeFlood(items: GroupedContent[]): GroupedContent[] {
  const out: GroupedContent[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i]!;
    if (!isOfficeNoisePart(head)) {
      out.push(head);
      i += 1;
      continue;
    }

    let progress: GroupedContent | null = null;
    const tools: GroupedContent[] = [];
    let j = i;
    while (j < items.length && isOfficeNoisePart(items[j]!)) {
      const it = items[j]!;
      if (it.type === "office-progress") {
        progress = it;
      } else if (it.type === "tool-batch") {
        tools.push(...it.children);
      } else if (it.type === "tool-call") {
        tools.push(it);
      }
      j += 1;
    }

    if (tools.length >= 2 || (tools.length >= 1 && progress)) {
      const children: GroupedContent[] = [];
      if (progress) children.push(progress);
      if (tools.length === 1) {
        children.push(tools[0]!);
      } else {
        children.push({
          type: "tool-batch",
          toolName: "office-ops",
          count: tools.length,
          children: tools,
        });
      }
      out.push({
        type: "worker",
        workerId: `office-compact-${i}`,
        workerType: "office",
        children,
        status: "completed",
      });
    } else {
      for (let k = i; k < j; k++) out.push(items[k]!);
    }
    i = j;
  }
  return out;
}

/**
 * Explore/plan/office flood the transcript with low-level tool rows —
 * fold into one collapsed batch when noisy enough.
 */
function compactWorkerProcess(
  children: GroupedContent[],
  workerType: string
): GroupedContent[] {
  const noisy =
    workerType === "explore" || workerType === "plan" || workerType === "office";
  if (!noisy) return children;

  const batchName =
    workerType === "office" ? "office-ops" : "file-ops";

  const tools: GroupedContent[] = [];
  const rest: GroupedContent[] = [];
  for (const child of children) {
    if (child.type === "tool-call") {
      tools.push(child);
    } else if (child.type === "tool-batch") {
      tools.push(...child.children);
    } else if (child.type === "reasoning") {
      // Keep if this worker has no ops yet; otherwise hide thinking behind the strip
      if (tools.length === 0) rest.push(child);
    } else {
      rest.push(child);
    }
  }

  // Second pass: if we collected tools, drop any reasoning that was kept first
  const nonReasoningRest = tools.length >= 2
    ? rest.filter((c) => c.type !== "reasoning")
    : rest;

  if (tools.length < 2) {
    return [...tools, ...nonReasoningRest];
  }

  // Keep office-progress banners ahead of the collapsed ops strip
  const progress = nonReasoningRest.filter((c) => c.type === "office-progress");
  const otherRest = nonReasoningRest.filter((c) => c.type !== "office-progress");

  return [
    ...progress,
    {
      type: "tool-batch",
      toolName: batchName,
      count: tools.length,
      children: tools,
    },
    ...otherRest,
  ];
}
