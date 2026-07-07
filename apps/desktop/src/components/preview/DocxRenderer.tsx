import { useRef, useEffect, useState } from "react";
import { renderAsync } from "docx-preview";

interface DocxRendererProps {
  src: string;
  title: string;
}

export function DocxRenderer({ src, title }: DocxRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
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
    <div className="overflow-y-auto">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
          Loading document...
        </div>
      )}
      <div
        ref={containerRef}
        className={`[&_.docx-preview]:mx-auto [&_.docx-wrapper]:bg-white [&_.docx-wrapper]:shadow-lg [&_.docx-wrapper]:my-4 [&_.docx-wrapper>section]:!min-h-0 ${status === "loading" ? "hidden" : ""}`}
      />
    </div>
  );
}
