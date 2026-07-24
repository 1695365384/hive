// Regression: ISSUE-001 — createSession throws / no-op in browser without SQLite
// Found by /qa on 2026-07-16
// Report: .gstack/qa-reports/qa-report-localhost-1420-2026-07-16.md

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db", () => ({
  listSessions: vi.fn(async () => {
    throw new Error("SQLite not available in browser mode");
  }),
  createSession: vi.fn(async () => {
    throw new Error("SQLite not available in browser mode");
  }),
  deleteSession: vi.fn(async () => {
    throw new Error("SQLite not available in browser mode");
  }),
  renameSession: vi.fn(async () => {
    throw new Error("SQLite not available in browser mode");
  }),
}));

import { useSessionStore } from "./session-store";
import i18n from "../i18n";

describe("session-store browser memory fallback", () => {
  beforeEach(async () => {
    useSessionStore.setState({
      sessions: [],
      currentId: null,
      loading: true,
      available: false,
      error: null,
    });
    await useSessionStore.getState().init();
  });

  it("marks SQLite unavailable without crashing init", () => {
    const state = useSessionStore.getState();
    expect(state.available).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.sessions).toEqual([]);
  });

  it("createSession keeps an in-memory session for chat send", async () => {
    await i18n.changeLanguage("zh-CN");
    const id = await useSessionStore.getState().createSession();
    const state = useSessionStore.getState();
    expect(id).toBeTruthy();
    expect(state.currentId).toBe(id);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe(id);
    expect(state.sessions[0].title).toBe("新对话");
    expect(state.error).toBeNull();
  });

  it("uses the active locale for new session titles", async () => {
    await i18n.changeLanguage("en");
    const id = await useSessionStore.getState().createSession();
    expect(useSessionStore.getState().sessions.find((session) => session.id === id)?.title)
      .toBe("New Chat");
  });

  it("renameSession and deleteSession work without SQLite", async () => {
    const id = await useSessionStore.getState().createSession();
    await useSessionStore.getState().renameSession(id, "竞品调研 PPT");
    expect(useSessionStore.getState().sessions[0].title).toBe("竞品调研 PPT");

    await useSessionStore.getState().deleteSession(id);
    expect(useSessionStore.getState().sessions).toHaveLength(0);
    expect(useSessionStore.getState().currentId).toBeNull();
  });
});
