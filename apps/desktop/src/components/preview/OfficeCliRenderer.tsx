import { useState, useEffect, useRef, type ReactNode } from "react";
import { buildOfficePreviewQuery } from "../../lib/artifact-file";
import { enhanceOfficePreviewHtml } from "./preview-html";
import { PreviewEmbed } from "./PreviewEmbed";

const OFFICECLI_HINT =
  "未安装 officecli，正在使用备用预览。安装高保真预览：npm i -g @officecli/officecli";

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
  const [status, setStatus] = useState<Status>("loading");
  const [html, setHtml] = useState<string>("");
  const [fallbackHint, setFallbackHint] = useState<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPreview = async () => {
    if (!src && !servedPath && !filePath) return;
    try {
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
        setFallbackHint(OFFICECLI_HINT);
        onFallbackHint?.(OFFICECLI_HINT);
        setStatus("fallback");
        return;
      }

      if (!res.ok) {
        setFallbackHint(undefined);
        onFallbackHint?.(undefined);
        setStatus("fallback");
        return;
      }

      const htmlContent = enhanceOfficePreviewHtml(await res.text());
      setHtml(htmlContent);
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
    if (isRunning && (src || servedPath || filePath)) {
      pollRef.current = setInterval(loadPreview, 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [isRunning, status, src, servedPath, filePath]);

  if (!src && !servedPath && !filePath) {
    return (
      <div className="preview-state preview-state--loading">
        <span className="preview-live-badge__dot" />
        <span>正在生成文档，预览即将出现…</span>
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
      <div className="preview-state preview-state--loading">
        <span className="preview-state__spinner" aria-hidden />
        <span>加载预览中…</span>
      </div>
    );
  }

  return (
    <div className="preview-embed-host">
      {isRunning && (
        <div className="preview-live-badge">
          <span className="preview-live-badge__dot" aria-hidden />
          Live
        </div>
      )}
      <PreviewEmbed iframeSrcDoc={html} iframeTitle={title} />
    </div>
  );
}
