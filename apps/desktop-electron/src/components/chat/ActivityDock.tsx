import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDurationMs } from "./activity-labels";
import { useThrottledElapsed } from "../../hooks/use-throttled-elapsed";
import { playMotion } from "../../motion";
import { isDockVisible, useActivityStore, type ActivityPhase } from "../../stores/activity-store";

function dockPrefix(phase: ActivityPhase, t: ReturnType<typeof useTranslation>["t"]): string {
  switch (phase) {
    case "waiting": return t("activity.waitingConfirm");
    case "completed": return t("activity.done");
    case "idle": return t("activity.done");
    default: return t("activity.processing");
  }
}

function ActivityDockInner() {
  const { t } = useTranslation();
  const rollup = useActivityStore((s) => s.rollup);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const elapsed = useThrottledElapsed(
    rollup.phase === "working" || rollup.phase === "waiting" ? rollup.startedAt : undefined,
  );

  useEffect(() => {
    const show = isDockVisible(rollup);
    setVisible(show);
  }, [rollup]);

  useEffect(() => {
    if (!visible) return;
    playMotion("activity-dock-enter", rootRef.current);
  }, [visible]);

  // Auto-hide after fadeIdleAt for completed/idle phases
  useEffect(() => {
    if (rollup.phase !== "completed" && rollup.phase !== "idle") return;
    if (!rollup.fadeIdleAt) return;
    const ms = rollup.fadeIdleAt - Date.now();
    if (ms <= 0) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(id);
  }, [rollup.phase, rollup.fadeIdleAt]);

  if (!visible) return null;

  const phase = rollup.phase;
  const prefix = dockPrefix(phase, t);
  const processingTitle = t("activity.processing");

  // Build the display line
  let line: string;
  if (phase === "completed" || phase === "idle") {
    // "已完成 · 演示文稿已生成"
    line = [prefix, rollup.lastCompleted?.label ?? rollup.title]
      .filter(Boolean)
      .join(" · ");
  } else if (phase === "waiting") {
    line = [prefix, rollup.detail].filter(Boolean).join(" · ");
  } else {
    // working: "处理中 · 文档助手正在制作演示文稿"
    // If detail matches lastCompleted, use detail (it's the latest activity)
    const titlePart = rollup.title !== processingTitle ? rollup.title : null;
    const detailPart = rollup.detail;
    line = [prefix, titlePart, detailPart].filter(Boolean).join(" · ");
  }

  const timeLabel = elapsed != null && (phase === "working" || phase === "waiting")
    ? formatDurationMs(elapsed)
    : null;

  return (
    <div
      ref={rootRef}
      className={`activity-dock activity-dock--${phase === "completed" ? "idle" : phase} activity-dock--anime`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`activity-dock__dot activity-dock__dot--${phase === "completed" ? "idle" : phase}`}
        aria-hidden
      />
      <span className="activity-dock__text">{line}</span>
      {timeLabel && (
        <span className="activity-dock__time tabular-nums">{timeLabel}</span>
      )}
    </div>
  );
}

export const ActivityDock = memo(ActivityDockInner);
