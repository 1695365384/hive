import { useMemo, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { usePreviewStore } from "../stores/preview-store";
import { detectPreviews, candidateToPreview } from "./preview/detect-preview";

// Import highlight.js theme (GitHub Dark compatible)
import "highlight.js/styles/github-dark.css";

interface TextBlockProps {
  text: string;
  sourceMessageId?: string;
  autoPreview?: boolean;
}

/**
 * Convert [File: name.ext (size)] /path/to/file → markdown link.
 * The server serves files at /files/<filename>.
 */
function preprocessFileLinks(text: string): string {
  return text.replace(
    /\[File: ([^\]]+)\] (\/[^\s<]+)/g,
    (_match, name, fullPath) => {
      const fileName = fullPath.split("/").pop() || fullPath;
      return `[${name}](http://127.0.0.1:4450/files/${fileName})`;
    }
  );
}

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

  if (!text) return null;

  return (
    <div className="px-4 py-2.5 rounded-2xl rounded-tl-md bg-stone-900/50 border border-stone-800/50">
      <div className="text-sm text-stone-300 leading-relaxed [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_table]:w-full [&_th]:text-left [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:bg-stone-800/50 [&_tr]:border-b [&_tr]:border-stone-800 [&_a]:text-amber-400/80 [&_a:hover]:text-amber-300 [&_a]:underline [&_a]:underline-offset-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-stone-800 [&_code]:text-amber-400/90 [&_code]:text-[13px] [&_code]:font-mono [&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:bg-stone-950 [&_pre]:border [&_pre]:border-stone-800 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-stone-200 [&_pre_code]:text-[13px] [&_pre_code]:leading-relaxed [&_pre_code]:border-0 [&_pre_code_span]:bg-transparent [&_img]:rounded-lg [&_img]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-stone-700 [&_blockquote]:pl-3 [&_blockquote]:text-stone-500 [&_blockquote]:italic [&_hr]:border-stone-800 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-stone-100 [&_h1]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-stone-100 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-stone-200 [&_h3]:mt-2 [&_h4]:text-sm [&_h4]:text-stone-300 [&_h4]:mt-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = className?.startsWith("language-");
              const lang = className?.replace("language-", "") || "";
              const content = String(children);

              if (isBlock && (lang === "html" || lang === "svg") && sourceMessageId) {
                return (
                  <div className="group relative">
                    <pre className={className}>
                      <code {...props}>{children}</code>
                    </pre>
                    <button
                      onClick={() => {
                        const candidates = detectPreviews(
                          "```" + lang + "\n" + content.replace(/\n$/, "") + "\n```"
                        );
                        if (candidates.length > 0) {
                          openFor(candidateToPreview(candidates[0], sourceMessageId));
                        }
                      }}
                      className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 opacity-0 group-hover:opacity-100 hover:bg-amber-500/30 transition-all duration-200"
                    >
                      ▶ Preview
                    </button>
                  </div>
                );
              }

              if (isBlock) {
                return (
                  <pre className={className}>
                    <code {...props}>{children}</code>
                  </pre>
                );
              }

              return <code {...props}>{children}</code>;
            },
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    </div>
  );
}
