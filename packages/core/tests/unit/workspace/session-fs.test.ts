import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSessionFsContext,
  ensureSessionWorkspace,
  getSessionWorkspacePath,
  getWorkingDirectory,
  runWithSessionFs,
  sanitizeSessionId,
} from '../../../src/workspace/session-fs.js';
import {
  isPathAllowed,
  _resetAllowedRoots,
  setAllowedRoots,
} from '../../../src/tools/built-in/utils/security.js';

describe('session workspace', () => {
  const prevHome = process.env.HIVE_HOME;
  let hiveHome: string;

  beforeEach(() => {
    hiveHome = mkdtempSync(join(tmpdir(), 'hive-home-'));
    process.env.HIVE_HOME = hiveHome;
    _resetAllowedRoots();
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HIVE_HOME;
    else process.env.HIVE_HOME = prevHome;
    _resetAllowedRoots();
    rmSync(hiveHome, { recursive: true, force: true });
  });

  it('sanitizes session ids for path safety', () => {
    expect(sanitizeSessionId('../evil/../x')).toBe('.._evil_.._x');
  });

  it('creates workspace under HIVE_HOME/sessions/<id>/workspace', () => {
    const dir = ensureSessionWorkspace('chat-abc');
    expect(dir).toBe(join(hiveHome, 'sessions', 'chat-abc', 'workspace'));
    expect(existsSync(dir)).toBe(true);
    expect(getSessionWorkspacePath('chat-abc')).toBe(dir);
  });

  it('getWorkingDirectory follows ALS context', async () => {
    const ctx = createSessionFsContext('s1');
    expect(getWorkingDirectory()).toBe(process.cwd());
    await runWithSessionFs(ctx, async () => {
      expect(getWorkingDirectory()).toBe(ctx.workspaceDir);
    });
    expect(getWorkingDirectory()).toBe(process.cwd());
  });

  it('write jail is session workspace; read can reach repo cwd', async () => {
    const ctx = createSessionFsContext('s2');
    const repoFile = join(process.cwd(), 'README.md');
    const wsFile = join(ctx.workspaceDir, 'out.txt');
    writeFileSync(wsFile, 'ok');

    await runWithSessionFs(ctx, async () => {
      expect(isPathAllowed(wsFile, 'write')).toBe(true);
      expect(isPathAllowed(repoFile, 'write')).toBe(false);
      expect(isPathAllowed(wsFile, 'read')).toBe(true);
      // README may or may not exist; path allowance should still pass for cwd root
      expect(isPathAllowed(join(process.cwd(), 'anything.txt'), 'read')).toBe(true);
    });
  });

  it('without session context, write falls back to allowed roots', () => {
    setAllowedRoots(['/tmp/test-workspace']);
    expect(isPathAllowed('/tmp/test-workspace/a.txt', 'write')).toBe(true);
    expect(isPathAllowed('/etc/passwd', 'write')).toBe(false);
  });
});
