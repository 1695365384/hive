import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { PreviewErrorFallback } from "./PreviewErrorFallback";
import type { ArtifactOpenMeta } from "./artifact-open-meta";

interface XlsxRendererProps extends ArtifactOpenMeta {
  src: string;
  title: string;
}

interface SheetTab {
  name: string;
  html: string;
}

export function XlsxRenderer({ src, title, name, path, servedPath, artifactSrc, officeCliHint }: XlsxRendererProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sheets, setSheets] = useState<SheetTab[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const workbook = XLSX.read(buf, { type: "array" });
        const tabs: SheetTab[] = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(sheet, { id: `sheet-${sheetName}` });
          return { name: sheetName, html };
        });

        if (!cancelled) {
          setSheets(tabs);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || sheets.length === 0) return;
    el.innerHTML = sheets[activeSheet]?.html ?? "";
  }, [sheets, activeSheet]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || status !== "ready") return;

    const style = document.createElement("style");
    style.textContent = `
      table { border-collapse: collapse; width: 100%; font-size: 12px; font-family: monospace; }
      td, th { border: 1px solid #444; padding: 4px 8px; text-align: left; white-space: nowrap; }
      th { background: #2a2a2a; color: #d4d4d4; font-weight: 600; position: sticky; top: 0; }
      tr:nth-child(even) { background: rgba(255,255,255,0.02); }
      tr:hover { background: rgba(255,255,255,0.05); }
    `;
    el.appendChild(style);

    return () => {
      style.remove();
    };
  }, [status, activeSheet, sheets]);

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
    <div className="flex flex-col h-full">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[300px] text-stone-500 text-sm">
          {t("preview.loadingSpreadsheet")}
        </div>
      )}

      {status === "ready" && (
        <>
          {sheets.length > 1 && (
            <div className="flex gap-1 px-2 py-1.5 border-b border-stone-800 overflow-x-auto shrink-0">
              {sheets.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => setActiveSheet(i)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors shrink-0 ${
                    i === activeSheet
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200 border border-transparent"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div
            ref={containerRef}
            className="overflow-auto p-2 [&_table]:w-full [&_td]:border [&_td]:border-stone-700 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[12px] [&_td]:font-mono [&_th]:border [&_th]:border-stone-700 [&_th]:px-2 [&_th]:py-1 [&_th]:text-[12px] [&_th]:font-mono [&_th]:bg-stone-800 [&_th]:text-stone-300 [&_th]:font-semibold [&_th]:sticky [&_th]:top-0 [&_tr:nth-child(even)]:bg-white/[0.02]"
          />

          <div className="text-center text-[11px] text-stone-600 py-1 shrink-0 border-t border-stone-800">
            {sheets.length} sheet{sheets.length !== 1 ? "s" : ""}
          </div>
        </>
      )}
    </div>
  );
}
