import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Presentation, FileSpreadsheet } from "lucide-react";
import { ArtifactFileMenu } from "./ArtifactFileMenu";
import { encodeFilesUrl, resolveArtifactPreviewSrc } from "../../lib/artifact-file";
import { isPreviewableFile, type PreviewFileType } from "../preview/detect-preview";
import { usePreviewStore } from "../../stores/preview-store";

type FileAttachmentBlockProps = {
  name: string;
  size: number;
  mimeType: string;
  path: string;
  servedPath?: string;
  src?: string;
  /** Stable preview identity (session/thread). Avoid Date.now() tab spam. */
  sourceMessageId?: string;
};

function stablePreviewId(path: string, name: string): string {
  return `file-${path || name}`;
}

function isDeliverablePreview(type: PreviewFileType | null): boolean {
  return type === "ppt" || type === "doc" || type === "pdf" || type === "xlsx";
}

function DeliverableIcon({ type }: { type: PreviewFileType }) {
  if (type === "ppt") return <Presentation className="w-4 h-4" aria-hidden />;
  if (type === "xlsx") return <FileSpreadsheet className="w-4 h-4" aria-hidden />;
  return <FileText className="w-4 h-4" aria-hidden />;
}

export function FileAttachmentBlock({
  name,
  size,
  mimeType,
  path,
  servedPath,
  src,
  sourceMessageId,
}: FileAttachmentBlockProps) {
  const { t } = useTranslation();
  const isImage = mimeType?.startsWith("image/");
  const previewType = !isImage ? isPreviewableFile(name) : null;
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const openFor = usePreviewStore((s) => s.openFor);

  const previewSrc = resolveArtifactPreviewSrc(path, src);
  const deliverable = isDeliverablePreview(previewType);

  const handleManualPreview = useCallback(async () => {
    if (!previewType || !previewSrc) return;
    setPreviewLoading(true);
    setPreviewError(null);
    const id = stablePreviewId(path, name);
    try {
      if (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx") {
        openFor({
          id,
          title: name,
          type: previewType,
          content: "",
          src: previewSrc,
          filePath: path,
          servedPath,
          sourceMessageId: sourceMessageId || path || name,
        });
      } else {
        // Exact file: pass path/src so PreviewCanvas loads THIS html/svg — never a sibling.
        openFor({
          id,
          title: name,
          type: previewType as "html" | "svg",
          content: "",
          src: previewSrc,
          filePath: path,
          servedPath,
          sourceMessageId: sourceMessageId || path || name,
        });
      }
    } catch {
      setPreviewError(t("file.previewLoadFailed"));
    }
    setPreviewLoading(false);
  }, [src, name, path, servedPath, previewType, previewSrc, openFor, sourceMessageId, t]);

  if (isImage && src) {
    return (
      <img
        src={encodeFilesUrl(src)}
        alt={name}
        className="file-attachment__shot shrink-0 max-h-[160px] w-auto max-w-[240px] rounded-lg object-cover cursor-pointer"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("open-lightbox", { detail: encodeFilesUrl(src) }))
        }
      />
    );
  }

  const sizeLabel = size >= 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;

  return (
    <div className={`file-attachment${deliverable ? " file-attachment--deliverable" : ""}`}>
      <div className="file-attachment__row">
        {deliverable && previewType ? (
          <span className="file-attachment__icon" aria-hidden>
            <DeliverableIcon type={previewType} />
          </span>
        ) : null}
        <div className="file-attachment__meta">
          {deliverable && (
            <p className="file-attachment__eyebrow">{t("file.deliverableReady")}</p>
          )}
          <p className="file-attachment__name">{name}</p>
          <p className="file-attachment__size">{sizeLabel}</p>
        </div>
        <div className="file-attachment__actions">
          <ArtifactFileMenu name={name} path={path} servedPath={servedPath} src={src} variant="compact" />
          {previewType && (
            <button
              type="button"
              onClick={handleManualPreview}
              disabled={previewLoading}
              className={`file-attachment__preview-btn${deliverable ? " file-attachment__preview-btn--primary" : ""}`}
            >
              {previewLoading ? "…" : t("preview.button")}
            </button>
          )}
        </div>
      </div>
      {previewError && <p className="file-attachment__error">{previewError}</p>}
    </div>
  );
}
