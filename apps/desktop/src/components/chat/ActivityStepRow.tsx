import { memo, useState } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { formatDurationMs } from "./activity-labels";

export type ActivityStepStatus = "running" | "done" | "error";

export type ActivityStepRowProps = {
  label: string;
  status: ActivityStepStatus;
  durationMs?: number;
  liveElapsedMs?: number;
  detail?: string;
  nested?: boolean;
};

function ActivityStepRowInner({
  label,
  status,
  durationMs,
  liveElapsedMs,
  detail,
  nested,
}: ActivityStepRowProps) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(detail);
  const timeLabel =
    status === "running" && liveElapsedMs != null
      ? formatDurationMs(liveElapsedMs)
      : formatDurationMs(durationMs);

  return (
    <div className={nested ? "activity-step activity-step--nested" : "activity-step"}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={`activity-step__row ${hasDetail ? "activity-step__row--clickable" : ""}`}
      >
        <span className="activity-step__icon" aria-hidden>
          {status === "running" && (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}
          {status === "done" && <Check className="w-3.5 h-3.5 text-emerald-400/90" />}
          {status === "error" && <X className="w-3.5 h-3.5 text-red-400/90" />}
        </span>
        <span className="activity-step__label">{label}</span>
        {timeLabel && <span className="activity-step__time tabular-nums">{timeLabel}</span>}
        {hasDetail && (
          <ChevronRight
            className={`activity-step__chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {open && detail && (
        <div className="activity-step__detail">{detail}</div>
      )}
    </div>
  );
}

export const ActivityStepRow = memo(ActivityStepRowInner);
