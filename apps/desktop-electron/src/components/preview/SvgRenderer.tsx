import { useMemo } from "react";

interface SvgRendererProps {
  content: string;
}

/**
 * Render SVG content inline with security precautions.
 * - Strip <script> tags from SVG
 * - Render via dangerouslySetInnerHTML in a controlled container
 * - Scale to fit container width
 */
export function SvgRenderer({ content }: SvgRendererProps) {
  const sanitized = useMemo(() => sanitizeSvg(content), [content]);

  return (
    <div
      className="w-full flex items-start justify-center p-4 rounded-lg border border-stone-800 bg-white"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

/**
 * Basic SVG sanitization — remove script tags and event handlers.
 */
function sanitizeSvg(svg: string): string {
  let cleaned = svg;

  // Remove <script> ... </script>
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove on* event handler attributes
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

  // Remove javascript: URLs
  cleaned = cleaned.replace(/\s*href\s*=\s*["']\s*javascript\s*:/gi, ' href="#"');

  return cleaned;
}
