/** ContentPart — one segment of a chat message */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; workerId?: string; workerType?: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown; result?: unknown; isError?: boolean; workerId?: string; startedAt?: number; durationMs?: number }
  | {
      type: "route";
      mode: "direct" | "inquiry" | "delegate" | "hint";
      scenarioId?: string;
      workerType?: string;
      workerTypes?: string[];
      title?: string;
    }
  | { type: "skill"; name: string; description?: string }
  | { type: "worker-start"; workerId: string; workerType: string; description?: string; scenarioId?: string }
  | { type: "worker-complete"; workerId: string; workerType: string; success: boolean; error?: string; duration?: number }
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
  | { type: "file-attachment"; name: string; size: number; mimeType: string; path: string; servedPath?: string; src?: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: ContentPart[];
  createdAt: number;
}

/** Session record */
export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
