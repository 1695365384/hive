import { useRef, useEffect, useState } from "react";
import { init } from "pptx-preview";

interface PptxRendererProps {
  src: string;
  title: string;
}

export function PptxRenderer({ src, title }: PptxRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let viewer: ReturnType<typeof init> | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        viewer = init(el, { width: 960, height: 540 });

        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        viewer.preview(buf);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
      // Remove any slides the library appended
      while (el.firstChild) el.removeChild(el.firstChild);
    };
  }, [src]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-stone-500">
        <span className="text-sm">Failed to preview {title}</span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-400/80 hover:text-amber-300 underline"
        >
          Open file directly
        </a>
      </div>
    );
  }

  return (
    <div className="p-2">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
          Loading preview...
        </div>
      )}
      <div
        ref={wrapperRef}
        className={`flex items-start justify-center ${status === "loading" ? "hidden" : ""}`}
      />
    </div>
  );
}
