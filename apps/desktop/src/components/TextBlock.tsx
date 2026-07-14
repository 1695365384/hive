import { memo, useMemo, isValidElement } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown, CodeBlock } from "streamdown";
import type { Components } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { usePreviewStore } from "../stores/preview-store";
import { detectPreviews, candidateToPreview } from "./preview/detect-preview";
import { preprocessFileLinks } from "../lib/preprocess-file-links";

export interface TextBlockProps {
  text: string;
  sourceMessageId?: string;
  /** @deprecated Preview is always user-initiated; kept for call-site compat */
  autoPreview?: boolean;
  isStreaming?: boolean;
}

function TextBlockInner({ text, sourceMessageId, isStreaming }: TextBlockProps) {
  const { t } = useTranslation();
  const openFor = usePreviewStore((s) => s.openFor);

  // Preview is opt-in via the Preview button on code blocks / attachments.
  const processed = useMemo(() => preprocessFileLinks(text), [text]);

  const previewComponents: Components = useMemo(
    () => ({
      code({
        className,
        children,
        ...props
      }: {
        className?: string;
        children?: React.ReactNode;
      }) {
        const isBlock = className?.startsWith("language-");
        const lang = (className?.replace("language-", "") || "").toLowerCase();

        if (!isBlock) {
          return <code {...props}>{children}</code>;
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
                {t("preview.button")}
              </button>
            </div>
          );
        }

        return <CodeBlock code={codeText} language={lang} />;
      },
    }),
    [openFor, sourceMessageId, t]
  );

  if (!text) return null;

  return (
    <Streamdown
      className="md-body"
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={isStreaming}
      plugins={{ code, cjk }}
      components={previewComponents}
    >
      {processed}
    </Streamdown>
  );
}

export const TextBlock = memo(TextBlockInner);
