import { animate, stagger, type JSAnimation } from "animejs";
import { prefersReducedMotion } from "./reduced-motion";

type AnimHandle = JSAnimation;

function settleVisible(el: HTMLElement) {
  el.style.opacity = "1";
  el.style.transform = "none";
}

/** Snap to final visible state without animation (reduced motion / missing el). */
export function snapEnter(el: HTMLElement | null) {
  if (!el) return;
  settleVisible(el);
}

/**
 * Soft slide-up enter — ActivityDock / banners.
 * Starts from opacity 0 + translateY(10px).
 */
export function playEnterUp(el: HTMLElement | null, opts?: { duration?: number }): AnimHandle | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    snapEnter(el);
    return null;
  }
  el.style.opacity = "0";
  el.style.transform = "translateY(10px)";
  return animate(el, {
    opacity: [0, 1],
    y: [10, 0],
    duration: opts?.duration ?? 420,
    ease: "out(3)",
  });
}

/** Compact chip / route mark enter with slight scale. */
export function playEnterChip(el: HTMLElement | null): AnimHandle | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    snapEnter(el);
    return null;
  }
  el.style.opacity = "0";
  el.style.transform = "translateY(6px) scale(0.96)";
  return animate(el, {
    opacity: [0, 1],
    y: [6, 0],
    scale: [0.96, 1],
    duration: 380,
    ease: "out(3)",
  });
}

/** Stagger children (e.g. worker lane cells) into view. */
export function playStaggerEnter(
  container: HTMLElement | null,
  childSelector = ":scope > *",
): AnimHandle | null {
  if (!container) return null;
  const kids = Array.from(container.querySelectorAll<HTMLElement>(childSelector));
  if (kids.length === 0) return null;
  if (prefersReducedMotion()) {
    kids.forEach(snapEnter);
    return null;
  }
  for (const kid of kids) {
    kid.style.opacity = "0";
    kid.style.transform = "translateY(14px)";
  }
  return animate(kids, {
    opacity: [0, 1],
    y: [14, 0],
    duration: 480,
    ease: "out(3)",
    delay: stagger(55),
  });
}

/** Ask-user option buttons: staggered pop-in. */
export function playStaggerOptions(els: HTMLElement[]): AnimHandle | null {
  if (els.length === 0) return null;
  if (prefersReducedMotion()) {
    els.forEach(snapEnter);
    return null;
  }
  for (const el of els) {
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
  }
  return animate(els, {
    opacity: [0, 1],
    y: [12, 0],
    duration: 400,
    ease: "out(3)",
    delay: stagger(70),
  });
}

/** One-shot success pulse on a card header / dock. */
export function playSuccessPulse(el: HTMLElement | null): AnimHandle | null {
  if (!el) return null;
  if (prefersReducedMotion()) return null;
  return animate(el, {
    scale: [1, 1.04, 1],
    duration: 520,
    ease: "inOut(2)",
  });
}
