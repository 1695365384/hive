import type { MotionId } from "./catalog";
import { isMotionId } from "./catalog";
import {
  playEnterChip,
  playEnterUp,
  playStaggerEnter,
  playStaggerOptions,
  playSuccessPulse,
  snapEnter,
} from "./presets";

export type MotionTarget = HTMLElement | HTMLElement[] | null;

export type PlayMotionOptions = {
  /** For worker-card-enter: child selector inside container */
  childSelector?: string;
  duration?: number;
};

/**
 * Run a catalog motion. Unknown ids are ignored (no throw).
 */
export function playMotion(
  id: string,
  target: MotionTarget,
  opts?: PlayMotionOptions,
): void {
  if (!isMotionId(id)) {
    return;
  }
  runPreset(id, target, opts);
}

function runPreset(id: MotionId, target: MotionTarget, opts?: PlayMotionOptions): void {
  switch (id) {
    case "activity-dock-enter": {
      const el = single(target);
      playEnterUp(el, { duration: opts?.duration });
      return;
    }
    case "route-chip-enter": {
      playEnterChip(single(target));
      return;
    }
    case "worker-card-enter": {
      const el = single(target);
      playStaggerEnter(el, opts?.childSelector ?? ":scope > .worker-lane__cell");
      return;
    }
    case "ask-user-options": {
      const els = many(target);
      if (els.length === 1 && els[0]!.matches?.(".ask-user__options, [role=listbox]")) {
        playStaggerOptions(
          Array.from(els[0]!.querySelectorAll<HTMLElement>(".ask-user__option")),
        );
        return;
      }
      playStaggerOptions(els);
      return;
    }
    case "success-pulse": {
      playSuccessPulse(single(target));
      return;
    }
    default: {
      const _exhaustive: never = id;
      void _exhaustive;
    }
  }
}

/** Instant settle — used when reducing motion or cleaning up. */
export function snapMotionTarget(target: MotionTarget): void {
  for (const el of many(target)) snapEnter(el);
}

function single(target: MotionTarget): HTMLElement | null {
  if (!target) return null;
  return Array.isArray(target) ? (target[0] ?? null) : target;
}

function many(target: MotionTarget): HTMLElement[] {
  if (!target) return [];
  return Array.isArray(target) ? target.filter(Boolean) : [target];
}
