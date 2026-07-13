import i18n from "../../i18n";
import { formatDurationMs } from "../../lib/i18n-format";

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
    return line
      ? i18n.t("activity.tool.bashWith", { line: truncate(line) })
      : i18n.t("activity.tool.bash");
  }

  if (name === "read" || name === "file") {
    const path =
      typeof obj.file_path === "string"
        ? obj.file_path
        : typeof obj.path === "string"
          ? obj.path
          : "";
    const file = basename(path);
    return file
      ? i18n.t("activity.tool.readFileWith", { file })
      : i18n.t("activity.tool.readFile");
  }

  if (name === "grep" || name === "glob") {
    const pattern = typeof obj.pattern === "string" ? obj.pattern : "";
    return pattern
      ? i18n.t("activity.tool.grepWith", { pattern: truncate(pattern, 40) })
      : i18n.t("activity.tool.grep");
  }

  if (name === "send-file") {
    const path = typeof obj.filePath === "string" ? obj.filePath : "";
    const file = basename(path);
    return file
      ? i18n.t("activity.tool.sendFileWith", { file })
      : i18n.t("activity.tool.sendFile");
  }

  if (name === "agent") {
    const type = typeof obj.type === "string" ? obj.type : "";
    const keys: Record<string, string> = {
      office: "activity.tool.agentOffice",
      explore: "activity.tool.agentExplore",
      plan: "activity.tool.agentPlan",
      general: "activity.tool.agentGeneral",
      schedule: "activity.tool.agentSchedule",
    };
    return i18n.t(keys[type] ?? "activity.tool.agentDefault");
  }

  if (name === "web" || name === "webfetch") {
    return i18n.t("activity.tool.web");
  }

  return toolName;
}

export { formatDurationMs };

export function formatElapsedSince(startedAt: number | undefined): string | null {
  if (!startedAt) return null;
  return formatDurationMs(Date.now() - startedAt);
}
