import type { Preview } from "../../stores/preview-store";
import { SandboxedIframe } from "./SandboxedIframe";
import { SvgRenderer } from "./SvgRenderer";
import { PptxRenderer } from "./PptxRenderer";
import { DocxRenderer } from "./DocxRenderer";
import { PdfRenderer } from "./PdfRenderer";
import { XlsxRenderer } from "./XlsxRenderer";

interface PreviewCanvasProps {
  preview: Preview | null;
}

export function PreviewCanvas({ preview }: PreviewCanvasProps) {
  if (!preview) {
    return (
      <div className="flex items-center justify-center h-full text-stone-600 text-sm px-4 text-center">
        Select a preview to display
      </div>
    );
  }

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
        <PptxRenderer
          src={`http://127.0.0.1:4450${preview.src}`}
          title={preview.title}
        />
      );
    case "doc":
      return (
        <DocxRenderer
          src={`http://127.0.0.1:4450${preview.src}`}
          title={preview.title}
        />
      );
    case "pdf":
      return (
        <PdfRenderer
          src={`http://127.0.0.1:4450${preview.src}`}
          title={preview.title}
        />
      );
    case "xlsx":
      return (
        <XlsxRenderer
          src={`http://127.0.0.1:4450${preview.src}`}
          title={preview.title}
        />
      );
  }
}
