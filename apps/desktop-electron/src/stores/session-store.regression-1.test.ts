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
    const id = await useSessionStore.getState().createSession();
    const state = useSessionStore.getState();
    expect(id).toBeTruthy();
    expect(state.currentId).toBe(id);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe(id);
    expect(state.error).toBeNull();
  });

  it("createSession reuses the current empty chat (ISSUE-003)", async () => {
    const id1 = await useSessionStore.getState().createSession();
    const id2 = await useSessionStore.getState().createSession();
    expect(id2).toBe(id1);
    expect(useSessionStore.getState().sessions).toHaveLength(1);
  });

  it("createSession prunes orphan empty chats when leaving a filled one", async () => {
    const emptyA = await useSessionStore.getState().createSession();
    // Simulate first message arriving on emptyA
    useSessionStore.setState((s) => ({
      sessions: s.sessions.map((session) =>
        session.id === emptyA ? { ...session, messageCount: 2, title: "Filled" } : session,
      ),
    }));
    // Manually leave an orphan empty (pre-fix pile-up)
    const orphanId = crypto.randomUUID();
    useSessionStore.setState((s) => ({
      sessions: [
        {
          id: orphanId,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0,
        },
        ...s.sessions,
      ],
    }));

    const id = await useSessionStore.getState().createSession();
    const state = useSessionStore.getState();
    expect(id).not.toBe(emptyA);
    expect(id).not.toBe(orphanId);
    expect(state.sessions).toHaveLength(2); // new empty + filled
    expect(state.sessions.every((s) => s.id !== orphanId)).toBe(true);
    expect(state.sessions.filter((s) => s.messageCount === 0)).toHaveLength(1);
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
