import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectArtifactsFromToolCall,
  extractArtifactPathsFromText,
  isArtifactExtension,
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

  it('extractArtifactPathsFromText finds paths in tool output', () => {
    const text = 'Saved to /tmp/demo.pptx and backup at ./out/report.docx';
    const paths = extractArtifactPathsFromText(text);
    expect(paths.some(p => p.endsWith('demo.pptx'))).toBe(true);
    expect(paths.some(p => p.endsWith('report.docx'))).toBe(true);
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
