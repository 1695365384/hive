import { describe, it, expect } from "vitest";
import { preprocessFileLinks } from "./preprocess-file-links";

describe("preprocessFileLinks", () => {
  it("converts [File:] markers to localhost file URLs", () => {
    const input = "See [File: report.md] /workspace/out/report.md for details.";
    const output = preprocessFileLinks(input);
    expect(output).toBe(
      "See [report.md](http://127.0.0.1:4450/files/report.md) for details."
    );
  });

  it("leaves normal markdown unchanged", () => {
    const input = "[link](https://example.com)";
    expect(preprocessFileLinks(input)).toBe(input);
  });
});
