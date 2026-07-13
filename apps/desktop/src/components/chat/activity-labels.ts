/** Human-readable tool labels (hide raw tool names from users). */

function argRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function truncate(text: string, max = 56): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatToolLabel(toolName: string, args: unknown): string {
  const name = toolName.toLowerCase();
  const obj = argRecord(args);

  if (name === "bash" || name === "shell") {
    const command = typeof obj.command === "string" ? obj.command : "";
    const line = command.split("\n").find((l) => l.trim())?.trim() ?? "";
    return line ? `运行命令 · ${truncate(line)}` : "运行命令";
  }

  if (name === "read" || name === "file") {
    const path =
      typeof obj.file_path === "string"
        ? obj.file_path
        : typeof obj.path === "string"
          ? obj.path
          : "";
    const file = basename(path);
    return file ? `读取文件 · ${file}` : "读取文件";
  }

  if (name === "grep" || name === "glob") {
    const pattern = typeof obj.pattern === "string" ? obj.pattern : "";
    return pattern ? `搜索代码 · ${truncate(pattern, 40)}` : "搜索代码";
  }

  if (name === "send-file") {
    const path = typeof obj.filePath === "string" ? obj.filePath : "";
    const file = basename(path);
    return file ? `发送文件 · ${file}` : "发送文件";
  }

  if (name === "agent") {
    const type = typeof obj.type === "string" ? obj.type : "";
    const labels: Record<string, string> = {
      office: "委派 Office 文档任务",
      explore: "委派探索任务",
      plan: "委派规划任务",
      general: "委派执行任务",
      schedule: "委派定时任务",
    };
    return labels[type] ?? "委派子任务";
  }

  if (name === "web" || name === "webfetch") {
    return "获取网页内容";
  }

  return toolName;
}

export function formatDurationMs(ms: number | undefined): string | null {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatElapsedSince(startedAt: number | undefined): string | null {
  if (!startedAt) return null;
  return formatDurationMs(Date.now() - startedAt);
}
