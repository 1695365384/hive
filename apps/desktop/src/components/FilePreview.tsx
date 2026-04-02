import { FileText, X } from "lucide-react";
import type { UploadedFile } from "../hooks/use-file-upload";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function FilePreviewItem({ file, onRemove }: { file: UploadedFile; onRemove?: () => void }) {
  const isImage = file.type === "image";

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-800/60 border border-stone-700/50 text-stone-300 group">
      {isImage ? (
        <img
          src={`http://127.0.0.1:4450${file.src}`}
          alt={file.name}
          className="w-8 h-8 rounded object-cover shrink-0"
        />
      ) : (
        <FileText className="w-4 h-4 shrink-0 text-stone-500" />
      )}
      <span className="text-[11px] truncate max-w-[120px]">{file.name}</span>
      <span className="text-[10px] text-stone-600 shrink-0">{formatSize(file.size)}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 text-stone-600 hover:text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function FilePreviewList({ files, onRemove }: { files: UploadedFile[]; onRemove?: (index: number) => void }) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file, idx) => (
        <FilePreviewItem
          key={file.savedName}
          file={file}
          onRemove={onRemove ? () => onRemove(idx) : undefined}
        />
      ))}
    </div>
  );
}
