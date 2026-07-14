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

  return groupImageGalleries(dedupeTopLevelFileAttachments(mergeToolBatches(mergeReasoning(result))));
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

  const flushBatch = () => {
    if (batch.length === 0) return;
    if (batch.length === 1) {
      merged.push(batch[0]);
    } else {
      const first = batch[0] as { type: "tool-call"; toolName: string };
      const key = batchKey ?? first.toolName;
      merged.push({
        type: "tool-batch",
        toolName: key === "file-ops" ? "file-ops" : first.toolName,
        count: batch.length,
        children: batch,
      });
    }
    batch = [];
    batchKey = null;
  };

  for (const item of items) {
    if (item.type === "tool-call") {
      const tc = item as { type: "tool-call"; toolName: string };
      const key = toolBatchKey(tc.toolName);
      if (batch.length > 0 && batchKey === key) {
        batch.push(item);
      } else {
        flushBatch();
        batch.push(item);
        batchKey = key;
      }
    } else if (item.type === "reasoning" && batch.length > 0 && batchKey === "file-ops") {
      // Don't break file-op batches on interleaved model "thinking" inside explore
      continue;
    } else {
      flushBatch();
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

  return merged;
}

/** Read/Glob/Grep/File share one batch so explore doesn't emit one row per file. */
function toolBatchKey(toolName: string): string {
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
  return name;
}

/**
 * Explore/plan often interleave many different tools — fold the whole process
 * into one collapsed batch when noisy enough.
 */
function compactWorkerProcess(
  children: GroupedContent[],
  workerType: string
): GroupedContent[] {
  const noisy = workerType === "explore" || workerType === "plan";
  if (!noisy) return children;

  const tools: GroupedContent[] = [];
  const rest: GroupedContent[] = [];
  for (const child of children) {
    if (child.type === "tool-call") {
      tools.push(child);
    } else if (child.type === "tool-batch") {
      tools.push(...child.children);
    } else if (child.type === "reasoning") {
      // Keep if this worker has no file ops; otherwise hide thinking behind the strip
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

  return [
    {
      type: "tool-batch",
      toolName: "file-ops",
      count: tools.length,
      children: tools,
    },
    ...nonReasoningRest,
  ];
}
