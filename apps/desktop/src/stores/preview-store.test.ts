import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampPreviewWidth,
  PREVIEW_WIDTH_DEFAULT,
  PREVIEW_WIDTH_MIN,
  usePreviewStore,
} from "./preview-store";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
});

describe("clampPreviewWidth", () => {
  it("clamps to min/max by stage", () => {
    expect(clampPreviewWidth(100, 1000)).toBe(PREVIEW_WIDTH_MIN);
    expect(clampPreviewWidth(900, 1000)).toBe(720);
    expect(clampPreviewWidth(500, 1000)).toBe(500);
  });
});

describe("usePreviewStore panel width", () => {
  beforeEach(() => {
    memory.clear();
    // Clear persisted width so default bump is not masked by old localStorage
    usePreviewStore.setState({ panelWidthPx: PREVIEW_WIDTH_DEFAULT });
  });

  it("persists resized width", () => {
    usePreviewStore.getState().setPanelWidthPx(700, 1200);
    expect(usePreviewStore.getState().panelWidthPx).toBe(700);
    expect(memory.get("hive.previewPanelWidth")).toBe("700");
  });
});
