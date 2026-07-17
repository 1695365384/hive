import { describe, expect, it } from "vitest";
import { getProviderBrand } from "./provider-brand";

describe("getProviderBrand", () => {
  it("maps known vendors to distinct accents", () => {
    expect(getProviderBrand("openai").accent).toBe("#10A37F");
    expect(getProviderBrand("anthropic").accent).toBe("#D97757");
    expect(getProviderBrand("deepseek").accent).toBe("#4D6BFE");
    expect(getProviderBrand("alibaba-cn").accent).toBe("#FF6A00");
    expect(getProviderBrand("moonshotai").accent).toBe("#7C3AED");
    expect(getProviderBrand("opencode-zen").accent).toBe("#059669");
  });

  it("is stable for unknown ids", () => {
    const a = getProviderBrand("totally-unknown-vendor-xyz");
    const b = getProviderBrand("totally-unknown-vendor-xyz");
    expect(a).toEqual(b);
    expect(a.accent).toMatch(/^#/);
  });
});
