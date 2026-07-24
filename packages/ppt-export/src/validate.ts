import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export interface ValidateResult {
  pass: boolean;
  slideCount: number | null;
  hasChart: boolean;
  hasMedia: boolean;
  issues: string[];
}

interface ZipInfo {
  slideCount: number | null;
  hasChart: boolean;
  hasMedia: boolean;
  ok: boolean;
}

/** Inspect a PPTX zip for slide count, chart, and media presence via unzip -l */
async function inspectPptxZip(filePath: string): Promise<ZipInfo> {
  if (!filePath.toLowerCase().endsWith('.pptx')) {
    return { slideCount: null, hasChart: false, hasMedia: false, ok: false };
  }
  try {
    const { stdout } = await execFileAsync('unzip', ['-l', '--', filePath], {
      timeout: 15_000,
    });
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

/**
 * Validate a PPTX file: slide count, chart/media presence, basic health checks.
 */
export async function validatePptx(filePath: string): Promise<ValidateResult> {
  // Check file exists first
  try {
    await access(filePath);
  } catch {
    return {
      pass: false,
      slideCount: null,
      hasChart: false,
      hasMedia: false,
      issues: [`File not found: ${filePath}`],
    };
  }

  const info = await inspectPptxZip(filePath);
  if (!info.ok) {
    return {
      pass: false,
      slideCount: null,
      hasChart: false,
      hasMedia: false,
      issues: [`Failed to open pptx: ${filePath}`],
    };
  }

  const issues: string[] = [];

  if (info.slideCount === 0) {
    issues.push('0 slides in pptx');
  }

  if (info.slideCount !== null && info.slideCount > 50) {
    issues.push(`${info.slideCount} slides — unusually large deck`);
  }

  if (!info.hasChart && !info.hasMedia) {
    issues.push('No charts or media detected — text-only deck?');
  }

  return {
    pass: issues.length === 0,
    slideCount: info.slideCount,
    hasChart: info.hasChart,
    hasMedia: info.hasMedia,
    issues,
  };
}
