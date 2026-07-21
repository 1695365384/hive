import { create } from "zustand";
import i18n from "../i18n";

export type ActivityPhase = "idle" | "working" | "waiting" | "completed";

export type ActivityRollup = {
  phase: ActivityPhase;
  title: string;
  detail?: string;
  startedAt?: number;
  lastCompleted?: { label: string; at: number };
  /** ms timestamp when idle/completed dock should hide */
  fadeIdleAt?: number;
};

const IDLE_ROLLUP: ActivityRollup = {
  phase: "idle",
  title: "",
};

type ActivityState = {
  rollup: ActivityRollup;
  runStartedAt: number | null;
  beginRun: () => void;
  setWorking: (opts?: { title?: string; detail?: string; startedAt?: number }) => void;
  setWaiting: (detail: string) => void;
  setCompleted: (label?: string) => void;
  setLastCompleted: (label: string) => void;
  clearWaiting: () => void;
  setIdle: () => void;
  reset: () => void;
};

/** waiting > working > idle > completed — priority ordering for phase transitions */
export function pickPhase(current: ActivityPhase, next: ActivityPhase): ActivityPhase {
  const rank: Record<ActivityPhase, number> = { waiting: 4, working: 3, completed: 2, idle: 1 };
  return rank[next] >= rank[current] ? next : current;
}

export function isDockVisible(rollup: ActivityRollup, now = Date.now()): boolean {
  if (rollup.phase === "working" || rollup.phase === "waiting" || rollup.phase === "completed") return true;
  if (rollup.fadeIdleAt != null && now < rollup.fadeIdleAt) return true;
  return false;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  rollup: IDLE_ROLLUP,
  runStartedAt: null,

  beginRun: () =>
    set({
      runStartedAt: Date.now(),
      rollup: {
        phase: "working",
        title: i18n.t("activity.processing"),
        startedAt: Date.now(),
      },
    }),

  setWorking: (opts) =>
    set((state) => {
      if (state.rollup.phase === "waiting") {
        return {
          rollup: {
            ...state.rollup,
            title: opts?.title ?? state.rollup.title,
            detail: opts?.detail ?? state.rollup.detail,
            startedAt: opts?.startedAt ?? state.rollup.startedAt ?? state.runStartedAt ?? Date.now(),
            fadeIdleAt: undefined,
          },
        };
      }
      return {
        rollup: {
          phase: "working",
          title: opts?.title ?? state.rollup.title ?? i18n.t("activity.processing"),
          detail: opts?.detail,
          startedAt: opts?.startedAt ?? state.rollup.startedAt ?? state.runStartedAt ?? Date.now(),
          lastCompleted: state.rollup.lastCompleted,
          fadeIdleAt: undefined,
        },
      };
    }),

  setWaiting: (detail) =>
    set((state) => ({
      rollup: {
        ...state.rollup,
        phase: "waiting",
        title: i18n.t("activity.waitingConfirm"),
        detail,
        fadeIdleAt: undefined,
      },
    })),

  /** Brief "just finished" state → auto-transitions to idle after 2.5s */
  setCompleted: (label) =>
    set((state) => ({
      runStartedAt: null,
      rollup: {
        phase: "completed",
        title: label ?? state.rollup.lastCompleted?.label ?? i18n.t("activity.done"),
        detail: undefined,
        startedAt: undefined,
        lastCompleted: state.rollup.lastCompleted,
        fadeIdleAt: Date.now() + 2500,
      },
    })),

  setLastCompleted: (label) =>
    set((state) => ({
      rollup: {
        ...state.rollup,
        detail: label,
        lastCompleted: { label, at: Date.now() },
      },
    })),

  clearWaiting: () => {
    const { rollup } = get();
    if (rollup.phase !== "waiting") return;
    set({
      rollup: {
        ...rollup,
        phase: "working",
        detail: undefined,
      },
    });
  },

  setIdle: () =>
    set((state) => ({
      runStartedAt: null,
      rollup: {
        phase: "idle",
        title: state.rollup.title,
        detail: undefined,
        startedAt: undefined,
        lastCompleted: state.rollup.lastCompleted,
        fadeIdleAt: Date.now() + 3000,
      },
    })),

  reset: () =>
    set({
      rollup: IDLE_ROLLUP,
      runStartedAt: null,
    }),
}));
