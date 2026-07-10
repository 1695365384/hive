import type { Preview } from "../../stores/preview-store";
import { SandboxedIframe } from "./SandboxedIframe";
import { SvgRenderer } from "./SvgRenderer";
import { PptxRenderer } from "./PptxRenderer";
import { DocxRenderer } from "./DocxRenderer";
import { PdfRenderer } from "./PdfRenderer";
import { XlsxRenderer } from "./XlsxRenderer";
import { OfficeCliRenderer } from "./OfficeCliRenderer";

interface PreviewCanvasProps {
  preview: Preview | null;
  isRunning?: boolean;
}

export function PreviewCanvas({ preview, isRunning }: PreviewCanvasProps) {
  if (!preview) {
    return (
      <div className="flex items-center justify-center h-full text-stone-600 text-sm px-4 text-center">
        Select a preview to display
      </div>
    );
  }

  const src = preview.src ? `http://127.0.0.1:4450${preview.src}` : "";
  const title = preview.title;

  switch (preview.type) {
    case "html":
      return (
        <div className="p-2">
          <SandboxedIframe html={preview.content} />
        </div>
      );
    case "svg":
      return <SvgRenderer content={preview.content} />;
    case "ppt":
      return (
        <OfficeCliRenderer
          src={preview.src ?? ""}
          title={title}
          isRunning={isRunning}
          fallback={<PptxRenderer src={src} title={title} />}
        />
      );
    case "doc":
      return (
        <OfficeCliRenderer
          src={preview.src ?? ""}
          title={title}
          isRunning={isRunning}
          fallback={<DocxRenderer src={src} title={title} />}
        />
      );
    case "pdf":
      return (
        <PdfRenderer
          src={src}
          title={title}
        />
      );
    case "xlsx":
      return (
        <OfficeCliRenderer
          src={preview.src ?? ""}
          title={title}
          isRunning={isRunning}
          fallback={<XlsxRenderer src={src} title={title} />}
        />
      );
  }
}
