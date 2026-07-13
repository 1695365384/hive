import { create } from "zustand";

export interface Preview {
  id: string;
  title: string;
  type: "html" | "svg" | "ppt" | "doc" | "pdf" | "xlsx";
  content: string;
  src?: string; // URL to fetch (for file-based types like pptx)
  sourceMessageId: string;
}

interface PreviewState {
  previews: Preview[];
  activeId: string | null;
  isOpen: boolean;

  addPreview: (p: Preview) => void;
  setActive: (id: string | null) => void;
  openFor: (preview: Preview) => void;
  close: () => void;
  clear: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previews: [],
  activeId: null,
  isOpen: false,

  addPreview: (p) =>
    set((state) => {
      // Deduplicate by id
      if (state.previews.some((x) => x.id === p.id)) return state;
      return { previews: [...state.previews, p] };
    }),

  setActive: (id) => set({ activeId: id }),

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
}));
