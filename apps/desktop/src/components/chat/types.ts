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
    }
  | { type: "tool-batch"; toolName: string; count: number; children: GroupedContent[] }
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
      type: "file-attachment";
      name: string;
      size: number;
      mimeType: string;
      path: string;
      src?: string;
    };
