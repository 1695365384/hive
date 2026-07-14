import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskTraceCollector } from '../../../src/agents/completion/TaskTrace.js';

describe('TaskTraceCollector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.hive-trace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recordArtifactsFromToolCall captures send-file path from Worker', () => {
    const pptx = path.join(tmpDir, '项目汇报示例.pptx');
    fs.writeFileSync(pptx, 'fake');

    const collector = new TaskTraceCollector('做 8 页 PPT');
    collector.recordArtifactsFromToolCall(
      'send-file',
      { filePath: pptx },
      'Sent file: 项目汇报示例.pptx',
    );

    expect(collector.getTrace().artifacts).toContain(pptx);
  });

  it('extractArtifactsFromValue finds CJK paths in agent output', () => {
    const collector = new TaskTraceCollector();
    collector.recordToolResult('agent', `Delivered ${path.join(tmpDir, '汇报.pptx')}`);
    expect(collector.getTrace().artifacts.some(p => p.endsWith('汇报.pptx'))).toBe(true);
  });
});
