import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectArtifactsFromToolCall,
  extractArtifactPathsFromText,
  isArtifactExtension,
  isChatAutoEmitPath,
  shouldEmitArtifactToChat,
} from '../../../src/artifacts/artifact-detector.js';

describe('artifact-detector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.hive-artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isArtifactExtension recognizes office deliverables', () => {
    expect(isArtifactExtension('report.pptx')).toBe(true);
    expect(isArtifactExtension('notes.txt')).toBe(false);
  });

  it('chat auto-emit keeps Office/PDF and drops screenshots', () => {
    expect(isChatAutoEmitPath('deck.pptx')).toBe(true);
    expect(isChatAutoEmitPath('report.pdf')).toBe(true);
    expect(isChatAutoEmitPath('slide1.png')).toBe(false);
    expect(isChatAutoEmitPath('slide2_preview.png')).toBe(false);
    expect(isChatAutoEmitPath('deck.pptx.preview.html')).toBe(false);
    expect(shouldEmitArtifactToChat('officecli', '/tmp/slide1.png')).toBe(false);
    expect(shouldEmitArtifactToChat('officecli', '/tmp/deck.pptx')).toBe(true);
    expect(shouldEmitArtifactToChat('send-file', '/tmp/slide1.png')).toBe(true);
  });

  it('extractArtifactPathsFromText finds paths in tool output', () => {
    const text = 'Saved to /tmp/demo.pptx and backup at ./out/report.docx';
    const paths = extractArtifactPathsFromText(text);
    expect(paths.some(p => p.endsWith('demo.pptx'))).toBe(true);
    expect(paths.some(p => p.endsWith('report.docx'))).toBe(true);
  });

  it('extractArtifactPathsFromText finds CJK filenames', () => {
    const text = '已保存 /Users/me/.hive/workspace/项目汇报示例.pptx';
    const paths = extractArtifactPathsFromText(text);
    expect(paths.some(p => p.endsWith('项目汇报示例.pptx'))).toBe(true);
  });

  it('detectArtifactsFromToolCall finds send-file with CJK path', () => {
    const pptx = path.join(tmpDir, '项目汇报示例.pptx');
    fs.writeFileSync(pptx, 'fake');

    const found = detectArtifactsFromToolCall(
      'send-file',
      { filePath: pptx },
      'Sent file: 项目汇报示例.pptx',
    );
    expect(found).toContain(pptx);
  });

  it('detectArtifactsFromToolCall finds bash officecli create target', () => {
    const pptx = path.join(tmpDir, 'deck.pptx');
    fs.writeFileSync(pptx, 'fake');

    const found = detectArtifactsFromToolCall(
      'bash',
      { command: `officecli create ${pptx}` },
      'created',
    );
    expect(found).toContain(pptx);
  });

  it('detectArtifactsFromToolCall finds MCP officecli create (no officecli prefix)', () => {
    const pptx = path.join(tmpDir, 'mcp-deck.pptx');
    fs.writeFileSync(pptx, 'fake');

    const found = detectArtifactsFromToolCall(
      'officecli',
      { command: `create ${pptx}` },
      'ok',
    );
    expect(found).toContain(pptx);
  });

  it('detectArtifactsFromToolCall finds MCP officecli argv array + add target', () => {
    const pptx = path.join(tmpDir, 'add-deck.pptx');
    fs.writeFileSync(pptx, 'fake');

    const found = detectArtifactsFromToolCall(
      'officecli',
      { command: ['add', pptx, '/', '--type', 'slide'] },
      'ok',
    );
    expect(found).toContain(pptx);
  });

  it('detectArtifactsFromToolCall finds screenshot -o output (trace only; not chat auto-emit)', () => {
    const pptx = path.join(tmpDir, 'shot.pptx');
    const png = path.join(tmpDir, 'slide1.png');
    fs.writeFileSync(pptx, 'fake');
    fs.writeFileSync(png, 'fake-png');

    const found = detectArtifactsFromToolCall(
      'officecli',
      { command: `view ${pptx} screenshot -o ${png}` },
      'written',
    );
    expect(found).toContain(png);
    expect(found).toContain(pptx);
    expect(shouldEmitArtifactToChat('officecli', png)).toBe(false);
    expect(shouldEmitArtifactToChat('officecli', pptx)).toBe(true);
  });

  it('detectArtifactsFromToolCall finds send-file path', () => {
    const pptx = path.join(tmpDir, 'final.pptx');
    fs.writeFileSync(pptx, 'fake');

    const found = detectArtifactsFromToolCall(
      'send-file',
      { filePath: pptx },
      'Sent file: final.pptx',
    );
    expect(found).toContain(pptx);
  });
});
