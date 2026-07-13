import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stageArtifactFile, getArtifactTempDir } from '../../src/gateway/artifact-staging.js';

describe('artifact-staging', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-stage-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stages external files into temp dir with stable src per session', async () => {
    const source = path.join(tmpDir, 'demo.pptx');
    fs.writeFileSync(source, 'pptx-bytes');
    const sessionId = 'ws-chat:test-thread';

    const first = await stageArtifactFile(sessionId, source);
    expect(first).not.toBeNull();
    expect(first!.src).toMatch(/^\/files\//);
    expect(first!.name).toBe('demo.pptx');

    fs.writeFileSync(source, 'updated-pptx');
    const second = await stageArtifactFile(sessionId, source);
    expect(second!.src).toBe(first!.src);
    expect(fs.readFileSync(path.join(getArtifactTempDir(), second!.src.replace('/files/', '')), 'utf-8')).toBe('updated-pptx');
  });
});
