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

  // Auto-open preview when streaming content contains html/svg
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

  // Override code to:
  //   - Inline → custom amber styling
  //   - Fenced → use Streamdown's CodeBlock (full syntax highlighting, copy, download)
  //   - html/svg fenced → CodeBlock + Preview button overlay
  const components: Components = useMemo(
    () => ({
      code({ className, children, ...props }) {
        const isBlock = className?.startsWith("language-");
        const lang = (className?.replace("language-", "") || "").toLowerCase();

        // ---- Inline code ----
        if (!isBlock) {
          return (
            <code
              className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-400/90 text-[13px] font-mono before:content-none after:content-none"
              {...props}
            >
              {children}
            </code>
          );
        }

        // ---- Fenced code block ----
        // Extract raw code text from children (may be a React element or string)
        const rawContent = isValidElement(children)
          ? String((children as any).props?.children ?? "")
          : String(children ?? "");
        const codeText = rawContent.replace(/\n$/, "");

        // Previewable block (html/svg) → render CodeBlock + Preview button
        if (sourceMessageId && (lang === "html" || lang === "svg")) {
          return (
            <div className="group relative my-3">
              <CodeBlock code={codeText} language={lang} />
              <button
                onClick={() => {
                  const candidates = detectPreviews(
                    "```" + lang + "\n" + codeText + "\n```"
                  );
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

        // All other fenced code blocks → Streamdown's native CodeBlock
        return <CodeBlock code={codeText} language={lang} />;
      },

      // Blockquotes
      blockquote({ children, ...props }) {
        return (
          <blockquote
            className="border-l-2 border-stone-700 pl-4 my-3 text-stone-500 italic"
            {...props}
          >
            {children}
          </blockquote>
        );
      },

      // Horizontal rule
      hr(props) {
        return <hr className="border-stone-800 my-4" {...props} />;
      },
    }),
    [openFor, sourceMessageId]
  );

  if (!text) return null;

  return (
    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md bg-stone-900/50 border border-stone-800/50">
      <Streamdown
        plugins={{ code, cjk }}
        components={components}
        className="text-sm leading-relaxed text-stone-200"
      >
        {processed}
      </Streamdown>
    </div>
  );
}
