import i18n from "../../i18n";

const WORKER_TYPE_KEYS: Record<string, string> = {
  office: "activity.worker.office",
  explore: "activity.worker.explore",
  plan: "activity.worker.plan",
  general: "activity.worker.general",
  schedule: "activity.worker.schedule",
};

const SCENARIO_KEYS: Record<string, string> = {
  "office-document": "activity.worker.scenarioOffice",
  "recurring-task": "activity.worker.scenarioRecurring",
};

/** Desktop scenario labels — must stay in sync with core routing labels (same keys, translated values). */
export function getDesktopScenarioLabels(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SCENARIO_KEYS).map(([id, key]) => [id, i18n.t(key)])
  );
}

export function formatScenarioLabel(scenarioId: string | undefined): string | undefined {
  if (!scenarioId) return undefined;
  const key = SCENARIO_KEYS[scenarioId];
  return key ? i18n.t(key) : scenarioId;
}

export function formatWorkerTitle(
  workerType: string,
  description?: string,
  scenarioId?: string
): string {
  const trimmed = description?.trim();
  if (trimmed) return trimmed;
  const scenario = formatScenarioLabel(scenarioId);
  if (scenario) return scenario;
  const key = WORKER_TYPE_KEYS[workerType];
  return key ? i18n.t(key) : workerType;
}
