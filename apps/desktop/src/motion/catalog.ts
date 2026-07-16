/**
 * Allowlisted shell motion presets (safe-as-data).
 * Agents / UI only pick an id — anime.js runs inside Desktop.
 */

export const MOTION_IDS = [
  "activity-dock-enter",
  "route-chip-enter",
  "worker-card-enter",
  "ask-user-options",
  "success-pulse",
] as const;

export type MotionId = (typeof MOTION_IDS)[number];

export type MotionCatalogEntry = {
  id: MotionId;
  /** When this usually fires in the product */
  scene: string;
  description: string;
};

export const MOTION_CATALOG: readonly MotionCatalogEntry[] = [
  {
    id: "activity-dock-enter",
    scene: "activity-dock show / phase working",
    description: "Status dock soft slide-up enter",
  },
  {
    id: "route-chip-enter",
    scene: "route / delegate chip appears",
    description: "Compact chip scale + fade enter",
  },
  {
    id: "worker-card-enter",
    scene: "worker-start / worker-lane mount",
    description: "Stagger worker lane cells into view",
  },
  {
    id: "ask-user-options",
    scene: "ask-user card shown",
    description: "Stagger option buttons",
  },
  {
    id: "success-pulse",
    scene: "worker-complete / celebration",
    description: "One-shot scale pulse on a card",
  },
] as const;

export function isMotionId(value: string): value is MotionId {
  return (MOTION_IDS as readonly string[]).includes(value);
}
