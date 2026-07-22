// Regression: ISSUE-002 — sessions/messages wiped on Vite preview reload
// Found by /qa on 2026-07-16
// Report: .gstack/qa-reports/qa-report-localhost-1420-2026-07-16.md

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserCreateSession,
  browserListMessages,
  browserListSessions,
  browserReset,
} from "./browser-db";
import * as db from "./db";

function stubLocalStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  });
  return map;
}

describe("browser-db reload persistence (ISSUE-002)", () => {
  let map: Map<string, string>;

  beforeEach(() => {
    map = stubLocalStorage();
    browserReset();
  });

  it("create + list roundtrip", () => {
    browserCreateSession("x", "X");
    expect(browserListSessions()).toHaveLength(1);
    expect(browserListMessages("x")).toHaveLength(0);
  });

  it("db.createSession/listMessages survive localStorage-only restore", async () => {
    await db.createSession("s-reload", "Office research");
    await db.insertMessage(
      "m1",
      "s-reload",
      "user",
      JSON.stringify([{ type: "text", text: "hello" }]),
      1000
    );

    expect(map.size).toBeGreaterThan(0);
    const raw = map.get("hive.browser-db.v1");
    expect(raw).toBeTruthy();

    // Simulate reload: wipe memory + localStorage stub, then restore LS payload
    browserReset();
    map.set("hive.browser-db.v1", raw!);

    const sessions = await db.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s-reload");
    expect(sessions[0].title).toBe("Office research");

    const messages = await db.listMessages("s-reload");
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("m1");
  });

  it("renameSession updates title in browser store", async () => {
    await db.createSession("a", "A");
    await db.renameSession("a", "A-updated");
    const list = await db.listSessions();
    expect(list.find((s) => s.id === "a")?.title).toBe("A-updated");
  });
});
