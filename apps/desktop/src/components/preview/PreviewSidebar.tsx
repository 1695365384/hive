import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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

function previewTypeMeta(type: Preview["type"] | undefined, t: (key: string) => string) {
  switch (type) {
    case "ppt":
      return { label: t("preview.type.ppt"), icon: Presentation };
    case "doc":
      return { label: t("preview.type.doc"), icon: FileText };
    case "pdf":
      return { label: t("preview.type.pdf"), icon: FileText };
    case "xlsx":
      return { label: t("preview.type.xlsx"), icon: FileSpreadsheet };
    case "svg":
      return { label: t("preview.type.svg"), icon: FileImage };
    case "html":
      return { label: t("preview.type.html"), icon: FileCode };
    default:
      return { label: t("preview.title"), icon: FileText };
  }
}

export function PreviewSidebar({ isRunning }: { isRunning?: boolean }) {
  const { t } = useTranslation();
  const { isOpen, previews, activeId, close, setActive } = usePreviewStore();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Ask-user confirmation owns Esc while open
      if (document.querySelector(".ask-user")) return;
      close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const activePreview = activeId
    ? previews.find((p) => p.id === activeId) ?? null
    : null;

  const meta = previewTypeMeta(activePreview?.type, t);
  const TypeIcon = meta.icon;

  return (
    <aside
      className={`preview-sidebar ${isOpen ? "preview-sidebar--open" : ""}`}
      style={{ width: isOpen ? "var(--preview-width)" : 0 }}
      aria-hidden={!isOpen}
      aria-label={t("preview.documentPreview")}
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
            title={t("preview.close")}
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
