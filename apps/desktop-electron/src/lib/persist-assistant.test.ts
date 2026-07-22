import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPersistAssistant,
  persistAssistantNow,
  schedulePersistAssistant,
} from "./persist-assistant";
import type { ContentPart } from "../types/chat";

vi.mock("./db", () => ({
  updateMessageContent: vi.fn(() => Promise.resolve()),
}));

import * as db from "./db";

const text = (t: string): ContentPart[] => [{ type: "text", text: t }];

describe("persist-assistant debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(db.updateMessageContent).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid updates into one write", () => {
    schedulePersistAssistant("m1", text("a"));
    schedulePersistAssistant("m1", text("ab"));
    schedulePersistAssistant("m1", text("abc"));
    expect(db.updateMessageContent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1499);
    expect(db.updateMessageContent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(db.updateMessageContent).toHaveBeenCalledTimes(1);
    expect(db.updateMessageContent).toHaveBeenCalledWith("m1", JSON.stringify(text("abc")));
  });

  it("flush writes immediately and cancels pending timer", () => {
    schedulePersistAssistant("m1", text("x"));
    flushPersistAssistant("m1");
    expect(db.updateMessageContent).toHaveBeenCalledTimes(1);
    expect(db.updateMessageContent).toHaveBeenCalledWith("m1", JSON.stringify(text("x")));

    vi.advanceTimersByTime(2000);
    expect(db.updateMessageContent).toHaveBeenCalledTimes(1);
  });

  it("persistAssistantNow bypasses debounce", () => {
    schedulePersistAssistant("m1", text("pending"));
    persistAssistantNow("m1", text("final"));
    expect(db.updateMessageContent).toHaveBeenCalledTimes(1);
    expect(db.updateMessageContent).toHaveBeenCalledWith("m1", JSON.stringify(text("final")));

    vi.advanceTimersByTime(2000);
    expect(db.updateMessageContent).toHaveBeenCalledTimes(1);
  });
});
