import { memo, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDurationMs } from "./activity-labels";

export type ThinkingCardProps = {
  text: string;
  isStreaming?: boolean;
};

function ThinkingCardInner({ text, isStreaming = false }: ThinkingCardProps) {
  const [expanded, setExpanded] = useState(isStreaming);
  const startedAtRef = useRef(Date.now());
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isStreaming) {
      startedAtRef.current = Date.now();
      setExpanded(true);
      setDurationMs(undefined);
      return;
    }
    setDurationMs(Date.now() - startedAtRef.current);
    const timer = window.setTimeout(() => setExpanded(false), 450);
    return () => window.clearTimeout(timer);
  }, [isStreaming]);

  if (!text) return null;

  const timeLabel = formatDurationMs(durationMs);
  const headerLabel = isStreaming ? "思考中" : timeLabel ? `已思考 · ${timeLabel}` : "已思考";

  return (
    <div className={`thinking-card ${isStreaming ? "thinking-card--streaming" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="thinking-card__header"
      >
        <span className="thinking-card__dot" aria-hidden />
        <span className="thinking-card__title">{headerLabel}</span>
        <ChevronRight
          className={`thinking-card__chevron w-4 h-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      <div
        className={`thinking-card__body grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "thinking-card__body--open" : ""}`}
      >
        <div className="thinking-card__body-inner">
          <pre className="thinking-card__text">{text}</pre>
        </div>
      </div>
    </div>
  );
}

export const ThinkingCard = memo(ThinkingCardInner);
