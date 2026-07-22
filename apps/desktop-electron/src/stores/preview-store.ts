import { create } from "zustand";

export interface Preview {
  id: string;
  title: string;
  type: "html" | "svg" | "ppt" | "doc" | "pdf" | "xlsx";
  content: string;
  src?: string;
  filePath?: string;
  servedPath?: string;
  sourceMessageId: string;
}

const WIDTH_STORAGE_KEY = "hive.previewPanelWidth";
/** Previous shipped defaults — treat as "never customized" so we can widen. */
const LEGACY_DEFAULTS = new Set([640, 768]);
/** Default ~52rem — PPT needs readable width; user can drag. */
export const PREVIEW_WIDTH_DEFAULT = 832;
export const PREVIEW_WIDTH_MIN = 360;
export const PREVIEW_WIDTH_MAX_RATIO = 0.72;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (!raw) return PREVIEW_WIDTH_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return PREVIEW_WIDTH_DEFAULT;
    // Users who never dragged still have the old factory default
    if (LEGACY_DEFAULTS.has(n)) return PREVIEW_WIDTH_DEFAULT;
    return clampPreviewWidth(n);
  } catch {
    return PREVIEW_WIDTH_DEFAULT;
  }
}

export function clampPreviewWidth(px: number, stageWidth?: number): number {
  const maxByStage =
    stageWidth && stageWidth > 0
      ? Math.floor(stageWidth * PREVIEW_WIDTH_MAX_RATIO)
      : typeof window !== "undefined"
        ? Math.floor(window.innerWidth * PREVIEW_WIDTH_MAX_RATIO)
        : 960;
  const max = Math.max(PREVIEW_WIDTH_MIN, maxByStage);
  return Math.round(Math.min(max, Math.max(PREVIEW_WIDTH_MIN, px)));
}

interface PreviewState {
  previews: Preview[];
  activeId: string | null;
  isOpen: boolean;
  /** Sidebar width in CSS pixels (user-resizable). */
  panelWidthPx: number;

  addPreview: (p: Preview) => void;
  setActive: (id: string | null) => void;
  /** Upsert preview data without forcing the sidebar open (Codex-style on-demand). */
  upsertPreview: (preview: Preview) => void;
  /** Open sidebar and show this preview (user-initiated). */
  openFor: (preview: Preview) => void;
  close: () => void;
  clear: () => void;
  setPanelWidthPx: (px: number, stageWidth?: number) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previews: [],
  activeId: null,
  isOpen: false,
  panelWidthPx: typeof window !== "undefined" ? readStoredWidth() : PREVIEW_WIDTH_DEFAULT,

  addPreview: (p) =>
    set((state) => {
      // Deduplicate by id
      if (state.previews.some((x) => x.id === p.id)) return state;
      return { previews: [...state.previews, p] };
    }),

  setActive: (id) => set({ activeId: id }),

  upsertPreview: (preview) =>
    set((state) => {
      const idx = state.previews.findIndex((x) => x.id === preview.id);
      const previews =
        idx >= 0
          ? state.previews.map((p, i) => (i === idx ? { ...p, ...preview } : p))
          : [...state.previews, preview];

      // Keep sidebar state as-is; only refresh if user already has it open on this item
      if (state.isOpen && state.activeId === preview.id) {
        return { previews, activeId: preview.id, isOpen: true };
      }
      return { previews, activeId: state.activeId, isOpen: state.isOpen };
    }),

  openFor: (preview) =>
    set((state) => {
      const idx = state.previews.findIndex((x) => x.id === preview.id);
      if (idx >= 0) {
        const previews = [...state.previews];
        previews[idx] = { ...previews[idx], ...preview };
        return { previews, activeId: preview.id, isOpen: true };
      }
      return {
        previews: [...state.previews, preview],
        activeId: preview.id,
        isOpen: true,
      };
    }),

  close: () => set({ isOpen: false }),

  clear: () => set({ previews: [], activeId: null, isOpen: false }),

  setPanelWidthPx: (px, stageWidth) => {
    const next = clampPreviewWidth(px, stageWidth);
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(next));
    } catch {
      /* ignore quota / private mode */
    }
    set({ panelWidthPx: next });
  },
}));
