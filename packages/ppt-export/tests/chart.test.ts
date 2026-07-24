import { describe, it, expect } from 'vitest';
import { generateChartSlide, ChartError } from '../src/chart.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('generateChartSlide', () => {
  let tmpDir: string;

  // Use a test-scoped temp dir
  const getTmpDir = () => resolve(tmpdir(), `hive-test-${randomUUID()}`);

  it('throws ChartError for missing config file', async () => {
    await expect(generateChartSlide('/nonexistent/chart.json', '/tmp/out.pptx')).rejects.toThrow(ChartError);
    try {
      await generateChartSlide('/nonexistent/chart.json', '/tmp/out.pptx');
    } catch (e) {
      expect(e).toBeInstanceOf(ChartError);
      expect((e as ChartError).exitCode).toBe(1);
      expect((e as ChartError).message).toContain('Chart config file not found');
    }
  });

  it('throws ChartError for invalid JSON', async () => {
    tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const configPath = resolve(tmpDir, 'bad.json');
    await writeFile(configPath, 'not valid json {{{', 'utf-8');

    try {
      await generateChartSlide(configPath, resolve(tmpDir, 'out.pptx'));
    } catch (e) {
      expect(e).toBeInstanceOf(ChartError);
      expect((e as ChartError).exitCode).toBe(1);
      expect((e as ChartError).message).toContain('Invalid chart config JSON');
    }

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('throws ChartError for unsupported chart type', async () => {
    tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const configPath = resolve(tmpDir, 'bad-type.json');
    await writeFile(configPath, JSON.stringify({
      type: 'waterfall',
      categories: ['A'],
      series: [1],
    }), 'utf-8');

    try {
      await generateChartSlide(configPath, resolve(tmpDir, 'out.pptx'));
    } catch (e) {
      expect(e).toBeInstanceOf(ChartError);
      expect((e as ChartError).exitCode).toBe(2);
      expect((e as ChartError).message).toContain('Unknown chart type');
      expect((e as ChartError).message).toContain('waterfall');
    }

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('generates a bar chart PPTX', async () => {
    tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const configPath = resolve(tmpDir, 'bar.json');
    const outputPath = resolve(tmpDir, 'bar.pptx');

    await writeFile(configPath, JSON.stringify({
      type: 'bar',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [120, 245, 178, 310],
      title: 'Test Bar Chart',
    }), 'utf-8');

    await generateChartSlide(configPath, outputPath);

    // Verify output exists and is non-trivial
    const { stat } = await import('node:fs/promises');
    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(1000); // at least 1KB

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('generates a multi-series line chart', async () => {
    tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const configPath = resolve(tmpDir, 'line.json');
    const outputPath = resolve(tmpDir, 'line.pptx');

    await writeFile(configPath, JSON.stringify({
      type: 'line',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'Revenue', values: [100, 150, 200] },
        { name: 'Cost', values: [80, 90, 110] },
      ],
      title: 'Multi-Series Line',
    }), 'utf-8');

    await generateChartSlide(configPath, outputPath);

    const { stat } = await import('node:fs/promises');
    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(1000);

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('generates all supported chart types', async () => {
    const types = ['bar', 'line', 'pie', 'scatter', 'area', 'radar', 'doughnut'] as const;

    for (const type of types) {
      tmpDir = getTmpDir();
      await mkdir(tmpDir, { recursive: true });
      const configPath = resolve(tmpDir, `${type}.json`);
      const outputPath = resolve(tmpDir, `${type}.pptx`);

      await writeFile(configPath, JSON.stringify({
        type,
        categories: ['A', 'B', 'C'],
        series: [10, 20, 30],
        title: `Test ${type}`,
      }), 'utf-8');

      await expect(generateChartSlide(configPath, outputPath)).resolves.not.toThrow();

      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
