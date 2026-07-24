import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { buildOfficePreviewQuery, isElectronRuntime } from "../../lib/artifact-file";
import { enhanceOfficePreviewHtml } from "./preview-html";
import { PreviewEmbed } from "./PreviewEmbed";

interface OfficeCliRendererProps {
  src: string;
  servedPath?: string;
  filePath?: string;
  title: string;
  fallback: ReactNode;
  isRunning?: boolean;
  onFallbackHint?: (hint: string | undefined) => void;
}

type Status = "loading" | "ready" | "fallback";

export function OfficeCliRenderer({
  src,
  servedPath,
  filePath,
  title,
  fallback,
  isRunning,
  onFallbackHint,
}: OfficeCliRendererProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("loading");
  const [html, setHtml] = useState<string>("");
  const [fallbackHint, setFallbackHint] = useState<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPreview = async () => {
    if (!src && !servedPath && !filePath) return;
    try {
      let htmlContent: string;

      // Electron fast path: only for real HTML decks. Never utf-8-read .pptx/.docx —
      // that succeeds without throwing and renders ZIP bytes as 乱码 in srcDoc.
      const localHtmlPath =
        isElectronRuntime() && filePath && /\.html?$/i.test(filePath) ? filePath : null;

      if (localHtmlPath) {
        try {
          htmlContent = await window.hive!.file.readHtml(localHtmlPath);
        } catch {
          const queryParams = buildOfficePreviewQuery({
            src,
            servedPath,
            filePath,
            live: isRunning,
          });
          if (!queryParams) {
            setFallbackHint(undefined);
            onFallbackHint?.(undefined);
            setStatus("fallback");
            return;
          }
          const res = await fetch(`http://127.0.0.1:4450/api/preview/html?${queryParams}`);
          if (!res.ok) {
            setFallbackHint(undefined);
            onFallbackHint?.(undefined);
            setStatus("fallback");
            return;
          }
          htmlContent = await res.text();
        }
      } else {
        const queryParams = buildOfficePreviewQuery({
          src,
          servedPath,
          filePath,
          live: isRunning,
        });
        if (!queryParams) {
          setFallbackHint(undefined);
          onFallbackHint?.(undefined);
          setStatus("fallback");
          return;
        }

        const res = await fetch(`http://127.0.0.1:4450/api/preview/html?${queryParams}`);

        if (res.status === 503) {
          const hint = t("preview.officecliMissing");
          setFallbackHint(hint);
          onFallbackHint?.(hint);
          setStatus("fallback");
          return;
        }

        if (!res.ok) {
          setFallbackHint(undefined);
          onFallbackHint?.(undefined);
          setStatus("fallback");
          return;
        }

        htmlContent = await res.text();
      }

      // Guard: refuse non-HTML payloads (e.g. accidental binary/ZIP read)
      if (!/<(?:!DOCTYPE\s+html|html)\b/i.test(htmlContent.slice(0, 512))) {
        setFallbackHint(undefined);
        onFallbackHint?.(undefined);
        setStatus("fallback");
        return;
      }

      const enhanced = enhanceOfficePreviewHtml(htmlContent);
      setHtml(enhanced);
      setFallbackHint(undefined);
      onFallbackHint?.(undefined);
      setStatus("ready");
    } catch {
      setFallbackHint(undefined);
      onFallbackHint?.(undefined);
      setStatus("fallback");
    }
  };

  useEffect(() => {
    loadPreview();
  }, [src, servedPath, filePath]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!isRunning || status !== "ready") return;
    const intervalMs = 2000;
    pollRef.current = setInterval(loadPreview, intervalMs);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, status, src, servedPath, filePath]);

  if (!src && !servedPath && !filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-stone-900 text-stone-400 text-sm">
        {t("preview.noContent")}
      </div>
    );
  }

  if (status === "fallback") {
    return (
      <div className="preview-fallback-wrap">
        {fallbackHint && (
          <p className="preview-fallback-wrap__hint">{fallbackHint}</p>
        )}
        {fallback}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full bg-stone-900 text-stone-400 text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-stone-700 border-t-amber-500 rounded-full mr-2" />
        {t("preview.loading")}
      </div>
    );
  }

  return (
    <div className="preview-embed-host">
      <PreviewEmbed iframeTitle={title} iframeSrcDoc={html} />
    </div>
  );
}
