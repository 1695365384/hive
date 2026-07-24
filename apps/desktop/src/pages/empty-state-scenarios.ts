import type { TFunction } from "i18next";

export interface ScenarioSelection {
  prompt: string;
  guidance: string;
}

export function getEmptyStateScenarios(t: TFunction) {
  return [
    {
      id: "ppt",
      label: t("chat.emptyScenarios.ppt"),
      hint: t("chat.emptyScenarioHintPpt"),
      prompt: t("chat.emptyScenarioPromptPpt"),
      guidance: t("chat.emptyScenarioGuidancePpt"),
    },
    {
      id: "doc",
      label: t("chat.emptyScenarios.doc"),
      hint: t("chat.emptyScenarioHintDoc"),
      prompt: t("chat.emptyScenarioPromptDoc"),
      guidance: t("chat.emptyScenarioGuidanceDoc"),
    },
    {
      id: "meeting",
      label: t("chat.emptyScenarios.meeting"),
      hint: t("chat.emptyScenarioHintMeeting"),
      prompt: t("chat.emptyScenarioPromptMeeting"),
      guidance: t("chat.emptyScenarioGuidanceMeeting"),
    },
    {
      id: "data",
      label: t("chat.emptyScenarios.data"),
      hint: t("chat.emptyScenarioHintData"),
      prompt: t("chat.emptyScenarioPromptData"),
      guidance: t("chat.emptyScenarioGuidanceData"),
    },
  ] as const;
}
