import { useEffect } from "react";
import {
  FileText,
  Presentation,
  FileSpreadsheet,
  FileImage,
  FileCode,
  PanelRightClose,
} from "lucide-react";
import { usePreviewStore, type Preview } from "../../stores/preview-store";
import { PreviewCanvas } from "./PreviewCanvas";

function previewTypeMeta(type: Preview["type"] | undefined) {
  switch (type) {
    case "ppt":
      return { label: "演示文稿", icon: Presentation };
    case "doc":
      return { label: "文档", icon: FileText };
    case "pdf":
      return { label: "PDF", icon: FileText };
    case "xlsx":
      return { label: "表格", icon: FileSpreadsheet };
    case "svg":
      return { label: "SVG", icon: FileImage };
    case "html":
      return { label: "HTML", icon: FileCode };
    default:
      return { label: "预览", icon: FileText };
  }
}

export function PreviewSidebar({ isRunning }: { isRunning?: boolean }) {
  const { isOpen, previews, activeId, close, setActive } = usePreviewStore();

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

  const meta = previewTypeMeta(activePreview?.type);
  const TypeIcon = meta.icon;

  return (
    <aside
      className={`preview-sidebar ${isOpen ? "preview-sidebar--open" : ""}`}
      style={{ width: isOpen ? "var(--preview-width)" : 0 }}
      aria-hidden={!isOpen}
      aria-label="文档预览"
    >
      <div className="preview-sidebar__inner">
        <header className="preview-sidebar__header">
          <div className="preview-sidebar__title-row">
            <span className="preview-sidebar__type-badge" aria-hidden>
              <TypeIcon className="w-3.5 h-3.5" />
              <span>{meta.label}</span>
            </span>
            {activePreview && (
              <h2 className="preview-sidebar__filename" title={activePreview.title}>
                {activePreview.title}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="preview-sidebar__close app-no-drag"
            title="关闭预览 (Esc)"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </header>

        {previews.length > 1 && (
          <div className="preview-sidebar__tabs" role="tablist">
            {previews.map((p) => {
              const active = p.id === activeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActive(p.id)}
                  className={`preview-sidebar__tab ${active ? "preview-sidebar__tab--active" : ""}`}
                  title={p.title}
                >
                  {p.title}
                </button>
              );
            })}
          </div>
        )}

        <div className="preview-sidebar__stage">
          <div className="preview-sidebar__canvas">
            {isOpen ? (
              <PreviewCanvas preview={activePreview} isRunning={isRunning} />
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
