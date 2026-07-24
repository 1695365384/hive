import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { renderAsync } from "docx-preview";
import { PreviewErrorFallback } from "./PreviewErrorFallback";
import type { ArtifactOpenMeta } from "./artifact-open-meta";
import { loadArtifactArrayBuffer } from "../../lib/artifact-file";

interface DocxRendererProps extends ArtifactOpenMeta {
  src: string;
  title: string;
}

export function DocxRenderer({ src, title, name, path, servedPath, artifactSrc, officeCliHint }: DocxRendererProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const load = async () => {
      try {
        let buf: ArrayBuffer;
        try {
          buf = await loadArtifactArrayBuffer({ src: artifactSrc, path, servedPath, name });
        } catch (primaryErr) {
          if (!src) throw primaryErr;
          const res = await fetch(src);
          if (!res.ok) throw primaryErr;
          buf = await res.arrayBuffer();
        }
        if (cancelled) return;

        await renderAsync(buf, el, undefined, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
        });

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [src, path, servedPath, artifactSrc, name]);

  if (status === "error") {
    return (
      <PreviewErrorFallback
        title={title}
        name={name || title}
        path={path}
        servedPath={servedPath}
        artifactSrc={artifactSrc}
        hint={officeCliHint}
      />
    );
  }

  return (
    <div className="overflow-y-auto">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
          {t("preview.loadingDocument")}
        </div>
      )}
      <div
        ref={containerRef}
        className={`[&_.docx-preview]:mx-auto [&_.docx-wrapper]:bg-white [&_.docx-wrapper]:shadow-lg [&_.docx-wrapper]:my-4 [&_.docx-wrapper>section]:!min-h-0 ${status === "loading" ? "hidden" : ""}`}
      />
    </div>
  );
}
