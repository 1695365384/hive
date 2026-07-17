import { describe, expect, it } from "vitest";
import { filterProviders } from "./filter-providers";
import type { ProviderInfo } from "../../types/provider";

const providers: ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    defaultModel: "gpt-4o",
    modelCount: 10,
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    type: "openai",
    defaultModel: "deepseek",
    modelCount: 5,
  },
  {
    id: "alibaba",
    name: "Alibaba",
    type: "openai",
    defaultModel: "qwen",
    modelCount: 8,
  },
];

describe("filterProviders", () => {
  it("returns all when query empty", () => {
    expect(filterProviders(providers, "")).toHaveLength(3);
    expect(filterProviders(providers, "   ")).toHaveLength(3);
  });

  it("matches name case-insensitively", () => {
    const hit = filterProviders(providers, "opencode");
    expect(hit.map((p) => p.id)).toEqual(["opencode-zen"]);
  });

  it("matches id", () => {
    const hit = filterProviders(providers, "alibaba");
    expect(hit.map((p) => p.id)).toEqual(["alibaba"]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterProviders(providers, "zzz-nope")).toEqual([]);
  });
});
