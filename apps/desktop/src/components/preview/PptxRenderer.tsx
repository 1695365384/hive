import { useRef, useEffect, useState, useCallback } from "react";
import { init } from "pptx-preview";
import { PreviewErrorFallback } from "./PreviewErrorFallback";
import { PreviewEmbed } from "./PreviewEmbed";
import type { ArtifactOpenMeta } from "./artifact-open-meta";

interface PptxRendererProps extends ArtifactOpenMeta {
  src: string;
  title: string;
}

export function PptxRenderer({ src, title, name, path, servedPath, artifactSrc, officeCliHint }: PptxRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof init> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const bufRef = useRef<ArrayBuffer | null>(null);

  const renderAtWidth = useCallback((width: number) => {
    const el = wrapperRef.current;
    const buf = bufRef.current;
    if (!el || !buf) return;

    while (el.firstChild) el.removeChild(el.firstChild);
    const w = Math.max(280, width);
    const h = Math.round((w * 9) / 16);
    viewerRef.current = init(el, { width: w, height: h });
    viewerRef.current.preview(buf);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        bufRef.current = buf;
        const width = el.clientWidth || el.parentElement?.clientWidth || 720;
        renderAtWidth(width);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
      viewerRef.current = null;
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [src, renderAtWidth]);

  useEffect(() => {
    if (status !== "ready") return;
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      if (w > 0) renderAtWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
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
          <span>加载预览中…</span>
        </div>
      )}
      <div
        ref={wrapperRef}
        className={`preview-embed__content ${status === "loading" ? "hidden" : ""}`}
      />
    </PreviewEmbed>
  );
}
