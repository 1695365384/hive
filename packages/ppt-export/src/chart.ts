import PptxGenJS from 'pptxgenjs';
import { readFile, writeFile, access } from 'node:fs/promises';

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'radar' | 'doughnut';
  categories: string[];
  series: number[] | Array<{ name: string; values: number[] }>;
  title?: string;
  width?: number; // inches, default 10
  height?: number; // inches, default 5.625
}

const SUPPORTED_TYPES = [
  'bar', 'line', 'pie', 'scatter', 'area', 'radar', 'doughnut',
] as const;

/** PptxGenJS CHART_NAME union — strings accepted by slide.addChart() */
type ChartName = 'area' | 'bar' | 'bar3D' | 'bubble' | 'doughnut' | 'line' | 'pie' | 'radar' | 'scatter';

/** Map our chart config types to PptxGenJS CHART_NAME */
function toChartName(type: ChartConfig['type']): ChartName {
  if (type === 'doughnut') return 'doughnut';
  if (type === 'radar') return 'radar';
  return type as ChartName; // bar, line, pie, scatter, area
}

/**
 * Generate a single-slide PPTX with a native OOXML chart from a JSON config file.
 */
export async function generateChartSlide(
  configPath: string,
  outputPath: string,
): Promise<void> {
  try {
    await access(configPath);
  } catch {
    throw new ChartError(`Chart config file not found: ${configPath}`, 1);
  }

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    throw new ChartError(`Cannot read chart config: ${configPath}`, 1);
  }

  let config: ChartConfig;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ChartError(
      `Invalid chart config JSON: ${err instanceof Error ? err.message : String(err)}`,
      1,
    );
  }

  if (!(SUPPORTED_TYPES as readonly string[]).includes(config.type)) {
    throw new ChartError(
      `Unknown chart type '${config.type}'. Supported: ${SUPPORTED_TYPES.join(', ')}`,
      2,
    );
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();

  // Build PptxGenJS chart data from config.
  // PptxGenJS v4 expects: Array<{ name: string; labels: string[]; values: number[] }>
  const chartData: Array<{ name: string; labels: string[]; values: number[] }> = [];

  if (Array.isArray(config.series) && typeof config.series[0] === 'number') {
    // Single series: number[]
    chartData.push({
      name: config.title || 'Series 1',
      labels: config.categories,
      values: config.series as number[],
    });
  } else {
    // Multiple series: { name, values }[]
    const multiSeries = config.series as Array<{ name: string; values: number[] }>;
    for (const s of multiSeries) {
      chartData.push({
        name: s.name,
        labels: config.categories,
        values: s.values,
      });
    }
  }

  slide.addChart(toChartName(config.type), chartData, {
    x: 0.5,
    y: 0.8,
    w: config.width ?? 9,
    h: config.height ?? 4.5,
    showTitle: !!config.title,
    title: config.title,
    catAxisLabelColor: '666666',
    valAxisLabelColor: '666666',
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  await writeFile(outputPath, Buffer.from(buffer as ArrayBuffer));
}

export class ChartError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'ChartError';
  }
}
