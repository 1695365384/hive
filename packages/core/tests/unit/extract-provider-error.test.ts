import { describe, expect, it } from "vitest";
import { extractProviderErrorMessage } from "../../src/agents/runtime/LLMRuntime.js";

describe("extractProviderErrorMessage", () => {
  it("unwraps AI SDK data.error.message", () => {
    const err = Object.assign(new Error("No output generated. Check the stream for errors."), {
      data: { error: { message: "Insufficient balance" } },
      statusCode: 402,
    });
    expect(extractProviderErrorMessage(err)).toBe("[402] Insufficient balance");
  });

  it("prefers cause over generic No output generated", () => {
    const cause = Object.assign(new Error("No output generated. Check the stream for errors."), {
      cause: Object.assign(new Error("wrapped"), {
        data: { error: { message: "model not found" } },
        statusCode: 404,
      }),
    });
    expect(extractProviderErrorMessage(cause)).toBe("[404] model not found");
  });

  it("handles empty object abort reasons", () => {
    expect(extractProviderErrorMessage({})).toMatch(/empty error/i);
  });

  it("parses responseBody JSON", () => {
    const err = Object.assign(new Error("No output generated."), {
      responseBody: JSON.stringify({ error: { message: "rate limited" } }),
      statusCode: 429,
    });
    expect(extractProviderErrorMessage(err)).toBe("[429] rate limited");
  });
});
