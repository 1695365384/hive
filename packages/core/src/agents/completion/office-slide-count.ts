/**
 * PPTX zip inspection for completion verification (no officecli dependency).
 * One `unzip -l` yields slide count + chart/media presence.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PptxZipInfo {
  /** null if unzip failed or not a pptx */
  slideCount: number | null;
  hasChart: boolean;
  hasMedia: boolean;
  /** false when unzip failed / skipped */
  ok: boolean;
}

/** Parse "8页" / "8 页" / "8 slides" from user task */
export function extractExpectedSlideCount(task: string): number | null {
  const zh = task.match(/(\d+)\s*页/);
  if (zh) return Number.parseInt(zh[1], 10);
  const en = task.match(/(\d+)\s*(?:-)?\s*slides?\b/i);
  if (en) return Number.parseInt(en[1], 10);
  return null;
}

/** Single unzip -l pass: slides + visual media flags */
export async function inspectPptxZip(filePath: string): Promise<PptxZipInfo> {
  if (!filePath.toLowerCase().endsWith('.pptx')) {
    return { slideCount: null, hasChart: false, hasMedia: false, ok: false };
  }
  try {
    // `--` so paths starting with `-` are not parsed as unzip flags
    const { stdout } = await execFileAsync('unzip', ['-l', '--', filePath], { timeout: 15_000 });
    const matches = stdout.match(/ppt\/slides\/slide\d+\.xml/gi);
    return {
      slideCount: matches?.length ?? 0,
      hasChart: /ppt\/charts\//i.test(stdout),
      hasMedia: /ppt\/media\//i.test(stdout),
      ok: true,
    };
  } catch {
    return { slideCount: null, hasChart: false, hasMedia: false, ok: false };
  }
}

/** Count slides via unzip listing (ppt/slides/slideN.xml) */
export async function countPptxSlides(filePath: string): Promise<number | null> {
  const info = await inspectPptxZip(filePath);
  return info.ok ? info.slideCount : null;
}
