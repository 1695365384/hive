import type { Preview } from "../../stores/preview-store";

const PREVIEWABLE_LANGUAGES = new Set(["html", "svg"]);

const FENCED_BLOCK_RE = /```(\w+)\n([\s\S]*?)```/g;

export interface PreviewCandidate {
  language: string;
  content: string;
  title: string;
  index: number; // occurrence order in text
}

/**
 * Scan text for fenced code blocks that are previewable (html/svg).
 * Returns all candidates with their content and position.
 */
export function detectPreviews(text: string): PreviewCandidate[] {
  const candidates: PreviewCandidate[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const lang = match[1].toLowerCase();
    const content = match[2];

    if (PREVIEWABLE_LANGUAGES.has(lang)) {
      const title = extractTitle(lang, content);
      candidates.push({ language: lang, content, title, index: idx++ });
    }
  }

  return candidates;
}

/**
 * Extract a human-readable title from a fenced block.
 * Supports: ```html:filename.html or ```html\n<!-- title: ... -->
 */
function extractTitle(lang: string, content: string): string {
  // First line could be a comment with a title
  const firstLine = content.trimStart().split("\n")[0]?.trim();
  if (firstLine) {
    const titleMatch = firstLine.match(/<!--\s*title:\s*(.+?)\s*-->/i);
    if (titleMatch) return titleMatch[1];

    // If first line is HTML comment or empty-ish, use generic title
    if (firstLine.startsWith("<!--")) return `index.${lang}`;
  }

  return `index.${lang}`;
}

/**
 * Check if a filename has a previewable extension (.html / .htm / .svg).
 */
export type PreviewFileType = "html" | "svg" | "ppt" | "doc" | "pdf" | "xlsx";

export function isPreviewableFile(name: string): PreviewFileType | null {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".svg") return "svg";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".pptx") return "ppt";
  if (ext === ".docx") return "doc";
  if (ext === ".pdf") return "pdf";
  if (ext === ".xlsx") return "xlsx";
  return null;
}

/**
 * Convert a PreviewCandidate into a Preview store object.
 */
export function candidateToPreview(
  candidate: PreviewCandidate,
  sourceMessageId: string
): Preview {
  return {
    id: `${sourceMessageId}-${candidate.index}`,
    title: candidate.title,
    type: candidate.language as "html" | "svg",
    content: candidate.content,
    sourceMessageId,
  };
}
