import { useRef, useEffect, useState } from "react";

interface SandboxedIframeProps {
  html: string;
}

/**
 * Render HTML content in a sandboxed iframe using srcdoc.
 * - Full <!DOCTYPE html> document wrapping
 * - sandbox="allow-scripts" (no forms, no top nav, no same-origin)
 * - Auto-height via ResizeObserver + postMessage
 * - Respects dark mode via color-scheme CSS
 */
export function SandboxedIframe({ html }: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const fullDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark light">
  <style>
    body {
      margin: 0;
      padding: 16px;
      color-scheme: dark;
      font-family: system-ui, sans-serif;
      background: transparent;
    }
    /* Notify parent of height changes */
    .__hive_resize_sentinel {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 1px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  ${html}
  <div class="__hive_resize_sentinel" data-sentinel></div>
  <script>
    (function() {
      var sentinel = document.querySelector('[data-sentinel]');
      if (!sentinel) return;
      var ro = new ResizeObserver(function() {
        var h = document.body.scrollHeight;
        parent.postMessage({ type: 'hive-resize', height: h }, '*');
      });
      ro.observe(sentinel);
      // Initial height
      parent.postMessage({ type: 'hive-resize', height: document.body.scrollHeight }, '*');
    })();
  </script>
</body>
</html>`;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.data?.type === "hive-resize" &&
        typeof e.data.height === "number"
      ) {
        setHeight(Math.min(e.data.height, 2000));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={fullDoc}
      sandbox="allow-scripts"
      title="preview"
      className="w-full rounded-lg border border-stone-800 bg-white"
      style={{ height: `${Math.max(height, 100)}px` }}
    />
  );
}
