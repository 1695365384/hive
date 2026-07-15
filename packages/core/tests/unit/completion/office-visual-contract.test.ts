/**
 * office-visual-contract 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hasDataVisualIntent,
  pptxHasVisualMedia,
  findLayoutIssueInTrace,
  hasScannableViewOutput,
} from '../../../src/agents/completion/office-visual-contract.js';
import { inspectPptxZip } from '../../../src/agents/completion/office-slide-count.js';
import type { TaskTrace } from '../../../src/agents/completion/types.js';
import { buildPptxFixture } from './pptx-fixture.js';

function emptyTrace(overrides: Partial<TaskTrace> = {}): TaskTrace {
  return {
    task: '',
    toolCalls: [],
    workerSpawns: [],
    artifacts: [],
    responseText: '',
    ...overrides,
  };
}

describe('hasDataVisualIntent', () => {
  it('hits positive lexicon', () => {
    expect(hasDataVisualIntent('做一个带 KPI 趋势图表的 PPT')).toBe(true);
    expect(hasDataVisualIntent('Add a revenue chart')).toBe(true);
    expect(hasDataVisualIntent('展示同比增长数据')).toBe(true);
  });

  it('negative phrases win', () => {
    expect(hasDataVisualIntent('纯文字提纲 PPT 议程')).toBe(false);
    expect(hasDataVisualIntent('无数据的文字版标题页')).toBe(false);
  });

  it('does not treat bare percent as intent', () => {
    expect(hasDataVisualIntent('100%完成议程 PPT')).toBe(false);
  });

  it('plain create PPT is not data intent', () => {
    expect(hasDataVisualIntent('Create a PPT')).toBe(false);
  });
});

describe('inspectPptxZip / pptxHasVisualMedia', () => {
  let root = '';
  let bare = '';
  let withMedia = '';
  let withChart = '';

  beforeAll(async () => {
    root = join(tmpdir(), `hive-visual-${Date.now()}`);
    await mkdir(root, { recursive: true });
    bare = await buildPptxFixture(root, 'bare', { slides: 2 });
    withMedia = await buildPptxFixture(root, 'media', { slides: 2, media: true });
    withChart = await buildPptxFixture(root, 'chart', { slides: 2, charts: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('detects slides and media flags', async () => {
    const info = await inspectPptxZip(withMedia);
    expect(info.ok).toBe(true);
    expect(info.slideCount).toBe(2);
    expect(info.hasMedia).toBe(true);
    expect(info.hasChart).toBe(false);
  });

  it('pptxHasVisualMedia true for charts or media', async () => {
    expect(await pptxHasVisualMedia(bare)).toBe(false);
    expect(await pptxHasVisualMedia(withMedia)).toBe(true);
    expect(await pptxHasVisualMedia(withChart)).toBe(true);
  });

  it('returns null when unzip fails', async () => {
    const junk = join(root, 'junk.pptx');
    await writeFile(junk, 'not-a-zip');
    expect(await pptxHasVisualMedia(junk)).toBeNull();
  });
});

describe('layout scan from TaskTrace', () => {
  it('skips when no view output', () => {
    const t = emptyTrace({
      toolCalls: [{ toolName: 'bash', input: { command: 'ls' }, output: 'ok' }],
    });
    expect(hasScannableViewOutput(t)).toBe(false);
    expect(findLayoutIssueInTrace(t)).toBeNull();
  });

  it('ignores overlap in non-view tool output (no false positive)', () => {
    const t = emptyTrace({
      toolCalls: [{
        toolName: 'bash',
        input: { command: 'cat report.txt' },
        output: 'Found overlap on slide 1; 文字重叠',
      }],
    });
    expect(hasScannableViewOutput(t)).toBe(false);
    expect(findLayoutIssueInTrace(t)).toBeNull();
  });

  it('detects overlap in view output', () => {
    const t = emptyTrace({
      toolCalls: [{
        toolName: 'bash',
        input: { command: 'officecli view deck.pptx issues' },
        output: 'slide 2: text overlap with shape',
      }],
    });
    expect(hasScannableViewOutput(t)).toBe(true);
    expect(findLayoutIssueInTrace(t)).toMatch(/overlap/i);
  });

  it('detects Chinese layout tokens', () => {
    for (const token of ['重叠', '遮挡', '互相覆盖'] as const) {
      const t = emptyTrace({
        toolCalls: [{
          toolName: 'bash',
          input: { command: 'officecli view deck.pptx issues' },
          output: `问题: ${token} 在第2页`,
        }],
      });
      expect(findLayoutIssueInTrace(t)).toBe(token);
    }
  });

  it('ignores clean view output', () => {
    const t = emptyTrace({
      toolCalls: [{
        toolName: 'bash',
        input: { command: 'officecli view deck.pptx issues' },
        output: 'No issues found',
      }],
    });
    expect(findLayoutIssueInTrace(t)).toBeNull();
  });
});
