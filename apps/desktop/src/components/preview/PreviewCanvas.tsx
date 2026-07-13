import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch } from "lucide-react";
import type { Preview } from "../../stores/preview-store";
import { SandboxedIframe } from "./SandboxedIframe";
import { SvgRenderer } from "./SvgRenderer";
import { PptxRenderer } from "./PptxRenderer";
import { DocxRenderer } from "./DocxRenderer";
import { PdfRenderer } from "./PdfRenderer";
import { XlsxRenderer } from "./XlsxRenderer";
import { OfficeCliRenderer } from "./OfficeCliRenderer";
import { resolveArtifactHttpUrl } from "../../lib/artifact-file";
import type { ArtifactOpenMeta } from "./artifact-open-meta";

interface PreviewCanvasProps {
  preview: Preview | null;
  isRunning?: boolean;
}

function PreviewEmpty() {
  const { t } = useTranslation();
  return (
    <div className="preview-state preview-state--empty">
      <FileSearch className="w-8 h-8 text-stone-600 mb-3" strokeWidth={1.5} />
      <p className="text-sm text-stone-500">{t("preview.selectAttachment")}</p>
    </div>
  );
}

function PreviewFrame({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <div className={`preview-frame ${flush ? "preview-frame--flush" : ""}`}>{children}</div>
  );
}

export function PreviewCanvas({ preview, isRunning }: PreviewCanvasProps) {
  const [officeCliHint, setOfficeCliHint] = useState<string | undefined>();

  if (!preview) {
    return (
      <div className="preview-canvas">
        <PreviewEmpty />
      </div>
    );
  }

  const httpSrc = resolveArtifactHttpUrl(undefined, preview.src) ?? "";
  const title = preview.title;

  const artifactMeta: ArtifactOpenMeta = {
    name: preview.title,
    path: preview.filePath,
    servedPath: preview.servedPath,
    artifactSrc: preview.src,
    officeCliHint,
  };

  const wrap = (node: ReactNode) => <div className="preview-canvas">{node}</div>;

  switch (preview.type) {
    case "html":
      return wrap(
        <PreviewFrame>
          <SandboxedIframe html={preview.content} />
        </PreviewFrame>
      );
    case "svg":
      return wrap(
        <PreviewFrame>
          <SvgRenderer content={preview.content} />
        </PreviewFrame>
      );
    case "ppt":
      return wrap(
        <OfficeCliRenderer
          src={preview.src ?? ""}
          servedPath={preview.servedPath}
          filePath={preview.filePath}
          title={title}
          isRunning={isRunning}
          onFallbackHint={setOfficeCliHint}
          fallback={<PptxRenderer src={httpSrc} title={title} {...artifactMeta} />}
        />
      );
    case "doc":
      return wrap(
        <OfficeCliRenderer
          src={preview.src ?? ""}
          servedPath={preview.servedPath}
          filePath={preview.filePath}
          title={title}
          isRunning={isRunning}
          onFallbackHint={setOfficeCliHint}
          fallback={
            <PreviewFrame>
              <DocxRenderer src={httpSrc} title={title} {...artifactMeta} />
            </PreviewFrame>
          }
        />
      );
    case "pdf":
      return wrap(
        <PreviewFrame flush>
          <PdfRenderer src={httpSrc} title={title} {...artifactMeta} />
        </PreviewFrame>
      );
    case "xlsx":
      return wrap(
        <OfficeCliRenderer
          src={preview.src ?? ""}
          servedPath={preview.servedPath}
          filePath={preview.filePath}
          title={title}
          isRunning={isRunning}
          onFallbackHint={setOfficeCliHint}
          fallback={
            <PreviewFrame flush>
              <XlsxRenderer src={httpSrc} title={title} {...artifactMeta} />
            </PreviewFrame>
          }
        />
      );
  }
}
