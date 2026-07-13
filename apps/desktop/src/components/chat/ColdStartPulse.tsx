import { useTranslation } from "react-i18next";

export function ColdStartPulse() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-1 py-2" role="status" aria-label={t("activity.thinking")}>
      <span className="activity-pulse-dot" aria-hidden />
      <span className="text-xs text-stone-500">{t("activity.thinkingEllipsis")}</span>
    </div>
  );
}
