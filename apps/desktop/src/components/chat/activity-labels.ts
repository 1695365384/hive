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

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function looksLikeOfficeWork(text: string): boolean {
  return /officecli|\.pptx|\.docx|\.xlsx|powerpoint|presentation|幻灯|演示|文稿|ppt\b/i.test(
    text,
  );
}

function officeLabelFromText(text: string): string {
  if (/\.docx|word|文档/i.test(text) && !/\.pptx|ppt|演示|幻灯/i.test(text)) {
    return i18n.t("activity.tool.officeDoc");
  }
  if (/\.xlsx|excel|表格/i.test(text) && !/\.pptx|ppt|演示|幻灯/i.test(text)) {
    return i18n.t("activity.tool.officeSheet");
  }
  return i18n.t("activity.tool.officePpt");
}

export function formatToolLabel(toolName: string, args: unknown): string {
  const name = toolName.toLowerCase();
  const obj = argRecord(args);

  if (name === "ask_user" || name === "ask-user" || name === "askuser") {
    const question = firstString(obj.question, obj.prompt, obj.message, obj.text);
    return question
      ? i18n.t("activity.tool.askUserWith", { question: truncate(question, 42) })
      : i18n.t("activity.tool.askUser");
  }

  if (name === "bash" || name === "shell" || name === "codeshell") {
    const command = firstString(obj.command);
    if (looksLikeOfficeWork(command)) {
      return officeLabelFromText(command);
    }
    // General users don't need raw shell lines — keep detail collapsed in step body.
    return i18n.t("activity.tool.bash");
  }

  if (name === "read" || name === "file") {
    const path = firstString(obj.file_path, obj.path, obj.filePath);
    const file = basename(path);
    if (file && looksLikeOfficeWork(file)) {
      return i18n.t("activity.tool.readOfficeWith", { file });
    }
    return file
      ? i18n.t("activity.tool.readFileWith", { file })
      : i18n.t("activity.tool.readFile");
  }

  if (name === "grep" || name === "glob") {
    const pattern = firstString(obj.pattern);
    return pattern
      ? i18n.t("activity.tool.grepWith", { pattern: truncate(pattern, 40) })
      : i18n.t("activity.tool.grep");
  }

  if (name === "send-file" || name === "send_file") {
    const path = firstString(obj.filePath, obj.file_path, obj.path);
    const file = basename(path);
    return file
      ? i18n.t("activity.tool.sendFileWith", { file })
      : i18n.t("activity.tool.sendFile");
  }

  if (name === "officecli" || name.includes("officecli") || name.includes("office-pptx") || name.includes("office_pptx")) {
    const command = firstString(
      obj.command,
      Array.isArray(obj.command)
        ? obj.command.filter((p): p is string => typeof p === "string").join(" ")
        : "",
      obj.path,
      obj.file,
    );
    return officeLabelFromText(command || name);
  }

  if (name.startsWith("mcp_") || name.startsWith("mcp-") || name.includes("mcp")) {
    if (looksLikeOfficeWork(name) || looksLikeOfficeWork(JSON.stringify(obj))) {
      return officeLabelFromText(`${name} ${JSON.stringify(obj)}`);
    }
    return i18n.t("activity.tool.helper");
  }

  if (name === "agent") {
    const type = firstString(obj.type);
    const description = firstString(obj.description, obj.prompt, obj.task);
    const keys: Record<string, string> = {
      office: "activity.tool.agentOffice",
      explore: "activity.tool.agentExplore",
      plan: "activity.tool.agentPlan",
      general: "activity.tool.agentGeneral",
      schedule: "activity.tool.agentSchedule",
      librarian: "activity.tool.agentLibrarian",
      metis: "activity.tool.agentMetis",
      momus: "activity.tool.agentMomus",
      oracle: "activity.tool.agentOracle",
    };
    const base = i18n.t(keys[type] ?? "activity.tool.agentDefault");
    if (type === "office" && description && looksLikeOfficeWork(description)) {
      return officeLabelFromText(description);
    }
    return base;
  }

  if (name === "web" || name === "webfetch" || name === "web-fetch") {
    return i18n.t("activity.tool.web");
  }

  if (name === "task-stop" || name === "task_stop" || name === "send-message" || name === "send_message") {
    return i18n.t("activity.tool.coordinate");
  }

  // Never leak raw tool ids like ask_user / mcp_foo to the timeline.
  if (/^[a-z0-9_.:-]+$/i.test(toolName) && toolName.includes("_")) {
    return i18n.t("activity.tool.generic");
  }

  return toolName;
}

export { formatDurationMs };

export function formatElapsedSince(startedAt: number | undefined): string | null {
  if (!startedAt) return null;
  return formatDurationMs(Date.now() - startedAt);
}
