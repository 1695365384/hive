import { useState, useCallback } from "react";
import { FileText } from "lucide-react";
import { isPreviewableFile } from "../preview/detect-preview";
import { usePreviewStore } from "../../stores/preview-store";

type FileAttachmentBlockProps = {
  name: string;
  size: number;
  mimeType: string;
  path: string;
  src?: string;
};

export function FileAttachmentBlock({ name, size, mimeType, path, src }: FileAttachmentBlockProps) {
  const isImage = mimeType?.startsWith("image/");
  const previewType = !isImage ? isPreviewableFile(name) : null;
  const [previewLoading, setPreviewLoading] = useState(false);
  const openFor = usePreviewStore((s) => s.openFor);

  /** Office/doc previews use absolute path; html/svg use HTTP src */
  const previewSrc =
    previewType && (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx")
      ? (path || src || "")
      : (src || "");

  const handleManualPreview = useCallback(async () => {
    if (!previewType || !previewSrc) return;
    setPreviewLoading(true);
    try {
      if (previewType === "ppt" || previewType === "doc" || previewType === "pdf" || previewType === "xlsx") {
        openFor({
          id: `file-${path || name}-${Date.now()}`,
          title: name,
          type: previewType,
          content: "",
          src: previewSrc,
          sourceMessageId: path || name,
        });
      } else {
        const res = await fetch(`http://127.0.0.1:4450${src}`);
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
      if (src) window.open(`http://127.0.0.1:4450${src}`, "_blank");
    }
    setPreviewLoading(false);
  }, [src, name, path, previewType, previewSrc, openFor]);

  if (isImage) {
    return (
      <img
        src={`http://127.0.0.1:4450${src}`}
        alt={name}
        className="max-w-[300px] max-h-[200px] rounded-lg object-cover cursor-pointer"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("open-lightbox", { detail: `http://127.0.0.1:4450${src}` }))
        }
      />
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded bg-stone-800/50 border border-stone-700/30 my-1">
      <FileText className="w-4 h-4 shrink-0 text-stone-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-200 truncate">{name}</p>
        <p className="text-[10px] text-stone-600">
          {size >= 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`}
        </p>
      </div>
      <a
        href={`http://127.0.0.1:4450${src}`}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2 py-1 text-[10px] rounded text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-colors shrink-0"
      >
        Open
      </a>
      {previewType && (
        <button
          onClick={handleManualPreview}
          disabled={previewLoading}
          className="px-2 py-1 text-[10px] rounded text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50 shrink-0"
        >
          {previewLoading ? "..." : "Preview"}
        </button>
      )}
    </div>
  );
}
