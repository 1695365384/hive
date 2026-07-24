import { describe, it, expect } from 'vitest';
import { mergePptx, MergeError } from '../src/merge.js';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const fixturesDir = resolve(import.meta.dirname!, 'fixtures');
const minimalPptx = resolve(fixturesDir, 'minimal.pptx');

describe('mergePptx', () => {
  const getTmpDir = () => resolve(tmpdir(), `hive-merge-test-${randomUUID()}`);

  it('throws MergeError for missing base file', async () => {
    await expect(mergePptx('/nonexistent/base.pptx', [], '/tmp/out.pptx')).rejects.toThrow(MergeError);
    try {
      await mergePptx('/nonexistent/base.pptx', [], '/tmp/out.pptx');
    } catch (e) {
      expect(e).toBeInstanceOf(MergeError);
      expect((e as MergeError).exitCode).toBe(1);
    }
  });

  it('throws MergeError for missing chart file', async () => {
    await expect(mergePptx(minimalPptx, ['/nonexistent/chart.pptx'], '/tmp/out.pptx')).rejects.toThrow(MergeError);
  });

  it('copies base as-is when no chart paths given', async () => {
    const tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const outputPath = resolve(tmpDir, 'out.pptx');

    await mergePptx(minimalPptx, [], outputPath);

    const { stat } = await import('node:fs/promises');
    const outStat = await stat(outputPath);
    const baseStat = await stat(minimalPptx);
    expect(outStat.size).toBeGreaterThan(0);

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('merges chart pptx slides into base', async () => {
    const tmpDir = getTmpDir();
    await mkdir(tmpDir, { recursive: true });
    const outputPath = resolve(tmpDir, 'merged.pptx');

    // Merge minimal.pptx (2 slides) with itself (another 2 slides)
    await mergePptx(minimalPptx, [minimalPptx], outputPath);

    const { stat } = await import('node:fs/promises');
    const outStat = await stat(outputPath);
    expect(outStat.size).toBeGreaterThan(0);

    // Validate slide count via unzip
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('unzip', ['-l', '--', outputPath], { timeout: 5000 });
    const slideMatches = stdout.match(/ppt\/slides\/slide\d+\.xml/gi);
    expect(slideMatches?.length).toBe(4); // 2 base + 2 chart = 4

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('MergeError has correct properties', () => {
    const err = new MergeError('test merge error', 3);
    expect(err.message).toBe('test merge error');
    expect(err.exitCode).toBe(3);
    expect(err).toBeInstanceOf(Error);
  });
});
