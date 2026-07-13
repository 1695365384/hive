import type { ContentPart } from "../types/chat";
import type { GroupedContent } from "../components/chat/types";

export function groupContentParts(parts: ContentPart[]): GroupedContent[] {
  const result: GroupedContent[] = [];
  const activeWorkers = new Map<string, GroupedContent & { type: "worker" }>();

  for (const part of parts) {
    if (part.type === "worker-start") {
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
        activeWorkers.delete(part.workerId);
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

  return dedupeTopLevelFileAttachments(attachDeliverablesToWorkers(mergeToolBatches(mergeReasoning(result))));
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

/** Move consecutive deliverables after a worker into that worker card (deduped). */
function attachDeliverablesToWorkers(items: GroupedContent[]): GroupedContent[] {
  const out: GroupedContent[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (item.type !== "worker") {
      out.push(item);
      i++;
      continue;
    }

    const files: GroupedContent[] = [];
    let j = i + 1;
    while (j < items.length && items[j].type === "file-attachment") {
      files.push(items[j]);
      j++;
    }

    if (files.length > 0) {
      const deduped = dedupeFileAttachments(files);
      out.push({
        ...item,
        children: [...item.children, ...deduped],
      });
      i = j;
    } else {
      out.push(item);
      i++;
    }
  }

  return out;
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

  const flushBatch = () => {
    if (batch.length === 0) return;
    if (batch.length === 1) {
      merged.push(batch[0]);
    } else {
      const first = batch[0] as { type: "tool-call"; toolName: string };
      merged.push({
        type: "tool-batch",
        toolName: first.toolName,
        count: batch.length,
        children: batch,
      });
    }
    batch = [];
  };

  for (const item of items) {
    if (item.type === "tool-call") {
      const tc = item as { type: "tool-call"; toolName: string };
      if (
        batch.length > 0 &&
        (batch[0] as { type: "tool-call"; toolName: string }).toolName === tc.toolName
      ) {
        batch.push(item);
      } else {
        flushBatch();
        batch.push(item);
      }
    } else {
      flushBatch();
      if (item.type === "worker") {
        const worker = item as GroupedContent & { type: "worker"; children: GroupedContent[] };
        merged.push({ ...worker, children: mergeToolBatches(worker.children) });
      } else {
        merged.push(item);
      }
    }
  }
  flushBatch();

  return merged;
}
