import { useEffect } from "react";
import { usePreviewStore } from "../../stores/preview-store";
import { PreviewCanvas } from "./PreviewCanvas";
import { X } from "lucide-react";

export function PreviewSidebar() {
  const { isOpen, previews, activeId, close, setActive } = usePreviewStore();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const activePreview = activeId
    ? previews.find((p) => p.id === activeId) ?? null
    : null;

  return (
    <div
      className={`
        overflow-hidden transition-all duration-300 ease-in-out
        ${isOpen ? "w-96 border-l border-stone-800" : "w-0 border-l-0"}
      `}
    >
      {/* Fixed-width inner container — slides in/out with wrapper */}
      <div className="w-96 h-full bg-stone-950 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-400">Preview</span>
            {activePreview && (
              <span className="text-[11px] text-stone-600 font-mono truncate max-w-[180px]">
                {activePreview.title}
              </span>
            )}
          </div>
          <button
            onClick={close}
            className="p-1 rounded-md text-stone-600 hover:text-stone-300 hover:bg-stone-800 transition-colors"
            title="Close preview (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview tabs (if multiple) */}
        {previews.length > 1 && (
          <div className="flex gap-1 px-3 py-1.5 border-b border-stone-800/60 overflow-x-auto shrink-0">
            {previews.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p.id)}
                className={`text-[10px] px-2 py-0.5 rounded-md font-mono whitespace-nowrap transition-colors ${
                  p.id === activeId
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-stone-500 hover:text-stone-300 border border-transparent"
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto">
          <PreviewCanvas preview={activePreview} />
        </div>
      </div>
    </div>
  );
}
