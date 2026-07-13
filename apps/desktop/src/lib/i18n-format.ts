import i18n from "../i18n";

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return i18n.t("time.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18n.t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t("time.daysAgo", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return i18n.t("time.weeksAgo", { count: weeks });
  return new Date(ts).toLocaleDateString(i18n.language === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export function formatDurationMs(ms: number | undefined): string | null {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return i18n.t("time.durationMs", { ms });
  return i18n.t("time.durationSec", { s: (ms / 1000).toFixed(1) });
}

export function revealInFolderLabel(): string {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return i18n.t("file.revealFinder");
  if (p.includes("win")) return i18n.t("file.revealExplorer");
  return i18n.t("file.revealFolder");
}
