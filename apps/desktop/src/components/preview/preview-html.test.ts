import { describe, expect, it } from "vitest";
import { enhanceOfficePreviewHtml } from "./preview-html";
import { existsSync, readFileSync } from "node:fs";

describe("enhanceOfficePreviewHtml", () => {
  it("injects embed class, CSS, patched scale logic, and resize script", () => {
    const html = "<!DOCTYPE html><html><head></head><body><script>const fill = headless && slides.length === 1;</script></body></html>";
    const out = enhanceOfficePreviewHtml(html);
    expect(out).toContain('class="hive-embed"');
    expect(out).toContain("hive-embed");
    expect(out).toContain('document.documentElement.classList.contains("hive-embed") ? false');
    expect(out).toContain("maxSlideW");
    expect(out).toContain("flex-direction: row !important");
    expect(out).toContain("scroll-snap-type: x mandatory");
    expect(out).toContain("__hivePreviewHeight");
    expect(out).toContain("avail.h > 0");
    expect(out).toContain("transformOrigin = \"center center\"");
    expect(out.indexOf("hive-preview-patch")).toBeLessThan(out.indexOf("</head>"));
    expect(out.indexOf("hive-preview-patch-js")).toBeGreaterThan(out.indexOf("</body>") === -1 ? 0 : out.lastIndexOf("<script"));
  });

  it("patches real officecli HTML when fixture exists", () => {
    const fixture = "/tmp/hive-preview-test.html";
    if (!existsSync(fixture)) return;
    const raw = readFileSync(fixture, "utf-8");
    const out = enhanceOfficePreviewHtml(raw);
    expect(out).toContain('class="hive-embed"');
    expect(out).toContain("window.__hivePreviewWidth");
    expect(out).not.toContain("const fill = headless && slides.length === 1;");
  });
});
