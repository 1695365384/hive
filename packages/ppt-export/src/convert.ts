import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateChartSlide } from './chart.js';
import { mergePptx } from './merge.js';
import type { ChartConfig } from './chart.js';

const execFileAsync = promisify(execFile);

export interface ConvertOptions {
  charts?: boolean;
  fonts?: string;
}

interface ChartSlot {
  slideIndex: number;
  config: ChartConfig;
}

function extractChartSlots(html: string): { cleanedHtml: string; charts: ChartSlot[] } {
  const charts: ChartSlot[] = [];
  let cleanedHtml = html;

  // Match data-chart with single-quoted values.
  // JSON uses double quotes internally, so single-quoted HTML attrs work safely:
  //   data-chart='{"type":"bar","series":[1,2]}'
  const sqRegex = /<div[^>]*\bdata-chart\s*=\s*'([^']*)'[^>]*>/gi;
  const matches: Array<{ start: number; end: number; json: string }> = [];

  sqRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = sqRegex.exec(html)) !== null) {
    const divStart = match.index;
    const jsonStr = match[1];
    const searchStart = divStart + match[0].length;
    let depth = 1;
    let divEnd = searchStart;

    const tagRegex = /<\/div>|<div[^>]*>/gi;
    tagRegex.lastIndex = searchStart;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      if (tagMatch[0].startsWith('</div')) depth--;
      else depth++;
      if (depth === 0) { divEnd = tagMatch.index + tagMatch[0].length; break; }
    }
    if (divEnd > 0) {
      matches.push({ start: divStart, end: divEnd, json: jsonStr });
    }
  }

  // Process in reverse order to preserve positions
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    try {
      const config: ChartConfig = JSON.parse(m.json);
      if (config.type && config.categories && config.series) {
        charts.push({ slideIndex: charts.length, config });
      }
    } catch {
      continue;
    }
    cleanedHtml =
      cleanedHtml.slice(0, m.start) +
      '<div style="display:none"></div>' +
      cleanedHtml.slice(m.end);
  }

  charts.reverse();
  return { cleanedHtml, charts };
}

async function resolveExporterBin(): Promise<string> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const localBin = resolve(currentDir, '../node_modules/.bin/dom-to-pptx-exporter');
  try {
    await access(localBin);
    return localBin;
  } catch {
    return 'dom-to-pptx-exporter';
  }
}

export async function convertHtmlToPptx(
  htmlPath: string,
  pptxPath: string,
  options: ConvertOptions = {},
): Promise<void> {
  try {
    await access(htmlPath);
  } catch {
    throw new ConvertError(`HTML file not found: ${htmlPath}`, 1);
  }

  const absHtmlPath = resolve(htmlPath);
  const absPptxPath = resolve(pptxPath);
  const exporterBin = await resolveExporterBin();

  let chartSlots: ChartSlot[] = [];
  let workingDir: string | null = null;

  if (options.charts) {
    const htmlContent = await readFile(absHtmlPath, 'utf-8');
    const result = extractChartSlots(htmlContent);
    chartSlots = result.charts;

    if (chartSlots.length > 0) {
      workingDir = await mkdtemp(join(tmpdir(), 'hive-ppt-'));
      const cleanedPath = join(workingDir, 'deck.html');
      await writeFile(cleanedPath, result.cleanedHtml, 'utf-8');

      const textSlidesPath = join(workingDir, 'text-slides.pptx');
      try {
        const { stderr } = await execFileAsync(
          exporterBin,
          [cleanedPath, '--output', textSlidesPath],
          { timeout: 60_000 },
        );
        if (stderr) console.error(stderr);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
          throw new ConvertError('dom-to-pptx timeout on text slides', 2);
        }
        throw new ConvertError(`dom-to-pptx failed: ${msg}`, 3);
      }

      const chartPaths: string[] = [];
      for (let i = 0; i < chartSlots.length; i++) {
        const chartPath = join(workingDir, `chart-${i}.pptx`);
        const configPath = join(workingDir, `chart-${i}.json`);
        await writeFile(configPath, JSON.stringify(chartSlots[i].config), 'utf-8');
        await generateChartSlide(configPath, chartPath);
        chartPaths.push(chartPath);
      }

      try {
        await mergePptx(textSlidesPath, chartPaths, absPptxPath);
      } catch {
        await writeFile(absPptxPath, await readFile(textSlidesPath));
        console.error(
          `Warning: chart merge failed — ${chartPaths.length} chart slide(s) were not included.`,
        );
      }
    }
  }

  if (!options.charts || chartSlots.length === 0) {
    try {
      const { stderr } = await execFileAsync(
        exporterBin,
        [absHtmlPath, '--output', absPptxPath],
        { timeout: 60_000 },
      );
      if (stderr) console.error(stderr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        throw new ConvertError('dom-to-pptx timeout: HTML too complex or network hang', 2);
      }
      throw new ConvertError(`Conversion failed: ${msg}`, 3);
    }
  }

  if (workingDir) {
    try { await rm(workingDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

export class ConvertError extends Error {
  constructor(message: string, public readonly exitCode: number) {
    super(message);
    this.name = 'ConvertError';
  }
}
