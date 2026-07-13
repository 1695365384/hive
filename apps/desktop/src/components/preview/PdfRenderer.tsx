import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

// Set worker path for PDF.js
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

import { PreviewErrorFallback } from "./PreviewErrorFallback";
import type { ArtifactOpenMeta } from "./artifact-open-meta";

interface PdfRendererProps extends ArtifactOpenMeta {
  src: string;
  title: string;
}

export function PdfRenderer({ src, title, name, path, servedPath, artifactSrc }: PdfRendererProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());

  const renderPage = useCallback(
    async (pdf: PDFDocumentProxy, pageNum: number, canvas: HTMLCanvasElement) => {
      const page: PDFPageProxy = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvas, viewport }).promise;
    },
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let pdfDoc: PDFDocumentProxy | null = null;

    const load = async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        pdfDoc = await getDocument({ data: buf }).promise;
        if (cancelled) {
          await pdfDoc.cleanup();
          return;
        }

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);

        // Render first page immediately, others lazy
        const canvas = el.querySelector("canvas");
        if (canvas) {
          await renderPage(pdfDoc, 1, canvas);
        }

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
      if (pdfDoc) pdfDoc.cleanup();
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [src, renderPage]);

  const handlePageClick = useCallback(
    async (pageNum: number) => {
      const el = containerRef.current;
      const pdfDoc = pdfDocRef.current;
      if (!el || !pdfDoc) return;

      // Don't re-render if already rendered
      if (renderedPagesRef.current.has(pageNum)) return;

      // Create a new canvas for the clicked page
      const existing = el.querySelector(`[data-page="${pageNum}"]`);
      if (existing) {
        existing.scrollIntoView({ behavior: "smooth" });
        return;
      }

      const wrapper = el.querySelector(`[data-page-wrapper="${pageNum}"]`);
      if (!wrapper) return;

      const canvas = document.createElement("canvas");
      canvas.dataset.page = String(pageNum);
      wrapper.appendChild(canvas);

      try {
        await renderPage(pdfDoc, pageNum, canvas);
        renderedPagesRef.current.add(pageNum);
        canvas.scrollIntoView({ behavior: "smooth" });
      } catch {
        canvas.remove();
      }
    },
    [renderPage]
  );

  if (status === "error") {
    return (
      <PreviewErrorFallback
        title={title}
        name={name || title}
        path={path}
        servedPath={servedPath}
        artifactSrc={artifactSrc}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
          {t("preview.loadingPdf")}
        </div>
      )}

      {/* Page thumbstrip */}
      {status === "ready" && numPages > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-stone-800 overflow-x-auto shrink-0">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => handlePageClick(n)}
              className="px-2 py-0.5 text-[11px] font-mono rounded bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200 transition-colors shrink-0"
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {/* Pages */}
      <div
        ref={containerRef}
        className={`overflow-y-auto p-2 space-y-2 ${status === "loading" ? "hidden" : ""}`}
      >
        {/* First page rendered inline */}
        <div className="flex justify-center">
          <canvas className="shadow-lg rounded max-w-full h-auto" />
        </div>
        {/* Placeholders for remaining pages */}
        {Array.from({ length: Math.max(0, numPages - 1) }, (_, i) => (
          <div
            key={i + 2}
            data-page-wrapper={i + 2}
            className="flex justify-center min-h-[40px]"
          />
        ))}
      </div>

      <div className="text-center text-[11px] text-stone-600 py-1 shrink-0 border-t border-stone-800">
        {numPages} page{numPages !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
