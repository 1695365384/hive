import { useMemo, useRef, useEffect, isValidElement } from "react";
import { Streamdown, CodeBlock } from "streamdown";
import type { Components } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { usePreviewStore } from "../stores/preview-store";
import { detectPreviews, candidateToPreview } from "./preview/detect-preview";

interface TextBlockProps {
  text: string;
  sourceMessageId?: string;
  autoPreview?: boolean;
}

// ---------- File link preprocessor ----------

function preprocessFileLinks(text: string): string {
  return text.replace(
    /\[File: ([^\]]+)\] (\/[^\s<]+)/g,
    (_match, name, fullPath) => {
      const fileName = fullPath.split("/").pop() || fullPath;
      return `[${name}](http://127.0.0.1:4450/files/${fileName})`;
    }
  );
}

// ---------- Component ----------

export function TextBlock({ text, sourceMessageId, autoPreview }: TextBlockProps) {
  const openFor = usePreviewStore((s) => s.openFor);
  const autoPreviewedRef = useRef(false);

  useEffect(() => {
    if (autoPreview && sourceMessageId && !autoPreviewedRef.current) {
      const candidates = detectPreviews(text);
      if (candidates.length > 0) {
        openFor(candidateToPreview(candidates[0], sourceMessageId));
        autoPreviewedRef.current = true;
      }
    }
  });

  const processed = useMemo(() => preprocessFileLinks(text), [text]);

  const components: Components = useMemo(
    () => ({
      // ---- Headings ----
      h1({ children }) {
        return <h1 className="text-base font-semibold text-stone-100 mt-4 mb-2 first:mt-0">{children}</h1>;
      },
      h2({ children }) {
        return <h2 className="text-[15px] font-semibold text-stone-100 mt-3.5 mb-1.5 first:mt-0">{children}</h2>;
      },
      h3({ children }) {
        return <h3 className="text-sm font-semibold text-stone-200 mt-3 mb-1 first:mt-0">{children}</h3>;
      },
      h4({ children }) {
        return <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mt-2.5 mb-1">{children}</h4>;
      },
      h5({ children }) {
        return <h5 className="text-xs font-medium text-stone-400 mt-2 mb-0.5">{children}</h5>;
      },
      h6({ children }) {
        return <h6 className="text-xs font-medium text-stone-500 mt-2 mb-0.5">{children}</h6>;
      },

      // ---- Paragraph ----
      p({ children }) {
        return <p className="my-1.5 leading-relaxed text-stone-300 first:mt-0 last:mb-0">{children}</p>;
      },

      // ---- Lists ----
      ul({ children }) {
        return <ul className="my-1.5 space-y-0.5 list-none">{children}</ul>;
      },
      ol({ children }) {
        return <ol className="my-1.5 space-y-0.5 list-decimal list-inside marker:text-stone-500 marker:text-[11px] marker:font-mono">{children}</ol>;
      },
      li({ children }) {
        return (
          <li className="pl-4 relative text-stone-300 leading-relaxed before:absolute before:left-1.5 before:top-[0.55em] before:w-1 before:h-1 before:rounded-full before:bg-stone-600 before:content-['']">
            {children}
          </li>
        );
      },

      // ---- Links ----
      a({ children, href, ...props }) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400/90 hover:text-amber-300 transition-colors underline decoration-amber-400/20 underline-offset-2 hover:decoration-amber-400/50"
            {...props}
          >
            {children}
          </a>
        );
      },

      // ---- Strong / Em ----
      strong({ children }) {
        return <strong className="font-semibold text-stone-100">{children}</strong>;
      },
      em({ children }) {
        return <em className="italic text-stone-300">{children}</em>;
      },

      // ---- Code (inline + block) ----
      code({ className, children, ...props }) {
        const isBlock = className?.startsWith("language-");
        const lang = (className?.replace("language-", "") || "").toLowerCase();

        if (!isBlock) {
          return (
            <code
              className="px-1.5 py-0.5 rounded bg-stone-800/80 text-amber-400/90 text-[13px] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        }

        const rawContent = isValidElement(children)
          ? String((children as React.ReactElement<{ children?: unknown }>).props?.children ?? "")
          : String(children ?? "");
        const codeText = rawContent.replace(/\n$/, "");

        if (sourceMessageId && (lang === "html" || lang === "svg")) {
          return (
            <div className="group relative my-2">
              <CodeBlock code={codeText} language={lang} />
              <button
                onClick={() => {
                  const candidates = detectPreviews("```" + lang + "\n" + codeText + "\n```");
                  if (candidates.length > 0) {
                    openFor(candidateToPreview(candidates[0], sourceMessageId));
                  }
                }}
                className="absolute top-2 right-2 z-10 px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 opacity-0 group-hover:opacity-100 hover:bg-amber-500/30 transition-all duration-200"
              >
                ▶ Preview
              </button>
            </div>
          );
        }

        return <CodeBlock code={codeText} language={lang} />;
      },

      // ---- Pre ----
      pre({ children }) {
        return <pre className="my-2">{children}</pre>;
      },

      // ---- Blockquote ----
      blockquote({ children }) {
        return (
          <blockquote className="border-l-2 border-stone-700 pl-3 my-2 text-stone-500 italic">
            {children}
          </blockquote>
        );
      },

      // ---- HR ----
      hr() {
        return <hr className="border-stone-800 my-3" />;
      },

      // ---- Table ----
      table({ children }) {
        return (
          <div className="my-2.5 overflow-x-auto">
            <table className="w-full text-[13px] border-collapse border border-stone-800 rounded-md overflow-hidden">
              {children}
            </table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-stone-900/60">{children}</thead>;
      },
      th({ children }) {
        return <th className="text-left px-2.5 py-1.5 text-stone-400 font-medium text-xs uppercase tracking-wide border-b border-stone-700">{children}</th>;
      },
      td({ children }) {
        return <td className="px-2.5 py-1.5 text-stone-300 border-b border-stone-800/60 align-top">{children}</td>;
      },
      tr({ children, ...props }) {
        // Check if it's in tbody for hover effect
        const className = "transition-colors hover:bg-stone-800/30";
        return <tr className={className} {...props}>{children}</tr>;
      },
    }),
    [openFor, sourceMessageId]
  );

  if (!text) return null;

  return (
    <Streamdown
      plugins={{ code, cjk }}
      components={components}
    >
      {processed}
    </Streamdown>
  );
}
