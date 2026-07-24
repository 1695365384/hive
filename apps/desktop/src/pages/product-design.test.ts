import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { buildSettingsNavGroups } from "./settings-navigation";
import { getEmptyStateScenarios } from "./empty-state-scenarios";

const settingsLabels = {
  connection: "Model & connection",
  extensions: "Extensions",
  developer: "Developer",
  provider: "Provider",
  mcp: "MCP",
  skills: "Skills",
  plugins: "Plugins",
  motion: "Motion preview",
};

describe("product design navigation", () => {
  it("keeps developer-only motion controls out of production navigation", () => {
    const production = buildSettingsNavGroups(false, settingsLabels);
    const development = buildSettingsNavGroups(true, settingsLabels);

    expect(production.flatMap((group) => group.items.map((item) => item.id)))
      .toEqual(["config", "mcp", "skills", "plugins"]);
    expect(development.flatMap((group) => group.items.map((item) => item.id)))
      .toContain("motion");
  });
});

describe("empty-state scenarios", () => {
  it("returns localized prompts and guidance for every scenario", async () => {
    await i18n.changeLanguage("zh-CN");
    const scenarios = getEmptyStateScenarios(i18n.t.bind(i18n));

    expect(scenarios).toHaveLength(4);
    expect(scenarios.map((scenario) => scenario.id))
      .toEqual(["ppt", "doc", "meeting", "data"]);
    expect(scenarios.every((scenario) => scenario.prompt.length > 0)).toBe(true);
    expect(scenarios.every((scenario) => scenario.guidance.startsWith("建议补充"))).toBe(true);
  });
});
