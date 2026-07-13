import { useState, useEffect, useRef, type ReactNode } from "react";

interface OfficeCliRendererProps {
  src: string;
  title: string;
  fallback: ReactNode;
  /** 是否正在运行（agent 还在执行），为 true 时自动轮询刷新预览 */
  isRunning?: boolean;
}

type Status = "loading" | "ready" | "fallback";

export function OfficeCliRenderer({ src, title, fallback, isRunning }: OfficeCliRendererProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [html, setHtml] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPreview = async () => {
    if (!src) return;
    try {
      let queryParams: string;
      if (src.startsWith("/files/")) {
        const fileName = src.split("/files/").pop() ?? "";
        if (!fileName) { setStatus("fallback"); return; }
        queryParams = `file=${encodeURIComponent(fileName)}`;
      } else {
        queryParams = `path=${encodeURIComponent(src)}`;
      }

      const liveParam = isRunning ? "&live=1" : "";
      const res = await fetch(
        `http://127.0.0.1:4450/api/preview/html?${queryParams}${liveParam}`
      );

      if (res.status === 503) {
        setStatus("fallback");
        return;
      }

      if (!res.ok) {
        setStatus("fallback");
        return;
      }

      const htmlContent = await res.text();
      setHtml(htmlContent);
      setStatus("ready");
    } catch {
      setStatus("fallback");
    }
  };

  // Initial load + refresh on src change
  useEffect(() => {
    loadPreview();
  }, [src]);

  // Auto-refresh while agent is running (poll every 3s)
  useEffect(() => {
    if (isRunning && src) {
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
  }, [isRunning, status, src]);

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-[300px] text-stone-500 text-sm px-4 text-center">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" />
        <span>正在生成文档，预览即将出现…</span>
      </div>
    );
  }

  if (status === "fallback") {
    return <>{fallback}</>;
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
        Loading preview...
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden relative">
      {isRunning && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] bg-stone-900/80 text-stone-400 border border-stone-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" />
          live
        </div>
      )}
      <iframe
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        title={title}
        className="w-full h-full border-0 bg-white"
      />
    </div>
  );
}
