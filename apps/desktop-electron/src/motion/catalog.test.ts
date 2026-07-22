import { describe, expect, it } from "vitest";
import { MOTION_CATALOG, MOTION_IDS, isMotionId } from "./catalog";

describe("motion catalog", () => {
  it("lists stable shell presets", () => {
    expect(MOTION_IDS).toContain("worker-card-enter");
    expect(MOTION_IDS).toContain("activity-dock-enter");
    expect(MOTION_CATALOG).toHaveLength(MOTION_IDS.length);
  });

  it("every catalog entry id is allowlisted", () => {
    for (const entry of MOTION_CATALOG) {
      expect(isMotionId(entry.id)).toBe(true);
      expect(entry.scene.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown ids", () => {
    expect(isMotionId("explode-body")).toBe(false);
    expect(isMotionId("")).toBe(false);
  });
});
