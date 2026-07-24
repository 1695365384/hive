import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch } from "lucide-react";
import type { Preview } from "../../stores/preview-store";
import { SandboxedIframe } from "./SandboxedIframe";
import { SvgRenderer } from "./SvgRenderer";
import { PptxRenderer } from "./PptxRenderer";
import { DocxRenderer } from "./DocxRenderer";
import { PdfRenderer } from "./PdfRenderer";
import { XlsxRenderer } from "./XlsxRenderer";
import { loadArtifactText, resolveArtifactHttpUrl } from "../../lib/artifact-file";
import type { ArtifactOpenMeta } from "./artifact-open-meta";
import { PreviewEmbed } from "./PreviewEmbed";
import { PreviewErrorFallback } from "./PreviewErrorFallback";

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

/** Preview the exact HTML file the user clicked (not a sibling conversion). */
function HtmlFileRenderer({
  preview,
  artifactMeta,
}: {
  preview: Preview;
  artifactMeta: ArtifactOpenMeta;
}) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const text = await loadArtifactText({
          src: preview.src,
          path: preview.filePath,
          servedPath: preview.servedPath,
          name: preview.title,
        });
        if (cancelled) return;
        if (!/<(?:!DOCTYPE\s+html|html)\b/i.test(text.slice(0, 512))) {
          setStatus("error");
          return;
        }
        setHtml(text);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview.src, preview.filePath, preview.servedPath, preview.title]);

  if (status === "error") {
    return (
      <PreviewErrorFallback
        title={preview.title}
        name={artifactMeta.name || preview.title}
        path={artifactMeta.path}
        servedPath={artifactMeta.servedPath}
        artifactSrc={artifactMeta.artifactSrc}
      />
    );
  }

  if (status === "loading") {
    return (
      <div className="preview-state preview-state--loading">
        <span className="preview-state__spinner" aria-hidden />
        <span>{t("preview.loading")}</span>
      </div>
    );
  }

  return (
    <div className="preview-embed-host">
      <PreviewEmbed iframeTitle={preview.title} iframeSrcDoc={html} />
    </div>
  );
}

export function PreviewCanvas({ preview }: PreviewCanvasProps) {
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
  };

  const wrap = (node: ReactNode) => <div className="preview-canvas">{node}</div>;

  switch (preview.type) {
    case "html":
      // Same file only: inline content OR load the clicked .html — never a converted sibling.
      if (preview.content?.trim()) {
        return wrap(
          <PreviewFrame>
            <SandboxedIframe html={preview.content} />
          </PreviewFrame>,
        );
      }
      return wrap(
        <PreviewFrame>
          <HtmlFileRenderer preview={preview} artifactMeta={artifactMeta} />
        </PreviewFrame>,
      );
    case "svg":
      return wrap(
        <PreviewFrame>
          <SvgRenderer content={preview.content} />
        </PreviewFrame>,
      );
    case "ppt":
      // Render the clicked .pptx bytes directly — do not wait on officecli HTML conversion.
      return wrap(
        <PptxRenderer
          src={httpSrc}
          title={title}
          path={preview.filePath}
          servedPath={preview.servedPath}
          artifactSrc={preview.src}
          name={preview.title}
        />,
      );
    case "doc":
      return wrap(
        <PreviewFrame>
          <DocxRenderer
            src={httpSrc}
            title={title}
            path={preview.filePath}
            servedPath={preview.servedPath}
            artifactSrc={preview.src}
            name={preview.title}
          />
        </PreviewFrame>,
      );
    case "pdf":
      return wrap(
        <PreviewFrame flush>
          <PdfRenderer src={httpSrc} title={title} {...artifactMeta} />
        </PreviewFrame>,
      );
    case "xlsx":
      return wrap(
        <PreviewFrame flush>
          <XlsxRenderer
            src={httpSrc}
            title={title}
            path={preview.filePath}
            servedPath={preview.servedPath}
            artifactSrc={preview.src}
            name={preview.title}
          />
        </PreviewFrame>,
      );
  }
}
