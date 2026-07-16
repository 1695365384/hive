import { memo } from "react";
import { useTranslation } from "react-i18next";
import { formatScenarioLabel, formatWorkerTitle } from "./worker-labels";

export type RouteMode = "direct" | "inquiry" | "delegate" | "hint";

export type RouteChipProps = {
  mode: RouteMode;
  scenarioId?: string;
  workerType?: string;
  workerTypes?: string[];
  title?: string;
};

function RouteChipInner({ mode, scenarioId, workerType, workerTypes, title }: RouteChipProps) {
  const { t } = useTranslation();

  const scenario = formatScenarioLabel(scenarioId);
  const types = workerTypes?.length ? workerTypes : workerType ? [workerType] : [];
  const worker =
    types.length > 1
      ? types.map((wt) => formatWorkerTitle(wt, undefined, scenarioId)).join(" ∥ ")
      : types.length === 1
        ? formatWorkerTitle(types[0]!, undefined, scenarioId)
        : undefined;

  let label: string;
  switch (mode) {
    case "inquiry":
      label = t("activity.route.inquiry", {
        scenario: scenario ?? title ?? t("activity.route.genericScenario"),
      });
      break;
    case "delegate":
      label =
        types.length > 1
          ? t("activity.route.delegateParallel", {
              workers: worker ?? title ?? t("activity.route.genericWorker"),
              count: types.length,
            })
          : t("activity.route.delegate", {
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
