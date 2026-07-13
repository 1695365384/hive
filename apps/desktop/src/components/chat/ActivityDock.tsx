import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDurationMs } from "./activity-labels";
import { useThrottledElapsed } from "../../hooks/use-throttled-elapsed";
import { isDockVisible, useActivityStore } from "../../stores/activity-store";

function ActivityDockInner() {
  const { t } = useTranslation();
  const rollup = useActivityStore((s) => s.rollup);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const elapsed = useThrottledElapsed(
    rollup.phase === "working" || rollup.phase === "waiting" ? rollup.startedAt : undefined
  );

  const phaseLabel = (phase: "working" | "waiting" | "idle"): string => {
    if (phase === "waiting") return t("activity.waitingConfirm");
    if (phase === "idle") return t("activity.done");
    return t("activity.processing");
  };

  useEffect(() => {
    const show = isDockVisible(rollup);
    setVisible(show);
    if (show) {
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
  }, [rollup]);

  useEffect(() => {
    if (rollup.phase !== "idle" || !rollup.fadeIdleAt) return;
    const ms = rollup.fadeIdleAt - Date.now();
    if (ms <= 0) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(id);
  }, [rollup.phase, rollup.fadeIdleAt]);

  if (!visible) return null;

  const isIdleFade = rollup.phase === "idle";
  const phase = isIdleFade ? "idle" : rollup.phase;
  const prefix = phaseLabel(phase);
  const detail = isIdleFade
    ? rollup.lastCompleted?.label ?? rollup.title
    : rollup.detail;
  const timeLabel = elapsed != null ? formatDurationMs(elapsed) : null;
  const processingTitle = t("activity.processing");

  const line = [prefix, rollup.title !== processingTitle ? rollup.title : null, detail]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`activity-dock activity-dock--${phase} ${entered ? "activity-dock--entered" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`activity-dock__dot activity-dock__dot--${phase}`}
        aria-hidden
      />
      <span className="activity-dock__text">{line}</span>
      {timeLabel && rollup.phase !== "idle" && (
        <span className="activity-dock__time tabular-nums">{timeLabel}</span>
      )}
    </div>
  );
}

export const ActivityDock = memo(ActivityDockInner);
