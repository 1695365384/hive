import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { init } from "pptx-preview";
import { PreviewErrorFallback } from "./PreviewErrorFallback";
import { PreviewEmbed } from "./PreviewEmbed";
import type { ArtifactOpenMeta } from "./artifact-open-meta";
import { loadArtifactArrayBuffer } from "../../lib/artifact-file";

interface PptxRendererProps extends ArtifactOpenMeta {
  src: string;
  title: string;
}

export function PptxRenderer({
  src,
  title,
  name,
  path,
  servedPath,
  artifactSrc,
  officeCliHint,
}: PptxRendererProps) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof init> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const bufRef = useRef<ArrayBuffer | null>(null);
  const lastWidthRef = useRef(0);

  const renderAtWidth = useCallback((width: number) => {
    const el = wrapperRef.current;
    const buf = bufRef.current;
    if (!el || !buf) return;

    const w = Math.max(280, Math.round(width));
    // Skip tiny jitter from panel animation / scrollbar — major source of 卡顿.
    if (Math.abs(w - lastWidthRef.current) < 8 && el.childElementCount > 0) {
      return;
    }
    lastWidthRef.current = w;

    while (el.firstChild) el.removeChild(el.firstChild);
    const h = Math.round((w * 9) / 16);
    viewerRef.current = init(el, { width: w, height: h });
    viewerRef.current.preview(buf);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let cancelled = false;
    setStatus("loading");
    lastWidthRef.current = 0;

    const load = async () => {
      try {
        let buf: ArrayBuffer;
        try {
          buf = await loadArtifactArrayBuffer({
            src: artifactSrc,
            path,
            servedPath,
            name,
          });
        } catch (primaryErr) {
          if (!src) throw primaryErr;
          const res = await fetch(src);
          if (!res.ok) throw primaryErr;
          buf = await res.arrayBuffer();
        }
        if (cancelled) return;
        bufRef.current = buf;
        const width = el.clientWidth || el.parentElement?.clientWidth || 720;
        renderAtWidth(width);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
      viewerRef.current = null;
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [src, path, servedPath, artifactSrc, name, renderAtWidth]);

  useEffect(() => {
    if (status !== "ready") return;
    const el = wrapperRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      if (w <= 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => renderAtWidth(w), 140);
    });
    ro.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
  }, [status, renderAtWidth]);

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
    <PreviewEmbed>
      {status === "loading" && (
        <div className="preview-state preview-state--loading">
          <span className="preview-state__spinner" aria-hidden />
          <span>{t("preview.loading")}</span>
        </div>
      )}
      <div
        ref={wrapperRef}
        className={`preview-embed__content ${status === "loading" ? "hidden" : ""}`}
      />
    </PreviewEmbed>
  );
}
