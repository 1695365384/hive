import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Check, X } from "lucide-react";
import { formatDurationMs } from "./activity-labels";

export type ActivityCardProps = {
  title: string;
  status: "running" | "completed" | "failed";
  durationMs?: number;
  stepCount?: number;
  badge?: string;
  /** Codex-like: keep body collapsed even while running (explore/plan file floods). */
  defaultCollapsed?: boolean;
  deliverables?: ReactNode;
  children: ReactNode;
};

function ActivityCardInner({
  title,
  status,
  durationMs,
  stepCount,
  badge,
  defaultCollapsed = false,
  deliverables,
  children,
}: ActivityCardProps) {
  const { t } = useTranslation();
  const isRunning = status === "running";
  // Expand while working unless this worker type prefers a compact strip
  const [expanded, setExpanded] = useState(isRunning && !defaultCollapsed);
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (userToggledRef.current) return;
    if (defaultCollapsed || !isRunning) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
  }, [isRunning, status, defaultCollapsed]);

  const timeLabel = formatDurationMs(durationMs);
  const summary =
    stepCount != null && stepCount > 0 ? t("activity.steps", { count: stepCount }) : null;

  return (
    <div
      className={`activity-card ${isRunning ? "activity-card--running" : ""} ${status === "failed" ? "activity-card--failed" : ""}`}
    >
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setExpanded(!expanded);
        }}
        className="activity-card__header"
      >
        <span className="activity-card__status-icon" aria-hidden>
          {isRunning && <span className="activity-card__pulse-dot" />}
          {status === "completed" && <Check className="w-4 h-4 text-emerald-400/90" />}
          {status === "failed" && <X className="w-4 h-4 text-red-400/90" />}
        </span>
        <span className="activity-card__title">{title}</span>
        {badge && <span className="activity-card__badge">{badge}</span>}
        {summary && <span className="activity-card__meta">{summary}</span>}
        {timeLabel && <span className="activity-card__time tabular-nums">{timeLabel}</span>}
        <ChevronRight
          className={`activity-card__chevron w-4 h-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {deliverables ? (
        <div className="activity-card__deliverables">{deliverables}</div>
      ) : null}
      <div
        className={`activity-card__body grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "activity-card__body--open" : ""}`}
      >
        <div className="activity-card__body-inner">{children}</div>
      </div>
    </div>
  );
}

export const ActivityCard = memo(ActivityCardInner);
