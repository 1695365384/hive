/**
 * PPTX slide counting for completion verification (no officecli dependency).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Parse "8页" / "8 页" / "8 slides" from user task */
export function extractExpectedSlideCount(task: string): number | null {
  const zh = task.match(/(\d+)\s*页/);
  if (zh) return Number.parseInt(zh[1], 10);
  const en = task.match(/(\d+)\s*(?:-)?\s*slides?\b/i);
  if (en) return Number.parseInt(en[1], 10);
  return null;
}

/** Count slides via unzip listing (ppt/slides/slideN.xml) */
export async function countPptxSlides(filePath: string): Promise<number | null> {
  if (!filePath.toLowerCase().endsWith('.pptx')) return null;
  try {
    const { stdout } = await execFileAsync('unzip', ['-l', filePath], { timeout: 15_000 });
    const matches = stdout.match(/ppt\/slides\/slide\d+\.xml/gi);
    return matches?.length ?? null;
  } catch {
    return null;
  }
}
