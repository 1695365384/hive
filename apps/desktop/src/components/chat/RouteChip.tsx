import { memo } from "react";
import { useTranslation } from "react-i18next";
import { formatScenarioLabel, formatWorkerTitle } from "./worker-labels";

export type RouteMode = "direct" | "inquiry" | "delegate" | "hint";

export type RouteChipProps = {
  mode: RouteMode;
  scenarioId?: string;
  workerType?: string;
  title?: string;
};

function RouteChipInner({ mode, scenarioId, workerType, title }: RouteChipProps) {
  const { t } = useTranslation();

  const scenario = formatScenarioLabel(scenarioId);
  const worker =
    workerType != null
      ? formatWorkerTitle(workerType, undefined, scenarioId)
      : undefined;

  let label: string;
  switch (mode) {
    case "inquiry":
      label = t("activity.route.inquiry", {
        scenario: scenario ?? title ?? t("activity.route.genericScenario"),
      });
      break;
    case "delegate":
      label = t("activity.route.delegate", {
        worker: worker ?? title ?? t("activity.route.genericWorker"),
      });
      break;
    case "hint":
      label = t("activity.route.hint", {
        scenario: scenario ?? t("activity.route.genericScenario"),
      });
      break;
    default:
      label = t("activity.route.direct");
  }

  return (
    <div
      className={`route-chip route-chip--${mode}`}
      role="status"
      aria-label={label}
    >
      <span className="route-chip__mark" aria-hidden />
      <span className="route-chip__text">{label}</span>
    </div>
  );
}

export const RouteChip = memo(RouteChipInner);
