/**
 * CompletionVerifier 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompletionVerifierService } from '../../../src/agents/completion/CompletionVerifier.js';
import { officeCompletionVerifier } from '../../../src/agents/completion/verifiers/office.js';
import { scheduleCompletionVerifier } from '../../../src/agents/completion/verifiers/schedule.js';
import { genericCompletionVerifier } from '../../../src/agents/completion/verifiers/generic.js';
import { FAKE_CHART_PREFIX, LAYOUT_ISSUES_PREFIX } from '../../../src/agents/completion/office-visual-contract.js';
import type { TaskTrace } from '../../../src/agents/completion/types.js';
import { buildPptxFixture } from './pptx-fixture.js';

function trace(overrides: Partial<TaskTrace>): TaskTrace {
  return {
    task: '',
    toolCalls: [],
    workerSpawns: [],
    artifacts: [],
    responseText: '',
    ...overrides,
  };
}

describe('officeCompletionVerifier', () => {
  it('matches office document tasks', () => {
    expect(officeCompletionVerifier.match(trace({ task: '做一个 PPT' }))).toBe(true);
    expect(officeCompletionVerifier.match(trace({ task: 'hello' }))).toBe(false);
  });

  it('fails when office worker was not spawned', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PowerPoint deck',
      toolCalls: [{ toolName: 'agent', input: { type: 'general' } }],
    }));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('office Worker');
  });

  it('fails when office worker spawned but no artifact delivered', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PPT',
      toolCalls: [{ toolName: 'agent', input: { type: 'office' } }],
      workerSpawns: [{ workerType: 'office' }],
    }));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('send-file');
  });

  it('fails when artifact path is missing on disk', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PPT',
      workerSpawns: [{ workerType: 'office' }],
      artifacts: ['/tmp/definitely-missing-hive-test.pptx'],
    }));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('fails when only screenshots exist (no Office document)', async () => {
    const dir = join(tmpdir(), `hive-completion-png-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const png = join(dir, 'slide1.png');
    await writeFile(png, 'fake-png');

    try {
      const result = await officeCompletionVerifier.verify(trace({
        task: 'Create a PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [png],
      }));
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/Screenshots alone|send-file/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('passes when artifact exists on disk', async () => {
    const dir = join(tmpdir(), `hive-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'deck.pptx');
    await writeFile(file, 'fake');

    try {
      const result = await officeCompletionVerifier.verify(trace({
        task: 'Create a PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [file],
      }));
      expect(result.passed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('visual contract', () => {
    let root = '';
    let bare = '';
    let withMedia = '';
    let withChart = '';

    beforeAll(async () => {
      root = join(tmpdir(), `hive-completion-visual-${Date.now()}`);
      await mkdir(root, { recursive: true });
      bare = await buildPptxFixture(root, 'bare', { slides: 2 });
      withMedia = await buildPptxFixture(root, 'media', { slides: 2, media: true });
      withChart = await buildPptxFixture(root, 'chart', { slides: 2, charts: true });
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('fails FAKE_CHART when data intent and no media', async () => {
      const result = await officeCompletionVerifier.verify(trace({
        task: '做一份带 KPI 趋势数据的 PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [bare],
      }));
      expect(result.passed).toBe(false);
      expect(result.message).toContain(FAKE_CHART_PREFIX);
    });

    it('fails FAKE_CHART when unzip cannot inspect pptx', async () => {
      const junk = join(root, 'junk.pptx');
      await writeFile(junk, 'not-a-zip');
      const result = await officeCompletionVerifier.verify(trace({
        task: '做一份带 KPI 数据的 PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [junk],
      }));
      expect(result.passed).toBe(false);
      expect(result.message).toContain(FAKE_CHART_PREFIX);
      expect(result.message).toMatch(/Could not inspect/i);
    });

    it('passes data intent when media present', async () => {
      const result = await officeCompletionVerifier.verify(trace({
        task: '做一份带 KPI 趋势数据的 PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [withMedia],
      }));
      expect(result.passed).toBe(true);
    });

    it('passes data intent when chart present without media', async () => {
      const result = await officeCompletionVerifier.verify(trace({
        task: '做一份带数据图表的 PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [withChart],
      }));
      expect(result.passed).toBe(true);
    });

    it('does not require media for non-data agenda PPT', async () => {
      const result = await officeCompletionVerifier.verify(trace({
        task: '纯文字提纲议程 PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [bare],
      }));
      expect(result.passed).toBe(true);
    });

    it('fails LAYOUT_ISSUES when view output reports overlap', async () => {
      const result = await officeCompletionVerifier.verify(trace({
        task: 'Create a PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [withMedia],
        toolCalls: [{
          toolName: 'bash',
          input: { command: 'officecli view deck.pptx issues' },
          output: 'Found overlap on slide 1',
        }],
      }));
      expect(result.passed).toBe(false);
      expect(result.message).toContain(LAYOUT_ISSUES_PREFIX);
    });
  });

  it.skip('office.md forbids fake colored-rectangle charts' /* AgentLoop: office.md merged into agent-system.md */, async () => {
    const md = await readFile(
      new URL('../../../src/agents/prompts/templates/office.md', import.meta.url),
      'utf8',
    );
    expect(md.toLowerCase()).not.toContain('colored rectangles as bars');
    expect(md).toMatch(/Visual contract|真 chart|picture/i);
    expect(md).toMatch(/Layout slots/i);
  });
});

describe('scheduleCompletionVerifier', () => {
  it('fails when schedule worker was not spawned', async () => {
    const result = await scheduleCompletionVerifier.verify(trace({
      task: '每天早上 9 点提醒我喝水',
      toolCalls: [{ toolName: 'agent', input: { type: 'general' } }],
    }));
    expect(result.passed).toBe(false);
  });

  it('passes when schedule worker spawned', async () => {
    const result = await scheduleCompletionVerifier.verify(trace({
      task: 'Set up a daily cron reminder',
      workerSpawns: [{ workerType: 'schedule' }],
    }));
    expect(result.passed).toBe(true);
  });
});

describe('genericCompletionVerifier', () => {
  it('passes conversational greetings without tools', async () => {
    const result = await genericCompletionVerifier.verify(
      trace({ task: '你好', responseText: '你好！有什么可以帮你的？' }),
    );
    expect(result.passed).toBe(true);
  });

  it('fails actionable promise-only responses', async () => {
    const result = await genericCompletionVerifier.verify(
      trace({
        task: '帮我实现一个登录页面',
        responseText: '我会马上开始实现。',
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('passes actionable tasks with worker activity', async () => {
    const result = await genericCompletionVerifier.verify(
      trace({
        task: '实现登录页面',
        responseText: '已完成基础页面。',
        workerSpawns: [{ workerType: 'general', description: 'build login' }],
      }),
    );
    expect(result.passed).toBe(true);
  });
});

describe('CompletionVerifierService', () => {
  it('skips specialized verifiers for unrelated tasks when only specialized are registered', async () => {
    const service = new CompletionVerifierService({
      verifiers: [officeCompletionVerifier, scheduleCompletionVerifier],
    });
    const result = await service.verify(trace({ task: '你好' }));
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('falls back to generic verifier by default', async () => {
    const service = new CompletionVerifierService();
    const result = await service.verify(
      trace({
        task: '帮我修复这个 bug',
        responseText: '我稍后会处理。',
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.results[0]?.verifierId).toBe('generic');
  });
});
