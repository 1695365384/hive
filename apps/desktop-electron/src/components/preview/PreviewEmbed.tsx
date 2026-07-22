import { useEffect, useRef, type ReactNode } from "react";

type PreviewEmbedProps = {
  children?: ReactNode;
  /** When set, fills the host and notifies iframe on resize (officecli scaleSlides). */
  iframeSrcDoc?: string;
  iframeTitle?: string;
  className?: string;
};

/** Full-bleed preview host — content stretches to preview panel edges. */
export function PreviewEmbed({
  children,
  iframeSrcDoc,
  iframeTitle,
  className = "",
}: PreviewEmbedProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeSrcDoc) return;
    const host = hostRef.current;
    const iframe = iframeRef.current;
    if (!host || !iframe) return;

    let rafId = 0;

    const notify = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect();
        if (rect.width <= 0) return;
        iframe.contentWindow?.postMessage(
          {
            type: "hive-preview-resize",
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          "*",
        );
      });
    };

    const onLoad = () => {
      notify();
    };

    iframe.addEventListener("load", onLoad);
    const ro = new ResizeObserver(() => notify());
    ro.observe(host);
    notify();

    return () => {
      cancelAnimationFrame(rafId);
      iframe.removeEventListener("load", onLoad);
      ro.disconnect();
    };
  }, [iframeSrcDoc]);

  return (
    <div ref={hostRef} className={`preview-embed ${className}`.trim()}>
      {iframeSrcDoc != null ? (
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrcDoc}
          sandbox="allow-scripts allow-same-origin"
          title={iframeTitle ?? "preview"}
          className="preview-embed__iframe"
        />
      ) : (
        <div className="preview-embed__body">{children}</div>
      )}
    </div>
  );
}
