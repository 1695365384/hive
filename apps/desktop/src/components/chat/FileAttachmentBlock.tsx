import { useState, useCallback } from "react";
import { ArtifactFileMenu } from "./ArtifactFileMenu";
import { encodeFilesUrl, resolveArtifactPreviewSrc } from "../../lib/artifact-file";
import { isPreviewableFile } from "../preview/detect-preview";
import { usePreviewStore } from "../../stores/preview-store";

type FileAttachmentBlockProps = {
  name: string;
  size: number;
  mimeType: string;
  path: string;
  servedPath?: string;
  src?: string;
};

export function FileAttachmentBlock({
  name,
  size,
  mimeType,
  path,
  servedPath,
  src,
}: FileAttachmentBlockProps) {
  const isImage = mimeType?.startsWith("image/");
  const previewType = !isImage ? isPreviewableFile(name) : null;
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const openFor = usePreviewStore((s) => s.openFor);

  const previewSrc = resolveArtifactPreviewSrc(path, src);

  const handleManualPreview = useCallback(async () => {
    if (!previewType || !previewSrc) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      if (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx") {
        openFor({
          id: `file-${path || name}-${Date.now()}`,
          title: name,
          type: previewType,
          content: "",
          src: previewSrc,
          filePath: path,
          servedPath,
          sourceMessageId: path || name,
        });
      } else if (src) {
        const res = await fetch(encodeFilesUrl(src));
        const content = await res.text();
        openFor({
          id: `file-${path || name}-${Date.now()}`,
          title: name,
          type: previewType as "html" | "svg",
          content,
          sourceMessageId: path || name,
        });
      }
    } catch {
      setPreviewError("预览加载失败");
    }
    setPreviewLoading(false);
  }, [src, name, path, servedPath, previewType, previewSrc, openFor]);

  if (isImage && src) {
    return (
      <img
        src={encodeFilesUrl(src)}
        alt={name}
        className="max-w-[300px] max-h-[200px] rounded-lg object-cover cursor-pointer"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("open-lightbox", { detail: encodeFilesUrl(src) }))
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-1 my-1">
      <div className="flex items-center gap-3 px-3 py-2 rounded bg-stone-800/50 border border-stone-700/30">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-200 truncate">{name}</p>
          <p className="text-[10px] text-stone-600">
            {size >= 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`}
          </p>
        </div>
        <ArtifactFileMenu name={name} path={path} servedPath={servedPath} src={src} variant="compact" />
        {previewType && (
          <button
            type="button"
            onClick={handleManualPreview}
            disabled={previewLoading}
            className="px-2 py-1 text-[10px] rounded text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50 shrink-0"
          >
            {previewLoading ? "..." : "Preview"}
          </button>
        )}
      </div>
      {previewError && <p className="text-[10px] text-red-400/90 px-3">{previewError}</p>}
    </div>
  );
}
