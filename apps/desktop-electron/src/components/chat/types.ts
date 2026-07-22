export type GroupedContent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; workerId?: string; workerType?: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: unknown;
      result?: unknown;
      isError?: boolean;
      workerId?: string;
      startedAt?: number;
      durationMs?: number;
    }
  | { type: "tool-batch"; toolName: string; count: number; children: GroupedContent[] }
  | {
      type: "route";
      mode: "direct" | "inquiry" | "delegate" | "hint";
      scenarioId?: string;
      workerType?: string;
      workerTypes?: string[];
      title?: string;
    }
  | { type: "skill"; name: string; description?: string }
  | {
      type: "worker";
      workerId: string;
      workerType: string;
      description?: string;
      scenarioId?: string;
      children: GroupedContent[];
      status: "running" | "completed" | "failed";
      duration?: number;
      error?: string;
    }
  | {
      type: "worker-lane";
      workers: Array<GroupedContent & { type: "worker" }>;
      runningCount: number;
    }
  | {
      type: "office-progress";
      phase: "routed" | "creating" | "adding_slide" | "validating" | "delivering" | "blocked";
      slide?: number;
      slideTotal?: number;
      message?: string;
      workerId?: string;
    }
  | {
      type: "task-progress";
      phase: "understand" | "plan" | "execute" | "verify" | "continue" | "blocked" | "done";
      message?: string;
      reasons?: string[];
      actions?: Array<{ id: "continue" | "cancel" | "provide-info"; label: string }>;
      attempt?: number;
      maxAttempts?: number;
    }
  | { type: "heartbeat"; message?: string; silentMs?: number }
  | {
      type: "file-attachment";
      name: string;
      size: number;
      mimeType: string;
      path: string;
      servedPath?: string;
      src?: string;
    }
  | {
      type: "image-gallery";
      images: Array<{
        name: string;
        size: number;
        mimeType: string;
        path: string;
        servedPath?: string;
        src?: string;
      }>;
    };
